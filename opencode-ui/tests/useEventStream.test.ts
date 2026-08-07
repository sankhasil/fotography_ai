import { beforeEach, describe, expect, it, vi } from 'vitest'

// useEventStream keeps module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
})

async function load() {
  const mod = await import('@/composables/useEventStream')
  return mod.useEventStream()
}

describe('useEventStream', () => {
  it('keeps the consumer wired after the stream (re)starts', async () => {
    const stream = await load()
    const handler = vi.fn()
    stream.setOnEvent(handler)
    const client = {
      event: {
        subscribe: () => ({
          stream: (async function* () {
            yield { type: 'message.updated', properties: { info: { id: 'm1' } } }
          })(),
        }),
      },
    }

    await stream.start(client as never)

    expect(handler).toHaveBeenCalledTimes(1)
    stream.stop()
  })
})
