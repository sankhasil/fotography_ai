import { beforeEach, describe, expect, it, vi } from 'vitest'

// useTheme reads localStorage and document.documentElement once on import, so
// reset modules per test to exercise a fresh init. nextTick is loaded from the
// same fresh vue instance so the persistence watcher flushes correctly.
beforeEach(() => {
  window.localStorage.clear()
  vi.resetModules()
})

async function load() {
  const theme = await import('@/composables/useTheme')
  const vue = await import('vue')
  return { useTheme: theme.useTheme, nextTick: vue.nextTick }
}

describe('useTheme', () => {
  it('defaults to the casual light theme', async () => {
    const { useTheme } = await load()
    const { theme, tone } = useTheme()
    expect(theme.value).toBe('casual')
    expect(tone.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('casual')
    expect(document.documentElement.dataset.tone).toBe('light')
  })

  it('forces dark in matrix and ignores tone toggles there', async () => {
    const { useTheme, nextTick } = await load()
    const { theme, tone, setTheme, toggleTone } = useTheme()
    setTheme('matrix')
    await nextTick()
    expect(theme.value).toBe('matrix')
    expect(tone.value).toBe('dark')
    expect(document.documentElement.dataset.tone).toBe('dark')
    toggleTone()
    await nextTick()
    expect(tone.value).toBe('dark')
    expect(window.localStorage.getItem('opencode-ui:tone')).toBe('light')
  })

  it('switches tone outside matrix and persists the preference', async () => {
    const { useTheme, nextTick } = await load()
    const { theme, tone, setTheme, toggleTone } = useTheme()
    setTheme('cartoony')
    toggleTone()
    await nextTick()
    expect(theme.value).toBe('cartoony')
    expect(tone.value).toBe('dark')
    expect(window.localStorage.getItem('opencode-ui:theme')).toBe('cartoony')
    expect(window.localStorage.getItem('opencode-ui:tone')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('cartoony')
    expect(document.documentElement.dataset.tone).toBe('dark')
  })

  it('restores the preferred tone when leaving matrix', async () => {
    const { useTheme, nextTick } = await load()
    const { tone, setTheme } = useTheme()
    setTheme('matrix')
    await nextTick()
    expect(tone.value).toBe('dark')
    setTheme('casual')
    await nextTick()
    expect(tone.value).toBe('light')
    expect(window.localStorage.getItem('opencode-ui:tone')).toBe('light')
  })

  it('restores a persisted theme on reload', async () => {
    window.localStorage.setItem('opencode-ui:theme', 'jarvis')
    window.localStorage.setItem('opencode-ui:tone', 'dark')
    const { useTheme } = await load()
    const { theme, tone } = useTheme()
    expect(theme.value).toBe('jarvis')
    expect(tone.value).toBe('dark')
  })

  it('ignores an invalid persisted theme', async () => {
    window.localStorage.setItem('opencode-ui:theme', 'neon')
    const { useTheme } = await load()
    const { theme } = useTheme()
    expect(theme.value).toBe('casual')
  })
})
