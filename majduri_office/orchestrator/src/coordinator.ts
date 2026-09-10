import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, watch } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { generateId } from "./utils.js"

export interface AgentMessage {
  id: string
  from: string
  to: string
  type: "task" | "result" | "status" | "error"
  payload: unknown
  created_at: string
}

export class AgentCoordinator {
  private baseDir: string
  private watchers = new Map<string, ReturnType<typeof watch>>()

  constructor(baseDir: string) {
    this.baseDir = baseDir
    this.ensureDirs()
  }

  private ensureDirs(): void {
    mkdirSync(join(this.baseDir, "inbox"), { recursive: true })
    mkdirSync(join(this.baseDir, "outbox"), { recursive: true })
    mkdirSync(join(this.baseDir, "blackboard"), { recursive: true })
  }

  send(from: string, to: string, type: AgentMessage["type"], payload: unknown): AgentMessage {
    const msg: AgentMessage = {
      id: generateId(),
      from,
      to,
      type,
      payload,
      created_at: new Date().toISOString(),
    }

    const inboxDir = join(this.baseDir, "inbox", to)
    mkdirSync(inboxDir, { recursive: true })
    writeFileSync(join(inboxDir, `${msg.id}.json`), JSON.stringify(msg, null, 2))

    const outboxDir = join(this.baseDir, "outbox", from)
    mkdirSync(outboxDir, { recursive: true })
    writeFileSync(join(outboxDir, `${msg.id}.json`), JSON.stringify(msg, null, 2))

    return msg
  }

  receive(agentId: string): AgentMessage[] {
    const inboxDir = join(this.baseDir, "inbox", agentId)
    if (!existsSync(inboxDir)) return []

    const files = readdirSync(inboxDir).filter((f) => f.endsWith(".json"))
    return files.map((f) => {
      const content = readFileSync(join(inboxDir, f), "utf-8")
      unlinkSync(join(inboxDir, f))
      return JSON.parse(content) as AgentMessage
    })
  }

  peek(agentId: string): AgentMessage[] {
    const inboxDir = join(this.baseDir, "inbox", agentId)
    if (!existsSync(inboxDir)) return []

    return readdirSync(inboxDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(inboxDir, f), "utf-8")) as AgentMessage)
  }

  blackboardWrite(key: string, value: unknown): void {
    writeFileSync(join(this.baseDir, "blackboard", `${key}.json`), JSON.stringify(value, null, 2))
  }

  blackboardRead<T = unknown>(key: string): T | null {
    const path = join(this.baseDir, "blackboard", `${key}.json`)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, "utf-8")) as T
  }

  blackboardList(): string[] {
    const bbDir = join(this.baseDir, "blackboard")
    if (!existsSync(bbDir)) return []
    return readdirSync(bbDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
  }

  watch(agentId: string, callback: (msg: AgentMessage) => void): void {
    if (this.watchers.has(agentId)) return

    const inboxDir = join(this.baseDir, "inbox", agentId)
    mkdirSync(inboxDir, { recursive: true })

    const watcher = watch(inboxDir, () => {
      const messages = this.receive(agentId)
      messages.forEach(callback)
    })

    this.watchers.set(agentId, watcher)
  }

  unwatch(agentId: string): void {
    const watcher = this.watchers.get(agentId)
    if (watcher) {
      watcher.close()
      this.watchers.delete(agentId)
    }
  }

  cleanup(): void {
    for (const [id] of this.watchers) {
      this.unwatch(id)
    }
  }
}
