#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { resolve } from "node:path"
import { initDatabase } from "../db.js"
import { loadConfig } from "../config.js"
import { SessionManager } from "../sessions.js"
import { App } from "./app.js"

const DB_PATH = resolve(import.meta.dirname ?? process.cwd(), "../../orchestrator.db")

console.log("[cli] Starting...")
console.log("[cli] DB path:", DB_PATH)

const db = initDatabase(DB_PATH)
const config = loadConfig()
const sessionManager = new SessionManager()

console.log("[cli] Config loaded:", Object.keys(config.routing).join(", "))

const cleanup = async () => {
  console.log("\n[cli] Shutting down...")
  for (const session of sessionManager.getAll()) {
    await sessionManager.kill(session.id, db)
  }
  db.close()
  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

process.on("uncaughtException", (err) => {
  console.error("[cli] Uncaught exception:", err)
})

process.on("unhandledRejection", (reason) => {
  console.error("[cli] Unhandled rejection:", reason)
})

if (!process.stdin.isTTY) {
  console.error("[cli] Error: CLI mode requires an interactive terminal.")
  console.error("[cli] Run 'npm run dev' for headless mode, or run in a real terminal.")
  db.close()
  process.exit(1)
}

console.log("[cli] Rendering app...")
render(<App db={db} config={config} sessionManager={sessionManager} />)
console.log("[cli] App rendered")
