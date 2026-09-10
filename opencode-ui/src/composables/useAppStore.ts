import { watch } from 'vue'
import type { Message, OpencodeClient, Part, Session } from '@opencode-ai/sdk/client'

import { useConversation } from '@/composables/useConversation'
import { useEventStream } from '@/composables/useEventStream'
import { useFolders } from '@/composables/useFolders'
import { useModel } from '@/composables/useModel'
import { useOpenCode } from '@/composables/useOpenCode'
import { usePendingQuestion } from '@/composables/usePendingQuestion'
import { useSession } from '@/composables/useSession'
import { useTokenUsage } from '@/composables/useTokenUsage'

const opencode = useOpenCode()
const session = useSession()
const folders = useFolders()
const eventStream = useEventStream()
const conversation = useConversation()
const model = useModel()
const pendingQuestion = usePendingQuestion()
const tokenUsage = useTokenUsage()

eventStream.setOnEvent((event) => conversation.reduceEvent(event))

// Coordination: a lost connection invalidates the active session, which belongs
// to the previous server instance. A reconnected instance needs a fresh one.
// The /event SSE stream tracks the connection lifecycle: it runs only while
// connected and is restarted by the store after every reconnect.
watch([opencode.status, opencode.client], ([status, client]) => {
  if (status === 'offline') {
    session.clearSession()
    conversation.clear()
    tokenUsage.clearAll()
  }
  if (status === 'connected' && client) {
    void eventStream.start(client)
    void model.refresh(client)
    const limit = model.getSelectedModelLimit()
    tokenUsage.setModelLimit(limit)
  } else {
    eventStream.stop()
  }
})

watch(model.selected, () => {
  const limit = model.getSelectedModelLimit()
  tokenUsage.setModelLimit(limit)
})

async function reloadConversation(client: OpencodeClient, selected: Session): Promise<void> {
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

export function useAppStore() {
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

  async function sendPrompt(text: string): Promise<void> {
    const client = opencode.client.value
    if (!client) throw new Error('Not connected')
    // A fresh folder has no session yet; create one so Send works on the very
    // first prompt instead of failing on "No active session".
    if (!session.activeSession.value) {
      const outcome = await session.createSession(client, folders.activeFolder.value)
      if (outcome.kind === 'limit') {
        // The folder's pool is full; hold the prompt while the UI asks which
        // session to free. resolveLimit resumes the send afterwards.
        session.pendingLimit.value = {
          folder: outcome.folder,
          sessions: outcome.sessions,
          queuedText: text,
        }
        return
      }
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

  // Freed a session from a full pool: delete it, then re-send the held prompt.
  async function resolveLimit(idToDelete: string): Promise<void> {
    const state = session.pendingLimit.value
    session.pendingLimit.value = null
    const client = opencode.client.value
    if (!state || !client) return
    await session.replaceAndCreate(client, state.folder, idToDelete)
    const queued = state.queuedText
    if (queued) {
      try {
        const result = await session.sendPrompt(client, queued, model.selected.value ?? undefined)
        if (result) conversation.feedResult(result.info, result.parts)
      } catch (error) {
        feedLocalUserTurn(queued)
        throw error
      }
    }
  }

  function dismissLimit(): void {
    session.clearPendingLimit()
  }

  // Switching folders loads the folder's session pool, restores its active
  // session and reloads the output pane for that session.
  async function selectFolder(folder: string | null): Promise<void> {
    folders.setActiveFolder(folder)
    const client = opencode.client.value
    if (!client) return
    await session.activateFolder(client, folder)
    const current = session.activeSession.value
    if (current) await reloadConversation(client, current)
  }

  // Switching sessions reloads the conversation from the server so the output
  // pane always shows the selected session's full history.
  async function selectSession(
    client: OpencodeClient,
    selected: Session,
  ): Promise<void> {
    await session.selectSession(client, selected)
    await reloadConversation(client, selected)
    tokenUsage.setCurrentSession(selected.id)
  }

  return {
    status: opencode.status,
    url: opencode.url,
    error: opencode.error,
    client: opencode.client,
    connect: opencode.connect,
    disconnect: opencode.disconnect,
    configuredFolders: folders.configuredFolders,
    activeFolder: folders.activeFolder,
    selectFolder,
    activeSession: session.activeSession,
    sessionsFor: session.sessionsFor,
    sessionStatus: session.sessionStatus,
    sessionError: session.sessionError,
    sending: session.sending,
    runningSessions: session.runningSessions,
    pendingLimit: session.pendingLimit,
    resolveLimit,
    dismissLimit,
    pendingQuestion: pendingQuestion.pendingQuestion,
    answering: pendingQuestion.answering,
    questionError: pendingQuestion.questionError,
    answerQuestion: pendingQuestion.answer,
    dismissQuestion: pendingQuestion.dismiss,
    modelOptions: model.options,
    modelSelectedIndex: model.selectedIndex,
    modelSelectedLabel: model.selectedLabel,
    selectModel: model.select,
    findLargerContextModels: model.findLargerContextModels,
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
    tokenUsage: tokenUsage.currentUsage,
    totalTokensUsed: tokenUsage.totalTokensUsed,
    remainingTokens: tokenUsage.remainingTokens,
    usagePercent: tokenUsage.usagePercent,
    warningLevel: tokenUsage.warningLevel,
    formattedRemaining: tokenUsage.formattedRemaining,
    formattedUsed: tokenUsage.formattedUsed,
  }
}
