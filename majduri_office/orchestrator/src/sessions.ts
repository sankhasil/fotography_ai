import { spawn, type ChildProcess } from "node:child_process"
import { statSync } from "node:fs"
import type Database from "better-sqlite3"
import type { Backend, Session, SessionStatus } from "./types.js"
import { insertSession, updateSessionStatus } from "./db.js"
import { generateId, timestamp, sleep, getFreeMemoryMB } from "./utils.js"

export interface ManagedSession {
  id: string
  port: number
  backend: Backend
  status: SessionStatus
  directory: string
  process: ChildProcess | null
}

function findOpencodePath(): string {
  const candidates = [
    process.env.OPENCODE_PATH,
    "/Users/A200173944/PersonalCodes/fotography_ai/open-code/node_modules/.bin/opencode",
    "opencode",
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // not found, try next
    }
  }

  return "opencode"
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>()
  private nextPort = 4097
  private opencodePath: string

  constructor() {
    this.opencodePath = findOpencodePath()
  }

  async spawn(
    backend: Backend,
    directory: string,
    db: Database.Database,
  ): Promise<ManagedSession> {
    if (backend === "local" && getFreeMemoryMB() < 2048) {
      throw new Error("Insufficient memory for local session (need 2GB free)")
    }

    const port = this.nextPort++
    const id = generateId()

    const proc = spawn(this.opencodePath, [
      "serve",
      "--hostname=127.0.0.1",
      `--port=${port.toString()}`,
    ], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const session: ManagedSession = {
      id,
      port,
      backend,
      status: "starting",
      directory,
      process: proc,
    }

    this.sessions.set(id, session)

    const dbSession: Session = {
      id,
      port,
      backend,
      status: "starting",
      directory,
      created_at: timestamp(),
    }
    insertSession(db, dbSession)

    await this.waitForHealth(port, 15_000)

    session.status = "ready"
    updateSessionStatus(db, id, "ready")

    return session
  }

  async kill(id: string, db: Database.Database): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return

    session.process?.kill("SIGTERM")
    session.status = "stopped"
    updateSessionStatus(db, id, "stopped")
    this.sessions.delete(id)
  }

  get(id: string): ManagedSession | undefined {
    return this.sessions.get(id)
  }

  getAll(): ManagedSession[] {
    return Array.from(this.sessions.values())
  }

  getAvailable(backend: Backend): ManagedSession | undefined {
    return this.getAll().find(
      (s) => s.backend === backend && s.status === "ready",
    )
  }

  private async waitForHealth(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${port.toString()}/global/health`)
        if (res.ok) return
      } catch {
        // not ready yet
      }
      await sleep(500)
    }
    throw new Error(`OpenCode server on port ${port.toString()} failed to start within ${timeoutMs.toString()}ms`)
  }
}
