import { ref } from 'vue'

// Folder entry points, configured in the .env files as VITE_FOLDERS=Label=path
// pairs (comma-separated). These are the only folders the UI shows — each is a
// pinned tab tagged "default" with no add/remove. Browse can still select a
// sub-path for the current session, but that selection is not persisted as a
// tab. The active folder survives reloads via localStorage.

const ACTIVE_KEY = 'opencode-ui:active-folder'

export interface ConfiguredFolder {
  label: string
  path: string
}

export function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed || '/'
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx < 0 ? trimmed : trimmed.slice(idx + 1)
}

// VITE_FOLDERS=Label=path,Label2=path2 — a bare path without "=" falls back to
// its basename as the label.
function parseConfigured(): ConfiguredFolder[] {
  const raw = import.meta.env.VITE_FOLDERS
  if (!raw) return []
  const folders: ConfiguredFolder[] = []
  for (const entry of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
    const idx = entry.indexOf('=')
    if (idx === -1) {
      const path = normalizePath(entry)
      folders.push({ label: basename(path), path })
    } else {
      const label = entry.slice(0, idx).trim()
      const path = normalizePath(entry.slice(idx + 1).trim())
      folders.push(label ? { label, path } : { label: basename(path), path })
    }
  }
  return folders
}

function readActive(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

// Build-time constant: VITE_ vars are injected by Vite and fixed per build.
export const configuredFolders: ConfiguredFolder[] = parseConfigured()
const activeFolder = ref<string | null>(readActive() ?? configuredFolders[0]?.path ?? null)

function setActiveFolder(path: string | null): void {
  activeFolder.value = path === null ? null : normalizePath(path)
  try {
    if (activeFolder.value === null) {
      window.localStorage.removeItem(ACTIVE_KEY)
    } else {
      window.localStorage.setItem(ACTIVE_KEY, activeFolder.value)
    }
  } catch {
    // storage unavailable — selection still applies for this session
  }
}

export function useFolders() {
  return { configuredFolders, activeFolder, setActiveFolder }
}

// Test-only: clear the active selection so specs start fresh (browse then
// falls back to the server default directory).
export function resetFolders(): void {
  activeFolder.value = null
  try {
    window.localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // ignore
  }
}

// Expose the reset on window so Cypress specs (which can't resolve the `@/`
// alias) can clear folder state between tests. Harmless in production.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __resetFolders?: () => void }).__resetFolders = resetFolders
}
