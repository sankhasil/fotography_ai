import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  window.localStorage.clear()
})

async function load() {
  const mod = await import('@/composables/useFolders')
  return { ...mod.useFolders(), normalizePath: mod.normalizePath, resetFolders: mod.resetFolders }
}

describe('useFolders', () => {
  it('normalizes trailing slashes', async () => {
    const { normalizePath } = await load()
    expect(normalizePath('/workspace/')).toBe('/workspace')
    expect(normalizePath('/')).toBe('/')
  })

  it('has no configured folders and no active folder when VITE_FOLDERS is unset', async () => {
    vi.stubEnv('VITE_FOLDERS', '')
    const { configuredFolders, activeFolder } = await load()

    expect(configuredFolders).toEqual([])
    expect(activeFolder.value).toBeNull()
  })

  it('parses Label=path pairs from VITE_FOLDERS', async () => {
    vi.stubEnv('VITE_FOLDERS', 'Web=/workspace/ui/,Api=/workspace/api')
    const { configuredFolders, activeFolder } = await load()

    expect(configuredFolders).toEqual([
      { label: 'Web', path: '/workspace/ui' },
      { label: 'Api', path: '/workspace/api' },
    ])
    expect(activeFolder.value).toBe('/workspace/ui')
  })

  it('falls back to the basename for a bare path entry', async () => {
    vi.stubEnv('VITE_FOLDERS', '/workspace/ui')
    const { configuredFolders } = await load()

    expect(configuredFolders).toEqual([{ label: 'ui', path: '/workspace/ui' }])
  })

  it('skips empty entries', async () => {
    vi.stubEnv('VITE_FOLDERS', 'Web=/workspace,')
    const { configuredFolders } = await load()

    expect(configuredFolders).toEqual([{ label: 'Web', path: '/workspace' }])
  })

  it('persists the active folder and restores it on reload', async () => {
    vi.stubEnv('VITE_FOLDERS', 'Web=/workspace')
    const first = await load()
    first.setActiveFolder('/workspace/api')

    const second = await load()
    expect(second.activeFolder.value).toBe('/workspace/api')
  })

  it('clears the persisted active folder when set to null', async () => {
    vi.stubEnv('VITE_FOLDERS', 'Web=/workspace')
    const { setActiveFolder } = await load()
    setActiveFolder('/workspace')
    setActiveFolder(null)

    expect(window.localStorage.getItem('opencode-ui:active-folder')).toBeNull()
  })

  it('resetFolders clears the active folder', async () => {
    vi.stubEnv('VITE_FOLDERS', 'Web=/workspace')
    const { setActiveFolder, activeFolder, resetFolders } = await load()
    setActiveFolder('/workspace')

    resetFolders()

    expect(activeFolder.value).toBeNull()
    expect(window.localStorage.getItem('opencode-ui:active-folder')).toBeNull()
  })
})
