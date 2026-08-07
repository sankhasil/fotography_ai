import { ref } from 'vue'
import type { Event, OpencodeClient } from '@opencode-ai/sdk/client'

const MAX_EVENTS = 500

// ponytail: cap the raw event log at 500 entries; this is a diagnostic dev
// panel. Bump the cap if long-session debugging needs more history.
const events = ref<RawEventRecord[]>([])
const streaming = ref(false)

let controller: AbortController | null = null
let nextId = 0

export interface RawEventRecord {
  id: number
  type: string
  properties: unknown
  receivedAt: number
}

// Single consumer (the conversation reducer), registered once by the store.
// stop() must not clear it: start() runs stop() on every (re)connect, and
// clearing it here would silently detach the reducer from the stream.
let onEvent: ((event: Event) => void) | null = null

function setOnEvent(handler: ((event: Event) => void) | null): void {
  onEvent = handler
}

function push(event: Event): void {
  events.value.push({
    id: nextId++,
    type: event.type,
    properties: event.properties,
    receivedAt: Date.now(),
  })
  if (events.value.length > MAX_EVENTS) {
    events.value.splice(0, events.value.length - MAX_EVENTS)
  }
  onEvent?.(event)
}

async function start(client: OpencodeClient): Promise<void> {
  stop()
  controller = new AbortController()
  streaming.value = true
  try {
    const result = await client.event.subscribe({ signal: controller.signal })
    for await (const event of result.stream) {
      push(event)
    }
  } catch {
    // stream terminated (e.g. on abort); reconnect is driven by the store
  } finally {
    streaming.value = false
  }
}

function stop(): void {
  controller?.abort()
  controller = null
  streaming.value = false
}

function clear(): void {
  events.value = []
  nextId = 0
}

export function useEventStream() {
  return { events, streaming, start, stop, clear, setOnEvent }
}
