import type Database from "better-sqlite3"
import { getActiveSessionCount, getTokenUsageByTag } from "./db.js"

export type CircuitState = "green" | "yellow" | "red"

export interface CircuitBreakerConfig {
  maxConcurrentSessions: number
  tokenLimitPerHour: number
  errorThreshold: number
  cooldownMs: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxConcurrentSessions: 3,
  tokenLimitPerHour: 50000,
  errorThreshold: 5,
  cooldownMs: 60000,
}

export class CircuitBreaker {
  private db: Database.Database
  private config: CircuitBreakerConfig
  private errorCounts = new Map<string, number>()
  private lastTripped = new Map<string, number>()

  constructor(db: Database.Database, config?: Partial<CircuitBreakerConfig>) {
    this.db = db
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  getState(backend: string): CircuitState {
    if (this.isTripped(backend)) return "red"
    if (this.isPressure(backend)) return "yellow"
    return "green"
  }

  canProceed(backend: string): { allowed: boolean; reason: string; state: CircuitState } {
    const state = this.getState(backend)

    if (state === "red") {
      const remaining = this.getCooldownRemaining(backend)
      return {
        allowed: false,
        reason: `Circuit breaker tripped. Cooldown: ${Math.ceil(remaining / 1000)}s`,
        state,
      }
    }

    const activeSessions = getActiveSessionCount(this.db)
    if (activeSessions >= this.config.maxConcurrentSessions) {
      return {
        allowed: false,
        reason: `Max concurrent sessions reached (${activeSessions}/${this.config.maxConcurrentSessions})`,
        state: "yellow",
      }
    }

    const tokens = getTokenUsageByTag(this.db, backend)
    if (tokens >= this.config.tokenLimitPerHour) {
      return {
        allowed: false,
        reason: `Token limit reached for ${backend} (${tokens}/${this.config.tokenLimitPerHour})`,
        state: "yellow",
      }
    }

    return { allowed: true, reason: "OK", state }
  }

  recordSuccess(backend: string): void {
    this.errorCounts.set(backend, 0)
  }

  recordError(backend: string): void {
    const count = (this.errorCounts.get(backend) ?? 0) + 1
    this.errorCounts.set(backend, count)

    if (count >= this.config.errorThreshold) {
      this.trip(backend)
    }
  }

  trip(backend: string): void {
    this.lastTripped.set(backend, Date.now())
    console.log(`[circuit-breaker] Tripped ${backend} (cooldown: ${this.config.cooldownMs}ms)`)
  }

  reset(backend: string): void {
    this.errorCounts.set(backend, 0)
    this.lastTripped.delete(backend)
  }

  private isTripped(backend: string): boolean {
    const lastTrip = this.lastTripped.get(backend)
    if (!lastTrip) return false
    return Date.now() - lastTrip < this.config.cooldownMs
  }

  private isPressure(backend: string): boolean {
    const errors = this.errorCounts.get(backend) ?? 0
    return errors >= this.config.errorThreshold / 2
  }

  private getCooldownRemaining(backend: string): number {
    const lastTrip = this.lastTripped.get(backend)
    if (!lastTrip) return 0
    const elapsed = Date.now() - lastTrip
    return Math.max(0, this.config.cooldownMs - elapsed)
  }
}
