import type Database from "better-sqlite3"
import type { ManagedSession } from "./sessions.js"
import { insertEvent, insertTokenUsage, updateTaskStatus, setBackendStatus } from "./db.js"
import { sleep } from "./utils.js"

interface SSEEvent {
  type: string
  properties: Record<string, unknown>
}

export class Monitor {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async watchSession(session: ManagedSession, tag: string): Promise<void> {
    const baseUrl = `http://127.0.0.1:${session.port.toString()}`

    try {
      const response = await fetch(`${baseUrl}/event`)
      if (!response.ok || !response.body) {
        console.error(`[monitor] Failed to connect to SSE for session ${session.id}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

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
              this.handleEvent(session, tag, event)
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      console.error(`[monitor] SSE error for session ${session.id}: ${(err as Error).message}`)
    }
  }

  private handleEvent(session: ManagedSession, tag: string, event: SSEEvent): void {
    insertEvent(this.db, session.id, event.type, JSON.stringify(event.properties))

    switch (event.type) {
      case "message.part.updated":
        this.trackTokens(session, tag, event.properties)
        break

      case "session.idle":
        console.log(`[monitor] Session ${session.id} completed task`)
        break

      case "session.error":
        this.handleError(session, event.properties)
        break
    }
  }

  private trackTokens(
    session: ManagedSession,
    tag: string,
    properties: Record<string, unknown>,
  ): void {
    const usage = properties.usage as { totalTokens?: number } | undefined
    if (usage?.totalTokens) {
      insertTokenUsage(this.db, session.id, tag, usage.totalTokens)
    }
  }

  private handleError(
    session: ManagedSession,
    properties: Record<string, unknown>,
  ): void {
    const error = properties.error as string ?? ""
    const isQuotaError =
      error.includes("429") ||
      error.includes("rate_limit") ||
      error.includes("token_limit") ||
      error.includes("quota")

    if (isQuotaError) {
      console.log(`[monitor] Quota error detected for ${session.backend}`)
      setBackendStatus(this.db, session.backend, false, "token_limit_exceeded")
    }
  }

  async checkBackendHealth(baseUrl: string, backend: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/global/health`)
      if (res.ok) {
        setBackendStatus(this.db, backend, true, null)
        return true
      }
      setBackendStatus(this.db, backend, false, `HTTP ${res.status.toString()}`)
      return false
    } catch {
      setBackendStatus(this.db, backend, false, "connection_failed")
      return false
    }
  }
}
