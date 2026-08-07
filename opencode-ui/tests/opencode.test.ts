import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@opencode-ai/sdk/client', () => ({
  createOpencodeClient: (config: { baseUrl: string }) => ({ baseUrl: config.baseUrl }),
}))

import * as opencode from '@/services/opencode'

const FIRST = 'http://a:1'
const SECOND = 'http://b:2'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('configuredUrls', () => {
  it('defaults to localhost:4096', () => {
    expect(opencode.configuredUrls()).toEqual(['http://localhost:4096'])
  })

  it('parses the VITE_OPENCODE_URLS list in order', () => {
    vi.stubEnv('VITE_OPENCODE_URLS', ` ${FIRST} , ${SECOND} `)
    expect(opencode.configuredUrls()).toEqual([FIRST, SECOND])
  })
})

describe('connect', () => {
  it('attaches to the first reachable console', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const connection = await opencode.connect()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4096/config')
    expect(connection.url).toBe('http://localhost:4096')
  })

  it('probes each configured URL until one answers', async () => {
    vi.stubEnv('VITE_OPENCODE_URLS', `${FIRST}, ${SECOND}`)
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const connection = await opencode.connect()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(connection.url).toBe(SECOND)
  })

  it('throws when every URL is unreachable', async () => {
    vi.stubEnv('VITE_OPENCODE_URLS', `${FIRST}, ${SECOND}`)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    await expect(opencode.connect()).rejects.toThrow(/No OpenCode console reachable/)
  })
})
