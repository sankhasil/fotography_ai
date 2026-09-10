import type Database from "better-sqlite3"
import { insertEvent } from "./db.js"
import { generateId } from "./utils.js"

export type HookEvent =
  | "session:spawned"
  | "session:ready"
  | "session:stopped"
  | "session:error"
  | "task:started"
  | "task:completed"
  | "task:failed"
  | "circuit:tripped"
  | "circuit:reset"

export interface HookPayload {
  sessionId?: string
  taskId?: string
  backend?: string
  port?: number
  error?: string
  tokens?: number
  [key: string]: unknown
}

export class HookManager {
  private db: Database.Database
  private listeners = new Map<HookEvent, Array<(payload: HookPayload) => void>>()

  constructor(db: Database.Database) {
    this.db = db
  }

  on(event: HookEvent, handler: (payload: HookPayload) => void): void {
    const handlers = this.listeners.get(event) ?? []
    handlers.push(handler)
    this.listeners.set(event, handlers)
  }

  off(event: HookEvent, handler: (payload: HookPayload) => void): void {
    const handlers = this.listeners.get(event) ?? []
    this.listeners.set(event, handlers.filter((h) => h !== handler))
  }

  emit(event: HookEvent, payload: HookPayload = {}): void {
    insertEvent(this.db, payload.sessionId ?? null, event, JSON.stringify(payload))

    const handlers = this.listeners.get(event) ?? []
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[hook] Error in handler for ${event}:`, err)
      }
    }

    console.log(`[hook] ${event}`, payload.sessionId ? `session=${payload.sessionId}` : "")
  }
}
