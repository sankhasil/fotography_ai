import { mkdirSync, rmSync, existsSync, cpSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"
import { generateId } from "./utils.js"

export interface Worktree {
  id: string
  path: string
  branch: string
  createdAt: string
}

export class WorktreeManager {
  private baseDir: string
  private worktrees = new Map<string, Worktree>()

  constructor(baseDir: string) {
    this.baseDir = baseDir
    mkdirSync(this.baseDir, { recursive: true })
  }

  create(sourceDir: string, name?: string): Worktree {
    const id = name ?? generateId()
    const worktreePath = join(this.baseDir, id)
    const branch = `worktree-${id}`

    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true })
    }

    cpSync(sourceDir, worktreePath, { recursive: true })

    const worktree: Worktree = {
      id,
      path: worktreePath,
      branch,
      createdAt: new Date().toISOString(),
    }

    this.worktrees.set(id, worktree)
    return worktree
  }

  destroy(id: string): boolean {
    const worktree = this.worktrees.get(id)
    if (!worktree) return false

    if (existsSync(worktree.path)) {
      rmSync(worktree.path, { recursive: true, force: true })
    }

    this.worktrees.delete(id)
    return true
  }

  getPath(id: string): string | null {
    return this.worktrees.get(id)?.path ?? null
  }

  getAll(): Worktree[] {
    return Array.from(this.worktrees.values())
  }

  cleanup(): void {
    for (const [id] of this.worktrees) {
      this.destroy(id)
    }
  }
}
