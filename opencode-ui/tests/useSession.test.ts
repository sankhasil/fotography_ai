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

// useSession keeps module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
})

async function load() {
  const mod = await import('@/composables/useSession')
  return mod.useSession()
}

describe('useSession', () => {
  it('creates a session and tracks it as active', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [session('s1')], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'busy' } }, error: undefined })

    const created = await store.createSession(client, '/workspace')

    expect(mock.session.create).toHaveBeenCalledWith({ query: { directory: '/workspace' } })
    expect(created.id).toBe('s1')
    expect(store.activeSession.value?.id).toBe('s1')
    expect(store.sessions.value).toEqual([session('s1')])
    store.clearSession()
  })

  it('surfaces session creation errors', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.create.mockResolvedValue({ data: undefined, error: new Error('disk full') })

    await expect(store.createSession(client, null)).rejects.toThrow('disk full')
    expect(store.sessionError.value).toBe('Error: disk full')
  })

  it('switches the active session', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.status.mockResolvedValue({ data: { s2: { type: 'idle' } }, error: undefined })
    const target = session('s2')

    await store.selectSession(client, target)

    expect(store.activeSession.value?.id).toBe('s2')
    store.clearSession()
  })

  it('aborts the in-flight prompt optimistically', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'busy' } }, error: undefined })
    mock.session.abort.mockResolvedValue({ data: true, error: undefined })
    await store.createSession(client, null)
    store.sending.value = true

    await store.abort(client)

    expect(mock.session.abort).toHaveBeenCalledWith({ path: { id: 's1' } })
    expect(store.sending.value).toBe(false)
    expect(store.sessionStatus.value).toBe('idle')
    store.clearSession()
  })

  it('sends the selected model in the prompt body', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'idle' } }, error: undefined })
    mock.session.prompt.mockResolvedValue({
      data: {
        info: { id: 'm1', sessionID: 's1', role: 'user', time: { created: 1 }, agent: 'user' },
        parts: [],
      },
      error: undefined,
    })
    await store.createSession(client, null)

    await store.sendPrompt(client, 'hello', { providerID: 'opencode', modelID: 'big-pickle' })

    expect(mock.session.prompt).toHaveBeenCalledWith({
      path: { id: 's1' },
      body: {
        parts: [{ type: 'text', text: 'hello' }],
        model: { providerID: 'opencode', modelID: 'big-pickle' },
      },
    })
    store.clearSession()
  })

  it('marks the session busy while a prompt is in flight and reconciles after', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'busy' } }, error: undefined })
    let resolvePrompt!: (result: { data: unknown; error: undefined }) => void
    mock.session.prompt.mockImplementation(
      () => new Promise((resolve) => (resolvePrompt = resolve)),
    )
    await store.createSession(client, null)

    const promise = store.sendPrompt(client, 'hello')
    expect(store.sending.value).toBe(true)
    expect(store.sessionStatus.value).toBe('busy')

    resolvePrompt({
      data: {
        info: { id: 'm1', sessionID: 's1', role: 'user', time: { created: 1 }, agent: 'user' },
        parts: [],
      },
      error: undefined,
    })
    await promise
    expect(store.sending.value).toBe(false)
    expect(store.sessionStatus.value).toBe('busy')
    store.clearSession()
  })

  it('resets busy when the prompt fails', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.session.create.mockResolvedValue({ data: session('s1'), error: undefined })
    mock.session.list.mockResolvedValue({ data: [], error: undefined })
    mock.session.status.mockResolvedValue({ data: { s1: { type: 'idle' } }, error: undefined })
    mock.session.prompt.mockResolvedValue({ data: undefined, error: new Error('model down') })
    await store.createSession(client, null)

    await expect(store.sendPrompt(client, 'hello')).rejects.toThrow('model down')
    expect(store.sending.value).toBe(false)
    expect(store.sessionStatus.value).toBe('idle')
    store.clearSession()
  })
})
