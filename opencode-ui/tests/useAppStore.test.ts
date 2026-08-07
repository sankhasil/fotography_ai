import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeClient, Session } from '@opencode-ai/sdk/client'

function createMockClient() {
  return {
    session: {
      create: vi.fn(),
      status: vi.fn(),
      list: vi.fn(),
      prompt: vi.fn(),
      abort: vi.fn(),
    },
    provider: {
      list: vi.fn(),
    },
  }
}

function session(id: string): Session {
  return {
    id,
    projectID: 'proj',
    directory: '/workspace',
    title: '',
    version: '1',
    time: { created: 0, updated: 0 },
  }
}

// Composables keep module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
})

async function load() {
  const opencode = (await import('@/composables/useOpenCode')).useOpenCode()
  const conversation = (await import('@/composables/useConversation')).useConversation()
  const store = (await import('@/composables/useAppStore')).useAppStore()
  return { opencode, conversation, store }
}

describe('useAppStore', () => {
  it('keeps the sent user turn visible when the model call fails', async () => {
    const { opencode, conversation, store } = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    opencode.client.value = client
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'idle' } }, error: undefined })
    await store.createSession(client, '/workspace')
    mock.session.prompt.mockResolvedValue({ data: undefined, error: new Error('model unavailable') })

    await expect(store.sendPrompt('hello world')).rejects.toThrow('model unavailable')

    const records = conversation.messagesFor('s1')
    expect(records).toHaveLength(1)
    expect(records[0].info?.role).toBe('user')
    expect(records[0].parts[0]).toMatchObject({ type: 'text', text: 'hello world' })
  })

  it('feeds the prompt result when the model call succeeds', async () => {
    const { opencode, conversation, store } = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    opencode.client.value = client
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'idle' } }, error: undefined })
    await store.createSession(client, '/workspace')
    mock.session.prompt.mockResolvedValue({
      data: {
        info: { id: 'm1', sessionID: 's1', role: 'user', time: { created: 1 }, agent: 'user' },
        parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'hello world' }],
      },
      error: undefined,
    })

    await store.sendPrompt('hello world')

    const records = conversation.messagesFor('s1')
    expect(records).toHaveLength(1)
    expect(records[0].parts[0]).toMatchObject({ type: 'text', text: 'hello world' })
  })

  it('sends the selected model with the prompt', async () => {
    const { opencode, store } = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.provider.list.mockResolvedValue({
      data: {
        all: [
          {
            id: 'opencode',
            name: 'OpenCode Zen',
            models: { 'big-pickle': { id: 'big-pickle', name: 'Big Pickle' } },
          },
        ],
      },
      error: undefined,
    })
    // The store refreshes the model list when the connection becomes ready.
    opencode.status.value = 'connected'
    opencode.client.value = client
    await new Promise((resolve) => setTimeout(resolve, 0))
    store.selectModel(0)
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'idle' } }, error: undefined })
    mock.session.prompt.mockResolvedValue({
      data: {
        info: { id: 'm1', sessionID: 's1', role: 'user', time: { created: 1 }, agent: 'user' },
        parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'hi' }],
      },
      error: undefined,
    })

    await store.sendPrompt('hi')

    expect(mock.session.prompt).toHaveBeenCalledWith({
      path: { id: 's1' },
      body: {
        parts: [{ type: 'text', text: 'hi' }],
        model: { providerID: 'opencode', modelID: 'big-pickle' },
      },
    })
  })
})
