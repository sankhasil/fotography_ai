import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolve } from "node:path"
import { unlinkSync } from "node:fs"
import Database from "better-sqlite3"
import { initDatabase, insertTask, getPendingTasks, insertSession, getActiveSessionCount, insertTokenUsage, getTokenUsageByTag, setBackendStatus, isBackendAvailable } from "../src/db.js"
import { loadConfig } from "../src/config.js"
import { classify } from "../src/classifier.js"
import { route } from "../src/router.js"
import { MemoryManager } from "../src/memory.js"
import { hasOverlappingPaths } from "../src/router.js"

const TEST_DB = resolve(import.meta.dirname ?? process.cwd(), "../integration-test.db")

describe("Integration: Full orchestrator flow", () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDatabase(TEST_DB)
  })

  afterEach(() => {
    db.close()
    try { unlinkSync(TEST_DB) } catch {}
  })

  it("classifies prompts and routes to correct backend", () => {
    const config = loadConfig()

    const featureTag = classify("add user profile page")
    expect(featureTag).toBe("feature")

    const featureRoute = route(featureTag, config, db)
    expect(featureRoute.backend).toBe("zen")

    const testTag = classify("write unit tests for auth")
    expect(testTag).toBe("test")

    const testRoute = route(testTag, config, db)
    expect(["local", "zen"]).toContain(testRoute.backend)
  })

  it("failovers when backend is unavailable", () => {
    const config = loadConfig()
    setBackendStatus(db, "zen", false, "rate limited")

    const result = route("feature", config, db)
    expect(result.backend).toBe("local")
    expect(result.reason).toContain("unavailable")
  })

  it("tracks token usage and enforces limits", () => {
    const config = loadConfig()

    const session = {
      id: "token-session-1",
      port: 5000,
      backend: "zen",
      status: "ready",
      directory: "/test",
      created_at: new Date().toISOString(),
    }
    insertSession(db, session)

    for (let i = 0; i < 10; i++) {
      insertTokenUsage(db, "token-session-1", "feature", 1000)
    }

    const result = route("feature", config, db)
    expect(result.reason).toContain("Token limit")
  })

  it("prevents overlapping file paths", () => {
    expect(hasOverlappingPaths("fix src/auth/login.ts", "update src/auth/utils.ts")).toBe(true)
    expect(hasOverlappingPaths("fix src/auth/login.ts", "update lib/utils/helper.ts")).toBe(false)
  })

  it("manages conversation memory", async () => {
    const session = {
      id: "mem-session-1",
      port: 4000,
      backend: "local",
      status: "ready",
      directory: "/test",
      created_at: new Date().toISOString(),
    }
    insertSession(db, session)

    const task = {
      id: "mem-task-1",
      session_id: "mem-session-1",
      tag: "feature",
      prompt: "add auth",
      status: "running",
      tokens_used: 0,
      created_at: new Date().toISOString(),
      completed_at: null,
    }
    insertTask(db, task)

    const memory = new MemoryManager(db)

    await memory.saveMessage("mem-session-1", "mem-task-1", "user", "add auth")
    await memory.saveMessage("mem-session-1", "mem-task-1", "assistant", "I'll add auth")

    const history = await memory.getConversationHistory("mem-session-1")
    expect(history).toHaveLength(2)
    expect(history[0].role).toBe("user")
    expect(history[1].role).toBe("assistant")

    await memory.storeMemory("mem-task-1", "auth_module", "Created auth service with JWT")
    const recalled = await memory.recallMemory("auth_module")
    expect(recalled.length).toBeGreaterThan(0)
    expect(recalled[0].value).toBe("Created auth service with JWT")
  })
})
