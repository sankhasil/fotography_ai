import { randomUUID } from "node:crypto"

export interface CapabilityToken {
  id: string
  sessionId: string
  backend: "local" | "zen"
  allowedPaths: string[]
  allowedTags: string[]
  maxTokens: number
  expiresAt: string
}

export class CapabilityManager {
  private tokens = new Map<string, CapabilityToken>()

  create(
    sessionId: string,
    backend: "local" | "zen",
    opts: { allowedPaths?: string[]; allowedTags?: string[]; maxTokens?: number; ttlMs?: number } = {},
  ): CapabilityToken {
    const token: CapabilityToken = {
      id: randomUUID(),
      sessionId,
      backend,
      allowedPaths: opts.allowedPaths ?? ["*"],
      allowedTags: opts.allowedTags ?? ["test", "feature", "refactor", "docs", "bugfix"],
      maxTokens: opts.maxTokens ?? 10000,
      expiresAt: new Date(Date.now() + (opts.ttlMs ?? 3_600_000)).toISOString(),
    }

    this.tokens.set(token.id, token)
    return token
  }

  validate(tokenId: string, tag: string, filePath?: string): { valid: boolean; reason?: string } {
    const token = this.tokens.get(tokenId)
    if (!token) return { valid: false, reason: "Token not found" }
    if (new Date(token.expiresAt) < new Date()) {
      this.tokens.delete(tokenId)
      return { valid: false, reason: "Token expired" }
    }

    if (!token.allowedTags.includes(tag)) {
      return { valid: false, reason: `Tag "${tag}" not allowed by token` }
    }

    if (filePath && !token.allowedPaths.includes("*")) {
      const allowed = token.allowedPaths.some(
        (p) => filePath.startsWith(p) || filePath.includes(p),
      )
      if (!allowed) {
        return { valid: false, reason: `Path "${filePath}" not allowed by token` }
      }
    }

    return { valid: true }
  }

  revoke(tokenId: string): boolean {
    return this.tokens.delete(tokenId)
  }

  getForSession(sessionId: string): CapabilityToken[] {
    return Array.from(this.tokens.values()).filter((t) => t.sessionId === sessionId)
  }

  cleanup(): void {
    const now = new Date()
    for (const [id, token] of this.tokens) {
      if (new Date(token.expiresAt) < now) {
        this.tokens.delete(id)
      }
    }
  }
}
