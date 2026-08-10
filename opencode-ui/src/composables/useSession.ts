import { ref } from 'vue'
import type {
  AssistantMessage,
  OpencodeClient,
  Part,
  Session,
  SessionStatus,
} from '@opencode-ai/sdk/client'
import { forget, isUISession, markAsUI } from '@/composables/useSessionProvenance'

const activeSession = ref<Session | null>(null)
const sessions = ref<Session[]>([])
const sessionStatus = ref<SessionStatus['type'] | null>(null)
const sessionError = ref<string | null>(null)
const sending = ref(false)
// Sessions currently mid-run on the server (the live CLI console session among
// them). Used to protect the running session from deletion.
const runningSessions = ref<Set<string>>(new Set())

let statusTimer: ReturnType<typeof setInterval> | null = null

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

async function createSession(client: OpencodeClient, directory: string | null): Promise<Session> {
  sessionError.value = null
  const options: { query?: { directory: string } } = directory ? { query: { directory } } : {}
  const result = await client.session.create(options)
  if (result.error) {
    const message = String(result.error)
    sessionError.value = message
    throw new Error(message)
  }
  activeSession.value = result.data
  // Tag the new session as UI-created so it shows as deletable, not as a CLI
  // console session. The origin record lives in localStorage (see useSessionProvenance).
  markAsUI(result.data.id)
  void refreshStatus(client)
  void refreshRunningSessions(client)
  startStatusPolling(client)
  await listSessions(client, directory)
  return result.data
}

async function listSessions(client: OpencodeClient, directory: string | null): Promise<void> {
  const options = directory ? { query: { directory } } : {}
  const result = await client.session.list(options)
  if (!result.error) sessions.value = result.data ?? []
  void refreshRunningSessions(client)
}

async function deleteSession(client: OpencodeClient, id: string): Promise<void> {
  const result = await client.session.delete({ path: { id } })
  if (result.error) {
    const message = String(result.error)
    sessionError.value = message
    throw new Error(message)
  }
  const directory = activeSession.value?.directory ?? null
  sessions.value = sessions.value.filter((session) => session.id !== id)
  if (activeSession.value?.id === id) clearSession()
  // Drop the origin tag so the local record never grows with deleted sessions.
  forget(id)
  // Re-fetch so the server-side list (ordering, summaries) stays in sync.
  await listSessions(client, directory)
}

// Bulk delete every UI-created session. CLI console sessions and any session
// currently mid-run are kept — never delete a live conversation.
async function deleteUISessions(client: OpencodeClient): Promise<void> {
  const directory = activeSession.value?.directory ?? null
  const deleted = sessions.value
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
  if (activeSession.value && deleted.includes(activeSession.value.id)) clearSession()
  sessions.value = sessions.value.filter((session) => !deleted.includes(session.id))
  await listSessions(client, directory)
}
async function selectSession(client: OpencodeClient, session: Session): Promise<void> {
  activeSession.value = session
  sessionStatus.value = null
  sessionError.value = null
  void refreshStatus(client)
  startStatusPolling(client)
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

function clearSession(): void {
  stopStatusPolling()
  activeSession.value = null
  sessionStatus.value = null
  sessionError.value = null
}

export function useSession() {
  return {
    activeSession,
    sessions,
    sessionStatus,
    sessionError,
    sending,
    runningSessions,
    createSession,
    listSessions,
    selectSession,
    deleteSession,
    deleteUISessions,
    sendPrompt,
    abort,
    clearSession,
  }
}
