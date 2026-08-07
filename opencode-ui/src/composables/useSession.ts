import { ref } from 'vue'
import type {
  AssistantMessage,
  OpencodeClient,
  Part,
  Session,
  SessionStatus,
} from '@opencode-ai/sdk/client'

const activeSession = ref<Session | null>(null)
const sessions = ref<Session[]>([])
const sessionStatus = ref<SessionStatus['type'] | null>(null)
const sessionError = ref<string | null>(null)
const sending = ref(false)

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
  void refreshStatus(client)
  startStatusPolling(client)
  await listSessions(client, directory)
  return result.data
}

async function listSessions(client: OpencodeClient, directory: string | null): Promise<void> {
  const options = directory ? { query: { directory } } : {}
  const result = await client.session.list(options)
  if (!result.error) sessions.value = result.data ?? []
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
    createSession,
    listSessions,
    selectSession,
    sendPrompt,
    abort,
    clearSession,
  }
}
