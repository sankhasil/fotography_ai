import type Database from "better-sqlite3"
import type { ChatModelAdapter, ChatModelRunResult } from "@assistant-ui/react-ink"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { AppConfig } from "../types.js"
import type { SessionManager } from "../sessions.js"
import { MemoryManager } from "../memory.js"
import { parseCommand } from "./commands.js"
import { route } from "../router.js"
import { classify } from "../classifier.js"
import { insertTask, updateTaskStatus, getSessionsByBackend } from "../db.js"
import { generateId, timestamp } from "../utils.js"
import type { Task } from "../types.js"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

interface SSEEvent {
  type: string
  properties: Record<string, unknown>
}

function textResult(text: string): ChatModelRunResult {
  return { content: [{ type: "text" as const, text }] }
}

export function createAdapter(
  db: Database.Database,
  config: AppConfig,
  sessionManager: SessionManager,
): ChatModelAdapter {
  const memory = new MemoryManager(db)

  return {
    async *run({ messages }) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage?.role !== "user") return

      const textPart = lastMessage.content.find(
        (p): p is { type: "text"; text: string } => p.type === "text",
      )
      const prompt = textPart?.text ?? ""

      const command = parseCommand(prompt)
      if (command) {
        if (!command.command) {
          yield textResult(`Unknown command: ${command.args}\n`)
          return
        }
        const result = command.command.handler(command.args)
        if (result === "__CLEAR__") {
          yield textResult("[Session cleared]\n")
          return
        }
        if (result === "__SESSIONS__") {
          const local = getSessionsByBackend(db, "local")
          const zen = getSessionsByBackend(db, "zen")
          const all = [...local, ...zen]
          if (all.length === 0) {
            yield textResult("No active sessions.\n")
          } else {
            const list = all.map((s) => `  ${s.id} (${s.backend}:${s.port}) - ${s.status}`).join("\n")
            yield textResult(`Active sessions:\n${list}\n`)
          }
          return
        }
        if (result) {
          yield textResult(result)
        }
        return
      }

      if (prompt.startsWith("!")) {
        const shellCmd = prompt.substring(1).trim()
        try {
          const output = execSync(shellCmd, { encoding: "utf-8", timeout: 30000 })
          yield textResult(output || "[No output]\n")
        } catch (err) {
          yield textResult(`[Error: ${(err as Error).message}]\n`)
        }
        return
      }

      if (prompt.startsWith("@")) {
        const filePath = prompt.substring(1).trim()
        try {
          const fullPath = resolve(process.cwd(), filePath)
          const content = readFileSync(fullPath, "utf-8")
          yield textResult(`File: ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`)
        } catch (err) {
          yield textResult(`[Error reading file: ${(err as Error).message}]\n`)
        }
        return
      }

      const tag = classify(prompt)
      const routeResult = route(tag, config, db)

      const task: Task = {
        id: generateId(),
        session_id: null,
        tag,
        prompt,
        status: "pending",
        tokens_used: 0,
        created_at: timestamp(),
        completed_at: null,
      }
      insertTask(db, task)

      yield textResult(`[Routing to ${routeResult.backend}: ${routeResult.reason}]\n`)

      try {
        const session = await sessionManager.spawn(routeResult.backend, process.cwd(), db)
        updateTaskStatus(db, task.id, "running")

        const client = createOpencodeClient({
          baseUrl: `http://localhost:${session.port}`,
        })

        const createResult = await client.session.create()
        const sessionId = createResult.data?.id

        if (!sessionId) {
          throw new Error("Failed to create session")
        }

        yield textResult(`[Session ${sessionId} on port ${session.port}]\n`)

        await memory.saveMessage(sessionId, task.id, "user", prompt)

        await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: prompt }],
          },
        })

        const baseUrl = `http://127.0.0.1:${session.port.toString()}`
        const response = await fetch(`${baseUrl}/event`)
        if (!response.ok || !response.body) {
          throw new Error("Failed to connect to SSE stream")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let fullResponse = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue

              try {
                const event = JSON.parse(data) as SSEEvent
                if (event.type === "message.part.updated") {
                  const part = event.properties.part as Record<string, unknown> | undefined
                  const text = part?.text
                  if (typeof text === "string" && text.length > 0) {
                    fullResponse += text
                    yield textResult(text)
                  }
                }
              } catch {
                // skip malformed events
              }
            }
          }
        }

        if (fullResponse) {
          await memory.saveMessage(sessionId, task.id, "assistant", fullResponse)
        }

        updateTaskStatus(db, task.id, "completed")
      } catch (err) {
        updateTaskStatus(db, task.id, "failed")
        yield textResult(`[Error: ${(err as Error).message}]\n`)
      }
    },
  }
}
