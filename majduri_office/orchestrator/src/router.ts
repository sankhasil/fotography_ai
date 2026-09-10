import type Database from "better-sqlite3"
import type { AppConfig, Backend, RouteConfig } from "./types.js"
import { isBackendAvailable, getTokenUsageByTag } from "./db.js"
import { getFreeMemoryMB } from "./utils.js"
import { CircuitBreaker } from "./circuit-breaker.js"

export interface RouteResult {
  backend: Backend
  parallel: boolean
  reason: string
  circuitState?: "green" | "yellow" | "red"
}

export function route(
  tag: string,
  config: AppConfig,
  db: Database.Database,
  circuitBreaker?: CircuitBreaker,
): RouteResult {
  const rule: RouteConfig = config.routing[tag] ?? config.routing["feature"]

  if (circuitBreaker) {
    const check = circuitBreaker.canProceed(rule.backend)
    if (!check.allowed) {
      const fallback = failover(tag, rule, db, circuitBreaker)
      return {
        ...fallback,
        reason: check.reason,
        circuitState: check.state,
      }
    }
  }

  if (!isBackendAvailable(db, rule.backend)) {
    const fallback = failover(tag, rule, db, circuitBreaker)
    return {
      ...fallback,
      reason: `Backend ${rule.backend} unavailable, using ${fallback.backend}`,
    }
  }

  if (rule.token_limit !== null) {
    const used = getTokenUsageByTag(db, tag)
    if (used >= rule.token_limit) {
      const fallback = failover(tag, rule, db, circuitBreaker)
      return {
        ...fallback,
        reason: `Token limit reached for ${tag} (${used}/${rule.token_limit}), using ${fallback.backend}`,
      }
    }
  }

  if (rule.backend === "local" && getFreeMemoryMB() < 2048) {
    return {
      backend: "zen",
      parallel: false,
      reason: "Insufficient memory for local session",
    }
  }

  return {
    backend: rule.backend,
    parallel: rule.parallel,
    reason: `Matched tag "${tag}"`,
    circuitState: circuitBreaker?.getState(rule.backend),
  }
}

export function hasOverlappingPaths(prompt1: string, prompt2: string): boolean {
  const pathPattern = /(?:src|lib|app|tests?|spec)\/[\w/.-]+\.\w+/g
  const paths1 = (prompt1.match(pathPattern) ?? []).map((p) => p.split("/").slice(0, -1).join("/"))
  const paths2 = (prompt2.match(pathPattern) ?? []).map((p) => p.split("/").slice(0, -1).join("/"))

  if (paths1.length === 0 || paths2.length === 0) return false

  return paths1.some((p1) => paths2.some((p2) => p1 === p2 || p1.startsWith(p2) || p2.startsWith(p1)))
}

function failover(
  tag: string,
  original: RouteConfig,
  db: Database.Database,
  circuitBreaker?: CircuitBreaker,
): { backend: Backend; parallel: boolean } {
  const alternative: Backend = original.backend === "local" ? "zen" : "local"

  if (circuitBreaker) {
    const check = circuitBreaker.canProceed(alternative)
    if (check.allowed && isBackendAvailable(db, alternative)) {
      return { backend: alternative, parallel: false }
    }
  } else if (isBackendAvailable(db, alternative)) {
    return { backend: alternative, parallel: false }
  }

  if (original.backend === "local" && getFreeMemoryMB() < 2048) {
    return { backend: "zen", parallel: false }
  }

  return { backend: original.backend, parallel: false }
}
