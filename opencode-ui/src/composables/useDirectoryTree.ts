import { computed, reactive, ref } from 'vue'
import type { OpencodeClient } from '@opencode-ai/sdk/client'

// Session-scoped directory tree. Module-level reactive state (like
// useConversation) so the cache and traversal survive the dialog being opened
// and closed. Every node is stored once in a unique index keyed by its absolute
// path — O(1) lookup, minimal metadata (name + type), no file details.

const LARGE_FOLDER_THRESHOLD = 200

interface DirNode {
  name: string
  absolute: string
  type: 'file' | 'directory'
}

interface CacheEntry {
  nodes: DirNode[]
  loading: boolean
  fetched: boolean
}

// --- unique metadata index ---------------------------------------------------
// absolute path -> node. Each entry exists exactly once.
const nodes = reactive(new Map<string, DirNode>())

// parent path -> its cached children
const cache = reactive(new Map<string, CacheEntry>())

// in-flight request dedup: path -> shared promise
const inflight = new Map<string, Promise<DirNode[]>>()

// Shallowest path the server has allowed so far. file.list rejects anything
// above the project location with HTTP 500; we track the ceiling dynamically —
// it starts at the server directory and moves up only when a parent load
// succeeds. This guarantees we never fire a request we know will fail.
const ceilingPath = ref<string | null>(null)

const trail = ref<string[]>([])

function isAboveCeiling(path: string): boolean {
  const ceiling = ceilingPath.value
  if (!ceiling) return false
  // path is above ceiling if it is a proper prefix of ceiling (shorter).
  return ceiling.startsWith(path.endsWith('/') ? path : path + '/') && path !== ceiling
}

function register(node: DirNode): DirNode {
  const existing = nodes.get(node.absolute)
  if (existing) return existing
  nodes.set(node.absolute, node)
  return node
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx < 0 ? trimmed : trimmed.slice(idx + 1)
}

function sortEntries(entries: DirNode[]): DirNode[] {
  return [...entries].sort(
    (a, b) => Number(b.type === 'directory') - Number(a.type === 'directory') || a.name.localeCompare(b.name),
  )
}

async function fetchChildren(client: OpencodeClient, path: string): Promise<DirNode[]> {
  const inFlight = inflight.get(path)
  if (inFlight) return inFlight
  const promise = (async () => {
    const result = await client.file.list({ query: { path } })
    // The SDK returns errors as result.error (tuple path) rather than throwing.
    // Treat any error response as a failed load so the ceiling can lock.
    if (result.error) {
      throw new Error(extractErrorMessage(result.error))
    }
    const fetched: DirNode[] = (result.data ?? [])
      .filter((n) => !n.ignored)
      .map((n) => register({ name: basename(n.absolute), absolute: n.absolute, type: n.type }))
    cache.set(path, { nodes: sortEntries(fetched), loading: false, fetched: true })
    inflight.delete(path)
    return fetched
  })().catch((err) => {
    const entry = cache.get(path)
    if (entry) entry.loading = false
    inflight.delete(path)
    throw err
  })
  inflight.set(path, promise)
  return promise
}

export function useDirectoryTree() {
  const currentPath = ref('/')
  const entries = ref<DirNode[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const totalCount = computed(() => entries.value.length)
  const isLarge = computed(() => totalCount.value > LARGE_FOLDER_THRESHOLD)
  // No parent button / breadcrumb works at or above the ceiling.
  const atCeiling = computed(() => ceilingPath.value != null && currentPath.value === ceilingPath.value)

  const crumbs = computed(() => {
    const trimmed = currentPath.value.replace(/\/+$/, '')
    const parts = trimmed.split('/').filter(Boolean)
    const items: Array<{ label: string; path: string; enabled: boolean }> = [{ label: '/', path: '/', enabled: true }]
    let acc = ''
    for (const part of parts) {
      acc += `/${part}`
      items.push({ label: part || '/', path: acc, enabled: !isAboveCeiling(acc) })
    }
    return items
  })

  async function load(client: OpencodeClient | null, path: string): Promise<void> {
    if (!client) return
    if (isAboveCeiling(path)) {
      error.value = 'That folder is outside the project and cannot be opened here.'
      return
    }
    const cached = cache.get(path)
    if (cached && cached.fetched && !cached.loading) {
      // cache hit — instant, no network
      currentPath.value = path
      entries.value = cached.nodes
      error.value = null
      return
    }
    const previousPath = currentPath.value
    loading.value = true
    error.value = null
    cache.set(path, { nodes: cached?.nodes ?? [], loading: true, fetched: cached?.fetched ?? false })
    try {
      const fetched = await fetchChildren(client, path)
      currentPath.value = path
      entries.value = fetched
    } catch (err) {
      currentPath.value = previousPath
      const message = String(err)
      // Navigating UP to an ancestor that the server won't list is the project
      // boundary — lock the ceiling there so it's never retried, and hide the
      // parent button (no banner: the user simply can't go higher). A failed
      // load of the current/start path is a real error — show it but don't lock.
      const navigatingUp = path.length < previousPath.length
      if (navigatingUp) {
        ceilingPath.value = previousPath
        error.value = null
      } else {
        error.value = humanizeError(message)
      }
    } finally {
      loading.value = false
    }
  }

  async function enter(client: OpencodeClient | null, path: string): Promise<void> {
    await load(client, path)
    if (!error.value && trail.value[trail.value.length - 1] !== path) {
      trail.value = [...trail.value, path]
    }
  }

  async function jumpTo(client: OpencodeClient | null, path: string): Promise<void> {
    await load(client, path)
    if (!error.value) {
      const idx = trail.value.indexOf(path)
      trail.value = idx >= 0 ? trail.value.slice(0, idx + 1) : [path]
    }
  }

  async function reload(client: OpencodeClient | null): Promise<void> {
    cache.delete(currentPath.value)
    await load(client, currentPath.value)
  }

  function isCached(path: string): boolean {
    return cache.get(path)?.fetched ?? false
  }

  return {
    currentPath,
    entries,
    loading,
    error,
    totalCount,
    isLarge,
    atCeiling,
    trail,
    crumbs,
    isCached,
    LARGE_FOLDER_THRESHOLD,
    load,
    enter,
    jumpTo,
    reload,
  }
}

// Test-only: clear all session state so specs start fresh.
export function resetDirectoryTree(): void {
  nodes.clear()
  cache.clear()
  inflight.clear()
  trail.value = []
  ceilingPath.value = null
}

// Pull a readable message out of an SDK error, which arrives as either a
// string or a structured {name, data:{message}} object.
function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null) {
    const data = (error as { data?: { message?: string } }).data
    if (typeof data?.message === 'string') return data.message
    if (typeof (error as { message?: string }).message === 'string') {
      return (error as { message?: string }).message as string
    }
  }
  return JSON.stringify(error)
}

function humanizeError(raw: string): string {
  if (raw.includes('Path escapes the location')) {
    return 'That folder is outside the project and cannot be opened here.'
  }
  if (raw.includes('not found') || raw.includes('ENOENT')) {
    return 'That folder could not be found.'
  }
  return raw
}

// Expose the reset on window so Cypress specs (which can't resolve the `@/`
// alias) can clear session state between tests. Harmless in production.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __resetDirectoryTree?: () => void }).__resetDirectoryTree = resetDirectoryTree
}
