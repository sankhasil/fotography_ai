import { reactive, ref } from 'vue'
import type { Event, FileDiff, Message, Part } from '@opencode-ai/sdk/client'

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

function appendPartDelta(messageID: string, partID: string, field: string, delta: string): void {
  const record = messages.get(messageID)
  if (!record) return
  const index = record.parts.findIndex((part) => part.id === partID)
  if (index === -1) return
  const current = record.parts[index]
  if (field === 'text' && (current.type === 'text' || current.type === 'reasoning')) {
    record.parts[index] = { ...current, text: current.text + delta }
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
    case 'message.part.delta':
      appendPartDelta(
        event.properties.messageID,
        event.properties.partID,
        event.properties.field,
        event.properties.delta,
      )
      break
    case 'message.part.removed':
      removePart(event.properties.messageID, event.properties.partID)
      break
    case 'message.removed':
      removeMessage(event.properties.messageID)
      break
    case 'session.diff':
      diffs.set(event.properties.sessionID, event.properties.diff)
      break
  }
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
