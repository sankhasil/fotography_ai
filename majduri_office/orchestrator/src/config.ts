import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { AppConfig, RouteConfig, RoutingConfig } from "./types.js"

const ROUTING_CONFIG_PATH = resolve(import.meta.dirname ?? process.cwd(), "../routing.json")

const DEFAULT_APPROVAL = { routing_approval: false }

export function loadConfig(): AppConfig {
  const raw = readFileSync(ROUTING_CONFIG_PATH, "utf-8")
  const routing = JSON.parse(raw) as RoutingConfig

  validateRouting(routing)

  return {
    routing,
    approval: DEFAULT_APPROVAL,
  }
}

export function getRouteForTag(tag: string, config: AppConfig): RouteConfig {
  return config.routing[tag] ?? config.routing["feature"]
}

export function setApprovalEnabled(config: AppConfig, enabled: boolean): void {
  config.approval.routing_approval = enabled
}

function validateRouting(routing: RoutingConfig): void {
  for (const [tag, rule] of Object.entries(routing)) {
    if (!rule.backend || !["local", "zen"].includes(rule.backend)) {
      throw new Error(`Invalid backend for tag "${tag}": ${rule.backend}`)
    }
    if (typeof rule.parallel !== "boolean") {
      throw new Error(`Invalid parallel for tag "${tag}": ${rule.parallel}`)
    }
    if (rule.token_limit !== null && typeof rule.token_limit !== "number") {
      throw new Error(`Invalid token_limit for tag "${tag}": ${rule.token_limit}`)
    }
  }
}
