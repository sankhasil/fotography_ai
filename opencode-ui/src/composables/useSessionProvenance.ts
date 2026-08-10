import { reactive } from 'vue'

// Session provenance: tracks which sessions were created by this UI so the
// session list can tell them apart from sessions the CLI console created on
// the shared opencode server. The server exposes no origin field, so the UI
// keeps its own sidecar record in localStorage. A session not in the record is
// treated as a CLI session — and is therefore not deletable from the UI.

const KEY = 'opencode-ui:session-origin'

function readStored(): Record<string, 'ui'> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

const origins = reactive<Record<string, 'ui'>>(readStored())

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(origins))
  } catch {
    // storage unavailable — tags survive for this session only
  }
}

export function markAsUI(id: string): void {
  origins[id] = 'ui'
  persist()
}

export function isUISession(id: string): boolean {
  return origins[id] === 'ui'
}

export function forget(id: string): void {
  delete origins[id]
  persist()
}

export function useSessionProvenance() {
  return { markAsUI, isUISession, forget }
}

// Test-only: clear all tags so specs start fresh.
export function resetSessionProvenance(): void {
  for (const key of Object.keys(origins)) delete origins[key]
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
