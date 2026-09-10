import type Database from "better-sqlite3"
import type { AppConfig } from "./types.js"
import { getTasksByStatus } from "./db.js"
import { timestamp } from "./utils.js"

export interface EscalationRule {
  condition: "task_stuck" | "circuit_open" | "token_exhausted" | "multiple_failures"
  threshold: number
  action: "notify" | "reroute" | "halt"
}

export interface EscalationEvent {
  id: string
  rule: EscalationRule["condition"]
  action: EscalationRule["action"]
  reason: string
  created_at: string
}

const DEFAULT_RULES: EscalationRule[] = [
  { condition: "task_stuck", threshold: 5, action: "notify" },
  { condition: "circuit_open", threshold: 3, action: "reroute" },
  { condition: "token_exhausted", threshold: 1, action: "halt" },
  { condition: "multiple_failures", threshold: 3, action: "halt" },
]

export class GodAgent {
  private rules: EscalationRule[]
  private events: EscalationEvent[] = []

  constructor(rules: EscalationRule[] = DEFAULT_RULES) {
    this.rules = rules
  }

  evaluate(db: Database.Database, config: AppConfig): EscalationEvent[] {
    const events: EscalationEvent[] = []

    const runningTasks = getTasksByStatus(db, "running")
    const stuckRule = this.rules.find((r) => r.condition === "task_stuck")
    if (stuckRule && runningTasks.length >= stuckRule.threshold) {
      const stale = runningTasks.filter((t) => {
        const age = Date.now() - new Date(t.created_at).getTime()
        return age > 300_000
      })
      if (stale.length > 0) {
        events.push(this.createEvent("task_stuck", stuckRule.action, `${stale.length} tasks stuck for >5min`))
      }
    }

    const failedTasks = getTasksByStatus(db, "failed")
    const failureRule = this.rules.find((r) => r.condition === "multiple_failures")
    if (failureRule && failedTasks.length >= failureRule.threshold) {
      events.push(this.createEvent("multiple_failures", failureRule.action, `${failedTasks.length} tasks failed`))
    }

    this.events.push(...events)
    return events
  }

  private createEvent(rule: EscalationRule["condition"], action: EscalationRule["action"], reason: string): EscalationEvent {
    return {
      id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rule,
      action,
      reason,
      created_at: timestamp(),
    }
  }

  getEvents(): EscalationEvent[] {
    return [...this.events]
  }

  clearEvents(): void {
    this.events = []
  }
}
