import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeClient } from '@opencode-ai/sdk/client'

function createMockClient() {
  return {
    provider: {
      list: vi.fn(),
    },
  }
}

// useModel keeps module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

async function load() {
  const mod = await import('@/composables/useModel')
  return mod.useModel()
}

describe('useModel', () => {
  it('lists only the free OpenCode Zen models', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.provider.list.mockResolvedValue({
      data: {
        all: [
          {
            id: 'opencode',
            name: 'OpenCode Zen',
            models: {
              'big-pickle': { id: 'big-pickle', name: 'Big Pickle' },
              'north-mini-code-free': {
                id: 'north-mini-code-free',
                name: 'North Mini Code Free',
              },
            },
          },
          {
            id: 'ollama',
            name: 'Ollama (local)',
            models: { 'qwen2.5-coder:14b': { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder' } },
          },
        ],
      },
      error: undefined,
    })

    await store.refresh(client)

    // Non-OpenCode Zen providers are excluded.
    expect(store.options.value.map((o) => o.providerID)).toEqual(['opencode', 'opencode'])
    expect(store.options.value.map((o) => o.modelID)).toEqual(['big-pickle', 'north-mini-code-free'])
  })

  it('selects a model by index and persists it', async () => {
    const store = await load()
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
    await store.refresh(client)

    store.select(0)

    expect(store.selected.value).toEqual({ providerID: 'opencode', modelID: 'big-pickle' })
    expect(store.selectedIndex.value).toBe('0')
    expect(store.selectedLabel.value).toBe('opencode/big-pickle')
    expect(window.localStorage.getItem('opencode-ui:model')).toBe(
      JSON.stringify({ providerID: 'opencode', modelID: 'big-pickle' }),
    )
  })

  it('defaults to the first free Zen model when nothing is stored', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.provider.list.mockResolvedValue({
      data: {
        all: [
          {
            id: 'opencode',
            name: 'OpenCode Zen',
            models: {
              'big-pickle': { id: 'big-pickle', name: 'Big Pickle' },
              'north-mini-code-free': {
                id: 'north-mini-code-free',
                name: 'North Mini Code Free',
              },
            },
          },
        ],
      },
      error: undefined,
    })

    await store.refresh(client)

    expect(store.selected.value).toEqual({ providerID: 'opencode', modelID: 'big-pickle' })
  })

  it('clears the selection back to the console default', async () => {
    const store = await load()
    const mock = createMockClient()
    const client = mock as unknown as OpencodeClient
    mock.provider.list.mockResolvedValue({ data: { all: [] }, error: undefined })
    await store.refresh(client)

    store.select(0)
    store.select(null)

    expect(store.selected.value).toBeNull()
    expect(store.selectedLabel.value).toBe('')
    expect(window.localStorage.getItem('opencode-ui:model')).toBeNull()
  })

  it('restores a persisted selection on refresh when the model still exists', async () => {
    window.localStorage.setItem(
      'opencode-ui:model',
      JSON.stringify({ providerID: 'opencode', modelID: 'big-pickle' }),
    )
    const store = await load()
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

    await store.refresh(client)

    expect(store.selected.value).toEqual({ providerID: 'opencode', modelID: 'big-pickle' })
  })

  it('drops a persisted selection when the model is no longer listed and defaults', async () => {
    window.localStorage.setItem(
      'opencode-ui:model',
      JSON.stringify({ providerID: 'opencode', modelID: 'ghost' }),
    )
    const store = await load()
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

    await store.refresh(client)

    expect(store.selected.value).toEqual({ providerID: 'opencode', modelID: 'big-pickle' })
  })
})
