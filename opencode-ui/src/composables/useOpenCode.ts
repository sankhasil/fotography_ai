import { ref, shallowRef } from 'vue'
import type { OpencodeClient } from '@opencode-ai/sdk/client'

import type { ConnectionStatus } from '@/components/ui/UiStatusIndicator.vue'
import * as opencode from '@/services/opencode'

const status = ref<ConnectionStatus>('offline')
const url = ref<string | null>(null)
const error = ref<string | null>(null)
// shallowRef: Vue's UnwrapRef would proxy and strip the SDK class's protected
// `_client` member. The client handle must be passed through unchanged.
const client = shallowRef<OpencodeClient | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
let connecting = false
let hasConnected = false

function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!(await opencode.healthCheck())) {
      stopPolling()
      await runConnect()
    }
  }, 5000)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// Dev-only fallback: the Vite plugin spawns the npm opencode-ai server and
// reports its URL. Returns null when no plugin is present (e.g. prod build).
async function resolveDevFallback(): Promise<string | null> {
  try {
    const response = await fetch('/opencode-resolve', { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return null
    const data = (await response.json()) as { url?: string }
    return data.url ?? null
  } catch {
    return null
  }
}

async function runConnect(): Promise<void> {
  if (connecting) return
  connecting = true
  stopPolling()
  status.value = hasConnected ? 'reconnecting' : 'connecting'
  error.value = null

  try {
    const connection = await opencode.connect()
    hasConnected = true
    status.value = 'connected'
    url.value = connection.url
    client.value = connection.client
    startPolling()
  } catch {
    const fallbackUrl = await resolveDevFallback()
    if (fallbackUrl) {
      try {
        const connection = await opencode.connectTo(fallbackUrl)
        hasConnected = true
        status.value = 'connected'
        url.value = connection.url
        client.value = connection.client
        startPolling()
        return
      } catch {
        // fall through to offline
      }
    }
    hasConnected = false
    status.value = 'offline'
    url.value = null
    client.value = null
    error.value = 'No OpenCode console reachable. Is `opencode serve` running?'
  } finally {
    connecting = false
  }
}

function disconnect(): void {
  stopPolling()
  opencode.disconnect()
  hasConnected = false
  status.value = 'offline'
  url.value = null
  client.value = null
  error.value = null
}

export function useOpenCode() {
  return {
    status,
    url,
    error,
    client,
    connect: runConnect,
    disconnect,
  }
}
