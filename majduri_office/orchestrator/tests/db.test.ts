import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { initDatabase, insertTask, getPendingTasks, insertSession, getSessionsByBackend, insertTokenUsage, getTokenUsageByTag, setBackendStatus, isBackendAvailable } from "../src/db.js"
import Database from "better-sqlite3"
import { unlinkSync } from "node:fs"
import { resolve } from "node:path"

const TEST_DB = resolve(import.meta.dirname ?? process.cwd(), "../test.db")

describe("Database", () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDatabase(TEST_DB)
  })

  afterEach(() => {
    db.close()
    try { unlinkSync(TEST_DB) } catch {}
  })

  it("inserts and retrieves tasks", () => {
    const task = {
      id: "task-1",
      session_id: null,
      tag: "feature",
      prompt: "add login",
      status: "pending",
      tokens_used: 0,
      created_at: new Date().toISOString(),
      completed_at: null,
    }
    insertTask(db, task)

    const pending = getPendingTasks(db)
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe("task-1")
  })

  it("inserts and retrieves sessions", () => {
    const session = {
      id: "session-1",
      port: 3000,
      backend: "local",
      status: "ready",
      directory: "/test",
      created_at: new Date().toISOString(),
    }
    insertSession(db, session)

    const sessions = getSessionsByBackend(db, "local")
    expect(sessions).toHaveLength(1)
    expect(sessions[0].port).toBe(3000)
  })

  it("tracks token usage by tag", () => {
    insertSession(db, {
      id: "session-1",
      port: 3000,
      backend: "local",
      status: "ready",
      directory: "/test",
      created_at: new Date().toISOString(),
    })

    insertTokenUsage(db, "session-1", "feature", 100)
    insertTokenUsage(db, "session-1", "feature", 200)
    insertTokenUsage(db, "session-1", "test", 50)

    expect(getTokenUsageByTag(db, "feature")).toBe(300)
    expect(getTokenUsageByTag(db, "test")).toBe(50)
  })

  it("manages backend status", () => {
    expect(isBackendAvailable(db, "local")).toBe(true)

    setBackendStatus(db, "local", false, "out of memory")
    expect(isBackendAvailable(db, "local")).toBe(false)

    setBackendStatus(db, "local", true, null)
    expect(isBackendAvailable(db, "local")).toBe(true)
  })
})
