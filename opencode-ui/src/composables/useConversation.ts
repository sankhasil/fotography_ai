import { reactive, ref } from 'vue'
import type { Event, FileDiff, Message, Part } from '@opencode-ai/sdk/client'

import { advance, observe, completeTaskPct, type StageKey } from '@/composables/useTaskPct'
import { useTokenUsage } from '@/composables/useTokenUsage'

export interface MessageRecord {
  info: Message | null
  parts: Part[]
}

// ponytail: The console streams text tokens via `message.part.delta`, which the
// SDK's Event union does not yet include (server v1.18.x). A local shape keeps
// streaming smooth until the SDK ships the type, then this can be replaced.
export interface PartDeltaEvent {
  type: 'message.part.delta'
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }
}

// Keyed by message id. Insertion order matches the stream order, so rendering
// order is preserved without sorting.
const messages = reactive(new Map<string, MessageRecord>())
// Keyed by session id; replaced wholesale on each session.diff event.
const diffs = reactive(new Map<string, FileDiff[]>())
const lastEventAt = ref<number | null>(null)

function upsertRecord(messageID: string): MessageRecord {
  let record = messages.get(messageID)
  if (!record) {
    record = { info: null, parts: [] }
    messages.set(messageID, record)
  }
  return record
}

function upsertMessage(message: Message): void {
  const record = upsertRecord(message.id)
  record.info = message
  if (message.sessionID) {
    useTokenUsage().accumulateTokens(message.sessionID, message)
  }
}

function upsertPart(part: Part, delta?: string): void {
  const record = upsertRecord(part.messageID)
  const index = record.parts.findIndex((existing) => existing.id === part.id)
  if (index === -1) {
    record.parts.push(part)
    return
  }
  const current = record.parts[index]
  if (delta && part.type === 'text' && current.type === 'text') {
    record.parts[index] = { ...current, text: current.text + delta }
  } else if (delta && part.type === 'reasoning' && current.type === 'reasoning') {
    record.parts[index] = { ...current, text: current.text + delta }
  } else {
    record.parts[index] = part
  }
}

function removePart(messageID: string, partID: string): void {
  const record = messages.get(messageID)
  if (!record) return
  record.parts = record.parts.filter((part) => part.id !== partID)
}

function removeMessage(messageID: string): void {
  messages.delete(messageID)
}

// Returns the part type when a text field was appended, so the reducer can
// feed the delta into the right progress band.
function appendPartDelta(
  messageID: string,
  partID: string,
  field: string,
  delta: string,
): string | null {
  const record = messages.get(messageID)
  if (!record) return null
  const index = record.parts.findIndex((part) => part.id === partID)
  if (index === -1) return null
  const current = record.parts[index]
  if (field === 'text' && (current.type === 'text' || current.type === 'reasoning')) {
    record.parts[index] = { ...current, text: current.text + delta }
    return current.type
  }
  return null
}

// Map a real stream event to the progress phase it signals, so the busy clock
// advances on actual work instead of a timer. Text only counts as "streaming"
// once it belongs to an assistant message — the user's echoed prompt is text
// too and must not light up the responding phase.
function stageForEvent(
  event: Event | PartDeltaEvent,
): { sessionID: string; stage: StageKey } | null {
  switch (event.type) {
    case 'message.part.updated': {
      const part = event.properties.part
      if (part.type === 'reasoning') return { sessionID: part.sessionID, stage: 'reasoning' }
      if (part.type === 'tool') return { sessionID: part.sessionID, stage: 'searching' }
      if (
        part.type === 'text' &&
        messages.get(part.messageID)?.info?.role === 'assistant'
      ) {
        return { sessionID: part.sessionID, stage: 'streaming' }
      }
      return null
    }
    case 'session.diff':
      return { sessionID: event.properties.sessionID, stage: 'applying' }
    default:
      return null
  }
}

function reduceEvent(event: Event | PartDeltaEvent): void {
  lastEventAt.value = Date.now()
  switch (event.type) {
    case 'message.updated':
      upsertMessage(event.properties.info)
      break
    case 'message.part.updated':
      upsertPart(event.properties.part, event.properties.delta)
      break
    case 'message.part.delta': {
      const partType = appendPartDelta(
        event.properties.messageID,
        event.properties.partID,
        event.properties.field,
        event.properties.delta,
      )
      // The delta stream is the only in-flight token signal; feed it to the
      // progress clock so the busy pies fill during reasoning and streaming
      // instead of waiting for each phase's terminal part.updated. Reasoning
      // belongs to the assistant by construction; text only counts once it is
      // an assistant answer (the echoed user turn must not light up streaming).
      if (event.properties.field === 'text' && partType === 'reasoning') {
        advance(event.properties.sessionID, 'reasoning', event.properties.delta.length)
      } else if (
        event.properties.field === 'text' &&
        partType === 'text' &&
        messages.get(event.properties.messageID)?.info?.role === 'assistant'
      ) {
        advance(event.properties.sessionID, 'streaming', event.properties.delta.length)
      }
      break
    }
    case 'message.part.removed':
      removePart(event.properties.messageID, event.properties.partID)
      break
    case 'message.removed':
      removeMessage(event.properties.messageID)
      break
    case 'session.diff':
      diffs.set(event.properties.sessionID, event.properties.diff)
      break
    case 'session.idle':
      // End of the run: pop the busy clock to 100% for this session.
      completeTaskPct(event.properties.sessionID)
      break
  }
  const phase = stageForEvent(event)
  if (phase) observe(phase.sessionID, phase.stage)
}

function feedResult(info: Message, parts: Part[]): void {
  upsertMessage(info)
  for (const part of parts) upsertPart(part)
}

function clear(): void {
  messages.clear()
  diffs.clear()
}

function messagesFor(sessionID: string): MessageRecord[] {
  const records: MessageRecord[] = []
  for (const record of messages.values()) {
    const recordSession = record.info?.sessionID ?? record.parts[0]?.sessionID
    if (recordSession === sessionID) records.push(record)
  }
  return records
}

function diffsFor(sessionID: string): FileDiff[] {
  return diffs.get(sessionID) ?? []
}

// The model's output counts as rendered once an assistant turn carries a
// substantive part (a non-text part, or a text part with content). Drives the
// Matrix progress rain: it ends the moment streamed output starts rendering,
// while an echoed user turn keeps it going.
export function hasAssistantOutput(records: MessageRecord[]): boolean {
  return records.some(
    (record) =>
      record.info?.role === 'assistant' &&
      record.parts.some(
        (part) => part.type !== 'text' || ('text' in part && part.text.length > 0),
      ),
  )
}

function replaceSession(
  sessionID: string,
  entries: Array<{ info: Message; parts: Part[] }>,
): void {
  for (const id of [...messages.keys()]) {
    const record = messages.get(id)
    if (!record) continue
    const recordSession = record.info?.sessionID ?? record.parts[0]?.sessionID
    if (recordSession === sessionID) messages.delete(id)
  }
  for (const entry of entries) {
    upsertMessage(entry.info)
    for (const part of entry.parts) upsertPart(part)
  }
}

function replaceDiffs(sessionID: string, entries: FileDiff[]): void {
  diffs.set(sessionID, entries)
}

export function useConversation() {
  return {
    messages,
    lastEventAt,
    reduceEvent,
    feedResult,
    clear,
    messagesFor,
    diffsFor,
    hasAssistantOutput,
    replaceSession,
    replaceDiffs,
  }
}
