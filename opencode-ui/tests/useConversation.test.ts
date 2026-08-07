import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, Message } from '@opencode-ai/sdk/client'

// useConversation keeps module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
})

async function load() {
  const mod = await import('@/composables/useConversation')
  return mod.useConversation()
}

function textEvent(messageID: string, partID: string, text: string, delta = text): Event {
  return {
    type: 'message.part.updated',
    properties: {
      part: { id: partID, sessionID: 's1', messageID, type: 'text', text },
      delta,
    },
  }
}

function assistant(id: string): Message {
  return {
    id,
    sessionID: 's1',
    role: 'assistant',
    time: { created: 0 },
    parentID: 'p',
    modelID: 'm',
    providerID: 'p',
    mode: 'x',
    path: { cwd: '/', root: '/' },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

describe('useConversation event reducer', () => {
  it('appends incremental deltas for text parts', async () => {
    const conversation = await load()
    conversation.reduceEvent(textEvent('m1', 'p1', 'Hel', 'Hel'))
    conversation.reduceEvent(textEvent('m1', 'p1', 'Hello', 'lo'))
    const [record] = conversation.messagesFor('s1')
    expect(record.info).toBeNull()
    const part = record.parts[0]
    expect(part.type).toBe('text')
    if (part.type === 'text') expect(part.text).toBe('Hello')
  })

  it('appends tokens from message.part.delta events', async () => {
    const conversation = await load()
    conversation.reduceEvent(textEvent('m1', 'p1', ''))
    conversation.reduceEvent({
      type: 'message.part.delta',
      properties: { sessionID: 's1', messageID: 'm1', partID: 'p1', field: 'text', delta: 'Hel' },
    })
    conversation.reduceEvent({
      type: 'message.part.delta',
      properties: { sessionID: 's1', messageID: 'm1', partID: 'p1', field: 'text', delta: 'lo' },
    })
    const [record] = conversation.messagesFor('s1')
    const part = record.parts[0]
    expect(part.type).toBe('text')
    if (part.type === 'text') expect(part.text).toBe('Hello')
  })

  it('ignores deltas for unknown parts', async () => {
    const conversation = await load()
    conversation.reduceEvent({
      type: 'message.part.delta',
      properties: { sessionID: 's1', messageID: 'm1', partID: 'nope', field: 'text', delta: 'x' },
    })
    expect(conversation.messagesFor('s1')).toHaveLength(0)
  })

  it('keeps messages from different sessions separate', async () => {
    const conversation = await load()
    conversation.reduceEvent(textEvent('m1', 'p1', 'a', 'a'))
    conversation.reduceEvent({
      type: 'message.part.updated',
      properties: {
        part: { id: 'p2', sessionID: 's2', messageID: 'm2', type: 'text', text: 'b' },
        delta: 'b',
      },
    })
    expect(conversation.messagesFor('s1')).toHaveLength(1)
    expect(conversation.messagesFor('s2')).toHaveLength(1)
  })

  it('removes parts and whole messages', async () => {
    const conversation = await load()
    conversation.reduceEvent(textEvent('m1', 'p1', 'one'))
    conversation.reduceEvent(textEvent('m1', 'p2', 'two'))
    conversation.reduceEvent({
      type: 'message.part.removed',
      properties: { sessionID: 's1', messageID: 'm1', partID: 'p1' },
    })
    expect(conversation.messagesFor('s1')[0].parts).toHaveLength(1)
    conversation.reduceEvent({
      type: 'message.removed',
      properties: { sessionID: 's1', messageID: 'm1' },
    })
    expect(conversation.messagesFor('s1')).toHaveLength(0)
  })

  it('stores the latest file diffs per session', async () => {
    const conversation = await load()
    const diff = { file: 'a.txt', before: 'x', after: 'y', additions: 1, deletions: 1 }
    conversation.reduceEvent({
      type: 'session.diff',
      properties: { sessionID: 's1', diff: [diff] },
    })
    expect(conversation.diffsFor('s1')).toEqual([diff])
  })

  it('replaces an entire session on switch', async () => {
    const conversation = await load()
    conversation.reduceEvent(textEvent('m1', 'p1', 'old'))
    conversation.replaceSession('s1', [
      {
        info: assistant('m2'),
        parts: [{ id: 'p3', sessionID: 's1', messageID: 'm2', type: 'text', text: 'new' }],
      },
    ])
    const records = conversation.messagesFor('s1')
    expect(records).toHaveLength(1)
    expect(records[0].info?.id).toBe('m2')
  })
})

describe('hasAssistantOutput', () => {
  function assistantMessage(id: string, role: Message['role']): Event {
    return {
      type: 'message.updated',
      properties: { info: { ...assistant(id), role } as Message },
    }
  }

  it('is false for an echoed user turn', async () => {
    const conversation = await load()
    conversation.reduceEvent(assistantMessage('m1', 'user'))
    conversation.reduceEvent(textEvent('m1', 'p1', 'hello'))
    expect(conversation.hasAssistantOutput(conversation.messagesFor('s1'))).toBe(false)
  })

  it('is true once an assistant text part has content', async () => {
    const conversation = await load()
    conversation.reduceEvent(assistantMessage('m2', 'assistant'))
    conversation.reduceEvent(textEvent('m2', 'p2', 'Hi'))
    expect(conversation.hasAssistantOutput(conversation.messagesFor('s1'))).toBe(true)
  })

  it('is true for a non-text assistant part', async () => {
    const conversation = await load()
    conversation.reduceEvent(assistantMessage('m1', 'assistant'))
    conversation.reduceEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'p1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'tool',
          callID: 't1',
          tool: 'shell',
          state: { status: 'pending', input: {}, raw: '' },
        },
        delta: '',
      },
    })
    expect(conversation.hasAssistantOutput(conversation.messagesFor('s1'))).toBe(true)
  })

  it('is false for an empty assistant text part', async () => {
    const conversation = await load()
    conversation.reduceEvent(assistantMessage('m1', 'assistant'))
    conversation.reduceEvent(textEvent('m1', 'p1', ''))
    expect(conversation.hasAssistantOutput(conversation.messagesFor('s1'))).toBe(false)
  })
})
