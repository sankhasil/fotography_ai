import { reactive, ref } from 'vue'
import type {
  AssistantMessage,
  OpencodeClient,
  Part,
  Session,
  SessionStatus,
} from '@opencode-ai/sdk/client'
import { forget, isUISession, markAsUI } from '@/composables/useSessionProvenance'
import { normalizePath } from '@/composables/useFolders'

// Per-folder session pools. A folder path owns its own list of sessions and
// remembers which session was active while the user was working in it, so
// switching folders is instant and every folder's state stays warm in memory.
// The user may keep at most SESSION_LIMIT sessions per folder; creating past
// the limit returns a 'limit' outcome and the UI asks which session to free.

export const SESSION_LIMIT = 5

export type CreateOutcome =
  | { kind: 'created'; session: Session }
  | { kind: 'limit'; folder: string; sessions: Session[] }

export interface LimitState {
  folder: string
  sessions: Session[]
  queuedText?: string
}

const activeSession = ref<Session | null>(null)
// folder (normalized, '' for the server-default folder) -> its sessions
const pools = reactive(new Map<string, Session[]>())
// folder -> the session that was active the last time the user was in it
const activePerFolder = reactive(new Map<string, Session | null>())
const sessionStatus = ref<SessionStatus['type'] | null>(null)
const sessionError = ref<string | null>(null)
const sending = ref(false)
// Sessions currently mid-run on the server (the live CLI console session among
// them). Used to protect the running session from deletion.
const runningSessions = ref<Set<string>>(new Set())
// Set when a create would exceed SESSION_LIMIT; the UI asks which session to
// free. queuedText carries a prompt held back while the dialog is open.
const pendingLimit = ref<LimitState | null>(null)

let statusTimer: ReturnType<typeof setInterval> | null = null

function folderKey(folder: string | null): string {
  return folder === null || folder === '' ? '' : normalizePath(folder)
}

function stopStatusPolling(): void {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

async function refreshStatus(client: OpencodeClient): Promise<void> {
  if (!activeSession.value) return
  try {
    const result = await client.session.status({
      query: { directory: activeSession.value.directory },
    })
    const map = result.data
    sessionStatus.value = map?.[activeSession.value.id]?.type ?? null
  } catch {
    sessionStatus.value = null
  }
}

function startStatusPolling(client: OpencodeClient): void {
  stopStatusPolling()
  statusTimer = setInterval(() => void refreshStatus(client), 5000)
}

// Fetch the full status map (no directory filter) and track which sessions are
// mid-run. The running session is the live CLI console conversation — it must
// never be deletable from the UI.
async function refreshRunningSessions(client: OpencodeClient): Promise<void> {
  try {
    const result = await client.session.status()
    const map = result.data ?? {}
    runningSessions.value = new Set(
      Object.entries(map)
        .filter(([, status]) => status.type === 'busy')
        .map(([id]) => id),
    )
  } catch {
    runningSessions.value = new Set()
  }
}

function activate(session: Session): void {
  activeSession.value = session
  sessionStatus.value = null
  sessionError.value = null
}

async function createSession(
  client: OpencodeClient,
  folder: string | null,
): Promise<CreateOutcome> {
  const key = folderKey(folder)
  sessionError.value = null
  const existing = pools.get(key) ?? []
  // ponytail: the limit counts every session under the folder, including CLI
  // console ones. The dialog disables running sessions, which cannot be freed.
  if (existing.length >= SESSION_LIMIT) {
    return { kind: 'limit', folder: key, sessions: existing }
  }
  const options: { query?: { directory: string } } = key ? { query: { directory: key } } : {}
  const result = await client.session.create(options)
  if (result.error) {
    const message = String(result.error)
    sessionError.value = message
    throw new Error(message)
  }
  const created = result.data
  activate(created)
  activePerFolder.set(key, created)
  // Tag the new session as UI-created so it shows as deletable, not as a CLI
  // console session. The origin record lives in localStorage (see useSessionProvenance).
  markAsUI(created.id)
  void refreshStatus(client)
  void refreshRunningSessions(client)
  startStatusPolling(client)
  await listSessions(client, key)
  return { kind: 'created', session: created }
}

// Delete a session that blocks the folder's limit, then create a fresh one.
async function replaceAndCreate(
  client: OpencodeClient,
  folder: string | null,
  idToDelete: string,
): Promise<Session> {
  const key = folderKey(folder)
  sessionError.value = null
  const result = await client.session.delete({ path: { id: idToDelete } })
  if (result.error) {
    const message = String(result.error)
    sessionError.value = message
    throw new Error(message)
  }
  forget(idToDelete)
  if (activeSession.value?.id === idToDelete) clearActive()
  if (activePerFolder.get(key)?.id === idToDelete) activePerFolder.set(key, null)
  // Drop the freed session from the local pool so the follow-up create sees a
  // slot instead of hitting the limit again.
  pools.set(key, (pools.get(key) ?? []).filter((session) => session.id !== idToDelete))
  const outcome = await createSession(client, key)
  if (outcome.kind === 'limit') {
    // One session was just freed, so the create must succeed.
    throw new Error('Session limit still reached')
  }
  return outcome.session
}

async function listSessions(client: OpencodeClient, folder: string | null): Promise<void> {
  const key = folderKey(folder)
  const options: { query?: { directory: string } } = key ? { query: { directory: key } } : {}
  const result = await client.session.list(options)
  if (!result.error) pools.set(key, result.data ?? [])
  void refreshRunningSessions(client)
}

function sessionsFor(folder: string | null): Session[] {
  return pools.get(folderKey(folder)) ?? []
}

async function deleteSession(
  client: OpencodeClient,
  folder: string | null,
  id: string,
): Promise<void> {
  const key = folderKey(folder)
  const result = await client.session.delete({ path: { id } })
  if (result.error) {
    const message = String(result.error)
    sessionError.value = message
    throw new Error(message)
  }
  if (activeSession.value?.id === id) clearActive()
  if (activePerFolder.get(key)?.id === id) activePerFolder.set(key, null)
  // Drop the origin tag so the local record never grows with deleted sessions.
  forget(id)
  // Re-fetch so the server-side list (ordering, summaries) stays in sync.
  await listSessions(client, key)
}

// Bulk delete every UI-created session in the folder's pool. CLI console
// sessions and any session currently mid-run are kept — never delete a live
// conversation.
async function deleteUISessions(client: OpencodeClient, folder: string | null): Promise<void> {
  const key = folderKey(folder)
  const deleted = sessionsFor(key)
    .filter((session) => isUISession(session.id) && !runningSessions.value.has(session.id))
    .map((session) => session.id)
  sessionError.value = null
  for (const id of deleted) {
    const result = await client.session.delete({ path: { id } })
    if (result.error) {
      sessionError.value = String(result.error)
      throw new Error(String(result.error))
    }
    forget(id)
  }
  if (activeSession.value && deleted.includes(activeSession.value.id)) clearActive()
  if (activePerFolder.get(key) && deleted.includes(activePerFolder.get(key)!.id)) {
    activePerFolder.set(key, null)
  }
  await listSessions(client, key)
}

async function selectSession(client: OpencodeClient, session: Session): Promise<void> {
  activate(session)
  activePerFolder.set(folderKey(session.directory), session)
  void refreshStatus(client)
  startStatusPolling(client)
}

// Switch the focused folder: restore its remembered active session (or the
// most recently updated session in its pool), loading its session list.
async function activateFolder(client: OpencodeClient, folder: string | null): Promise<void> {
  const key = folderKey(folder)
  await listSessions(client, key)
  const pool = pools.get(key) ?? []
  const remembered = activePerFolder.get(key)
  const target =
    remembered && pool.some((s) => s.id === remembered.id)
      ? remembered
      : [...pool].sort((a, b) => b.time.updated - a.time.updated)[0] ?? null
  if (target) {
    activate(target)
    activePerFolder.set(key, target)
    void refreshStatus(client)
    startStatusPolling(client)
  } else {
    clearActive()
  }
}

async function sendPrompt(
  client: OpencodeClient,
  text: string,
  model?: { providerID: string; modelID: string },
): Promise<{ info: AssistantMessage; parts: Part[] }> {
  const session = activeSession.value
  if (!session) throw new Error('No active session')
  sending.value = true
  // Optimistic busy so the output pane's progress indicator appears the moment
  // the prompt is submitted; refreshStatus reconciles with the real run state.
  sessionStatus.value = 'busy'
  sessionError.value = null
  try {
    const result = await client.session.prompt({
      path: { id: session.id },
      body: model
        ? { parts: [{ type: 'text', text }], model }
        : { parts: [{ type: 'text', text }] },
    })
    if (result.error) {
      const message = String(result.error)
      sessionError.value = message
      throw new Error(message)
    }
    void refreshStatus(client)
    void refreshRunningSessions(client)
    return result.data
  } catch (error) {
    sessionStatus.value = 'idle'
    throw error
  } finally {
    sending.value = false
  }
}

async function abort(client: OpencodeClient): Promise<void> {
  const session = activeSession.value
  if (!session) return
  // Update the UI immediately; the stream/poll will reconcile the true state.
  sending.value = false
  sessionStatus.value = 'idle'
  try {
    await client.session.abort({ path: { id: session.id } })
  } catch {
    sessionStatus.value = null
  }
  void refreshRunningSessions(client)
}

function clearActive(): void {
  stopStatusPolling()
  activeSession.value = null
  sessionStatus.value = null
  sessionError.value = null
}

// Full teardown: invalidates every folder's remembered session and pool. Used
// when the connection drops, since the sessions belong to the old server.
function clearSession(): void {
  clearActive()
  activePerFolder.clear()
  pools.clear()
  pendingLimit.value = null
}

function clearPendingLimit(): void {
  pendingLimit.value = null
}

export function useSession() {
  return {
    activeSession,
    sessionsFor,
    sessionStatus,
    sessionError,
    sending,
    runningSessions,
    pendingLimit,
    createSession,
    replaceAndCreate,
    listSessions,
    selectSession,
    activateFolder,
    deleteSession,
    deleteUISessions,
    sendPrompt,
    abort,
    clearSession,
    clearPendingLimit,
  }
}
