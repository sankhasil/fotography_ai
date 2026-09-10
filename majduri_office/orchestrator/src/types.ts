export type Backend = "local" | "zen"

export type SessionStatus = "starting" | "ready" | "busy" | "error" | "stopped"

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "queued"

export interface RouteConfig {
  backend: Backend
  parallel: boolean
  token_limit: number | null
}

export type RoutingConfig = Record<string, RouteConfig>

export interface Session {
  id: string
  port: number
  backend: Backend
  status: SessionStatus
  directory: string
  created_at: string
}

export interface Task {
  id: string
  session_id: string | null
  tag: string
  prompt: string
  status: TaskStatus
  tokens_used: number
  created_at: string
  completed_at: string | null
}

export interface TokenUsage {
  id: number
  session_id: string
  tag: string
  tokens: number
  recorded_at: string
}

export interface BackendStatus {
  backend: Backend
  available: boolean
  reason: string | null
  updated_at: string
}

export interface Event {
  id: number
  session_id: string | null
  event_type: string
  payload: string | null
  created_at: string
}

export interface ApprovalConfig {
  routing_approval: boolean
}

export interface AppConfig {
  routing: RoutingConfig
  approval: ApprovalConfig
}
