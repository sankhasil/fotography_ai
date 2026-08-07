import { beforeEach, describe, expect, it, vi } from 'vitest'

// Aliases are pure functions over the session id; resetModules simulates a
// reload to prove the same id always renders the same alias.
beforeEach(() => {
  vi.resetModules()
})

async function load() {
  return await import('@/composables/useSessionAlias')
}

describe('useSessionAlias', () => {
  it('renders {emoji} {Adjective} {Noun} format', async () => {
    const { sessionAlias } = await load()
    expect(sessionAlias('sess_abc123')).toMatch(/^[^ ]+ [A-Za-z]+ [A-Za-z]+$/)
  })

  it('is deterministic for the same session id', async () => {
    const { sessionAlias } = await load()
    expect(sessionAlias('sess_abc123')).toBe(sessionAlias('sess_abc123'))
  })

  it('renders the same alias across reloads', async () => {
    const a = (await load()).sessionAlias('sess_abc123')
    const b = (await load()).sessionAlias('sess_abc123')
    expect(a).toBe(b)
  })

  it('yields varied aliases across different ids', async () => {
    const { sessionAlias } = await load()
    const aliases = new Set(Array.from({ length: 20 }, (_, i) => sessionAlias(`sess_${i}`)))
    expect(aliases.size).toBeGreaterThan(15)
  })

  it('builds a map from a session list', async () => {
    const { aliases } = await load()
    const map = aliases([{ id: 's1' }, { id: 's2' }])
    expect(map.size).toBe(2)
    expect(map.get('s1')).toMatch(/^[^ ]+ [A-Za-z]+ [A-Za-z]+$/)
  })
})
