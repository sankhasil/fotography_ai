import { watch } from 'vue'
import type { Message, OpencodeClient, Part, Session } from '@opencode-ai/sdk/client'

import { useConversation } from '@/composables/useConversation'
import { useEventStream } from '@/composables/useEventStream'
import { useModel } from '@/composables/useModel'
import { useOpenCode } from '@/composables/useOpenCode'
import { usePendingQuestion } from '@/composables/usePendingQuestion'
import { useSession } from '@/composables/useSession'
import { useWorkingDirectory } from '@/composables/useWorkingDirectory'

const opencode = useOpenCode()
const session = useSession()
const workingDirectory = useWorkingDirectory()
const eventStream = useEventStream()
const conversation = useConversation()
const model = useModel()
const pendingQuestion = usePendingQuestion()

eventStream.setOnEvent((event) => conversation.reduceEvent(event))

// Coordination: a lost connection invalidates the active session, which belongs
// to the previous server instance. A reconnected instance needs a fresh one.
// The /event SSE stream tracks the connection lifecycle: it runs only while
// connected and is restarted by the store after every reconnect.
watch([opencode.status, opencode.client], ([status, client]) => {
  if (status === 'offline') {
    session.clearSession()
    conversation.clear()
  }
  if (status === 'connected' && client) {
    void eventStream.start(client)
    void model.refresh(client)
  } else {
    eventStream.stop()
  }
})

export function useAppStore() {
  async function sendPrompt(text: string): Promise<void> {
    const client = opencode.client.value
    if (!client) throw new Error('Not connected')
    // A fresh connection has no session yet; create one so Send works on the
    // very first prompt instead of failing on "No active session".
    if (!session.activeSession.value) {
      await session.createSession(client, workingDirectory.cwd.value)
    }
    try {
      const result = await session.sendPrompt(client, text, model.selected.value ?? undefined)
      // The prompt endpoint returns the created message; streamed part updates
      // for it also arrive over SSE, so feeding it now makes the UI render the
      // user turn immediately (deduplicated by part id in the reducer).
      if (result) conversation.feedResult(result.info, result.parts)
    } catch (error) {
      feedLocalUserTurn(text)
      throw error
    }
  }

  function feedLocalUserTurn(text: string): void {
    const sessionID = session.activeSession.value?.id ?? ''
    const messageID = crypto.randomUUID()
    const now = Date.now()
    const info: Message = {
      id: messageID,
      sessionID,
      role: 'user',
      agent: 'user',
      model: { providerID: '', modelID: '' },
      time: { created: now },
    }
    const part: Part = {
      id: crypto.randomUUID(),
      sessionID,
      messageID,
      type: 'text',
      text,
      time: { start: now },
    }
    // ponytail: on prompt failure the server never delivers the user part, so
    // render the turn locally to keep the sent message visible next to the
    // sessionError. Revisit if the console starts streaming error-path parts.
    conversation.feedResult(info, [part])
  }

  // Switching sessions reloads the conversation from the server so the output
  // pane always shows the selected session's full history.
  async function selectSession(
    client: OpencodeClient,
    selected: Session,
  ): Promise<void> {
    await session.selectSession(client, selected)
    const [messagesResult, diffResult] = await Promise.all([
      client.session.messages({ path: { id: selected.id } }),
      client.session.diff({ path: { id: selected.id } }),
    ])
    if (!messagesResult.error) {
      conversation.replaceSession(selected.id, messagesResult.data ?? [])
    }
    if (!diffResult.error) {
      conversation.replaceDiffs(selected.id, diffResult.data ?? [])
    }
  }

  return {
    status: opencode.status,
    url: opencode.url,
    error: opencode.error,
    client: opencode.client,
    connect: opencode.connect,
    disconnect: opencode.disconnect,
    cwd: workingDirectory.cwd,
    setWorkingDirectory: workingDirectory.setWorkingDirectory,
    activeSession: session.activeSession,
    sessions: session.sessions,
    sessionStatus: session.sessionStatus,
    sessionError: session.sessionError,
    sending: session.sending,
    runningSessions: session.runningSessions,
    pendingQuestion: pendingQuestion.pendingQuestion,
    answering: pendingQuestion.answering,
    questionError: pendingQuestion.questionError,
    answerQuestion: pendingQuestion.answer,
    dismissQuestion: pendingQuestion.dismiss,
    modelOptions: model.options,
    modelSelectedIndex: model.selectedIndex,
    modelSelectedLabel: model.selectedLabel,
    selectModel: model.select,
    createSession: session.createSession,
    listSessions: session.listSessions,
    selectSession,
    deleteSession: session.deleteSession,
    deleteUISessions: session.deleteUISessions,
    abort: session.abort,
    sendPrompt,
    events: eventStream.events,
    streaming: eventStream.streaming,
    messagesFor: conversation.messagesFor,
    diffsFor: conversation.diffsFor,
    lastEventAt: conversation.lastEventAt,
  }
}
