import { beforeEach, describe, expect, it, vi } from 'vitest'

// useSessionProvenance keeps module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

async function load() {
  return await import('@/composables/useSessionProvenance')
}

describe('useSessionProvenance', () => {
  it('tags a session as UI-created and persists it', async () => {
    const mod = await load()
    expect(mod.isUISession('s1')).toBe(false)

    mod.markAsUI('s1')

    expect(mod.isUISession('s1')).toBe(true)
    expect(window.localStorage.getItem('opencode-ui:session-origin')).toBe('{"s1":"ui"}')
  })

  it('treats untagged sessions as CLI sessions', async () => {
    const mod = await load()
    mod.markAsUI('s1')

    expect(mod.isUISession('s1')).toBe(true)
    expect(mod.isUISession('cli-session')).toBe(false)
  })

  it('forgets a tag when a session is deleted', async () => {
    const mod = await load()
    mod.markAsUI('s1')

    mod.forget('s1')

    expect(mod.isUISession('s1')).toBe(false)
    expect(window.localStorage.getItem('opencode-ui:session-origin')).toBe('{}')
  })

  it('restores persisted tags on load', async () => {
    window.localStorage.setItem('opencode-ui:session-origin', '{"s9":"ui"}')
    const mod = await load()

    expect(mod.isUISession('s9')).toBe(true)
    expect(mod.isUISession('other')).toBe(false)
  })

  it('reset clears all tags', async () => {
    const mod = await load()
    mod.markAsUI('s1')

    mod.resetSessionProvenance()

    expect(mod.isUISession('s1')).toBe(false)
    expect(window.localStorage.getItem('opencode-ui:session-origin')).toBeNull()
  })
})
