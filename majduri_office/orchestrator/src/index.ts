import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { initDatabase, insertTask, getPendingTasks, updateTaskStatus } from "./db.js"
import { loadConfig } from "./config.js"
import { classify, isValidTag } from "./classifier.js"
import { route, hasOverlappingPaths } from "./router.js"
import { CircuitBreaker } from "./circuit-breaker.js"
import { HookManager } from "./hooks.js"
import { SessionManager } from "./sessions.js"
import { Monitor } from "./monitor.js"
import { MemoryManager } from "./memory.js"
import { generateId, timestamp } from "./utils.js"
import type { Task } from "./types.js"

const DB_PATH = resolve(import.meta.dirname ?? process.cwd(), "../orchestrator.db")
const VALID_TAGS = ["test", "feature", "refactor", "docs", "bugfix"]

async function main(): Promise<void> {
  console.log("[orchestrator] Starting Majduri Orchestrator...")

  const db = initDatabase(DB_PATH)
  const config = loadConfig()
  const circuitBreaker = new CircuitBreaker(db)
  const hooks = new HookManager(db)
  const sessionManager = new SessionManager()
  const monitor = new Monitor(db)
  const memory = new MemoryManager(db)

  console.log("[orchestrator] Database initialized")
  console.log("[orchestrator] Config loaded:", Object.keys(config.routing).join(", "))

  hooks.on("session:spawned", (e) => {
    console.log(`[hook] Session ${e.sessionId} spawned on port ${e.port}`)
  })
  hooks.on("session:stopped", (e) => {
    console.log(`[hook] Session ${e.sessionId} stopped`)
  })
  hooks.on("circuit:tripped", (e) => {
    console.log(`[hook] Circuit breaker tripped for ${e.backend} — entering degraded mode`)
  })

  process.on("SIGINT", async () => {
    console.log("\n[orchestrator] Shutting down...")
    for (const session of sessionManager.getAll()) {
      await sessionManager.kill(session.id, db)
    }
    db.close()
    process.exit(0)
  })

  console.log("[orchestrator] Ready. Awaiting tasks...")
  console.log("[orchestrator] Usage: Submit tasks with optional tag prefix")
  console.log("[orchestrator] Example: 'test: write unit tests for auth module'")
  console.log("[orchestrator] Example: 'fix bug in login flow' (auto-classified as bugfix)")

  const args = process.argv.slice(2)
  if (args.length > 0) {
    const taskPrompt = args.join(" ")
    await processTask(taskPrompt, config, db, sessionManager, monitor, circuitBreaker, memory)
  }
}

async function processTask(
  taskPrompt: string,
  config: ReturnType<typeof loadConfig>,
  db: ReturnType<typeof initDatabase>,
  sessionManager: SessionManager,
  monitor: Monitor,
  circuitBreaker: CircuitBreaker,
  memory: MemoryManager,
): Promise<void> {
  let tag: string
  let prompt: string

  const colonIndex = taskPrompt.indexOf(":")
  if (colonIndex > 0) {
    const potentialTag = taskPrompt.substring(0, colonIndex).trim().toLowerCase()
    if (isValidTag(potentialTag, VALID_TAGS)) {
      tag = potentialTag
      prompt = taskPrompt.substring(colonIndex + 1).trim()
    } else {
      tag = classify(taskPrompt)
      prompt = taskPrompt
    }
  } else {
    tag = classify(taskPrompt)
    prompt = taskPrompt
  }

  console.log(`[orchestrator] Task: "${prompt.substring(0, 50)}..."`)
  console.log(`[orchestrator] Tag: ${tag}`)

  const routeResult = route(tag, config, db, circuitBreaker)
  console.log(`[orchestrator] Routed to: ${routeResult.backend} (${routeResult.reason})`)

  if (config.approval.routing_approval) {
    const approved = await askForApproval(routeResult.backend, tag)
    if (!approved) {
      console.log("[orchestrator] Task rejected by user")
      return
    }
  }

  const pendingTasks = getPendingTasks(db)
  for (const pending of pendingTasks) {
    if (hasOverlappingPaths(prompt, pending.prompt)) {
      console.log(`[orchestrator] Overlapping paths with pending task ${pending.id}, queuing sequentially`)
      routeResult.parallel = false
      break
    }
  }

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

  try {
    const session = await sessionManager.spawn(routeResult.backend, process.cwd(), db)
    console.log(`[orchestrator] Session spawned: ${session.id} on port ${session.port}`)

    updateTaskStatus(db, task.id, "running")
    console.log(`[orchestrator] Task ${task.id} assigned to session ${session.id}`)

    monitor.watchSession(session, tag).catch((err) => {
      console.error(`[monitor] Watch error for session ${session.id}: ${(err as Error).message}`)
    })
  } catch (err) {
    console.error(`[orchestrator] Failed to spawn session: ${(err as Error).message}`)
    updateTaskStatus(db, task.id, "failed")
  }
}

main().catch((err) => {
  console.error("[orchestrator] Fatal error:", err)
  process.exit(1)
})

function askForApproval(backend: string, tag: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(
      `[orchestrator] Route task (tag: ${tag}) to ${backend}? (y/n): `,
      (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes")
      },
    )
  })
}
