import { ref, watch } from 'vue'

import { useOpenCode } from '@/composables/useOpenCode'
import { useSession } from '@/composables/useSession'
import {
  listQuestions,
  QuestionNotFoundError,
  rejectQuestion,
  replyQuestion,
  type QuestionInfo,
  type QuestionRequest,
} from '@/services/question'

const POLL_INTERVAL_MS = 2000

// The question currently awaiting an answer from the active session, if any.
const pendingQuestion = ref<QuestionRequest | null>(null)
const answering = ref(false)
const questionError = ref<string | null>(null)

const session = useSession()
const opencode = useOpenCode()

let timer: ReturnType<typeof setInterval> | null = null
let lastSessionId: string | null = null

async function poll(): Promise<void> {
  const url = opencode.url.value
  const active = session.activeSession.value
  if (!url || !active) return
  try {
    const questions = await listQuestions(url, active.directory)
    const found = questions.find((question) => question.sessionID === active.id) ?? null
    pendingQuestion.value = found
    if (found) questionError.value = null
  } catch {
    // Network hiccup: keep the current state; the next poll reconciles.
  }
}

function startPolling(): void {
  if (timer) return
  timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// Track the active session and the run lifecycle. Poll while the session could
// be waiting on a question: during a run, or while a question is already
// pending (a selected session can be mid-question without reporting busy).
watch(
  () =>
    [
      session.activeSession.value?.id ?? null,
      session.sending.value,
      session.sessionStatus.value,
      pendingQuestion.value,
    ] as const,
  ([id, sending, status, pending]) => {
    if (id !== lastSessionId) {
      lastSessionId = id
      pendingQuestion.value = null
      // Immediately look for a question when switching to a session — it may
      // already be blocked on one (e.g. a CLI console session).
      if (id) void poll()
    }
    if (!id) {
      stopPolling()
      return
    }
    if (sending || status === 'busy' || pending) {
      startPolling()
      if (sending) void poll()
    } else {
      stopPolling()
    }
  },
  { immediate: true },
)

// A lost connection usually means the server restarted, which drops all pending
// question requests (they are in-memory per process). Clear the card so a stale
// request is never submitted; the poll re-finds it if it still exists.
watch(
  () => opencode.status.value,
  (status) => {
    if (status === 'offline') pendingQuestion.value = null
  },
)

async function answer(answers: string[][]): Promise<void> {
  const url = opencode.url.value
  const request = pendingQuestion.value
  const directory = session.activeSession.value?.directory ?? null
  if (!url || !request || answering.value) return
  answering.value = true
  questionError.value = null
  try {
    await replyQuestion(url, request.id, directory, answers)
    // Optimistic clear; the next poll confirms the request left the server.
    pendingQuestion.value = null
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      // Stale request: the server already resolved it (answered elsewhere or
      // restarted). Drop the card instead of surfacing an error.
      pendingQuestion.value = null
      return
    }
    questionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    answering.value = false
  }
}

async function dismiss(): Promise<void> {
  const url = opencode.url.value
  const request = pendingQuestion.value
  const directory = session.activeSession.value?.directory ?? null
  if (!url || !request || answering.value) return
  answering.value = true
  questionError.value = null
  try {
    await rejectQuestion(url, request.id, directory)
    pendingQuestion.value = null
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      pendingQuestion.value = null
      return
    }
    questionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    answering.value = false
  }
}

// Per-question form values collected by the question card.
export interface QuestionFormValue {
  selected: string[]
  custom: string
}

// Assemble the wire format: one answer per question, in order. Each answer is
// the selected option labels; a typed custom answer either replaces the labels
// (single-select) or appends to them (multi-select).
export function buildAnswers(questions: QuestionInfo[], values: QuestionFormValue[]): string[][] {
  return questions.map((question, index) => {
    const value = values[index]
    const selected = value?.selected ?? []
    const custom = (value?.custom ?? '').trim()
    if (!custom) return selected
    return question.multiple ? [...selected, custom] : [custom]
  })
}

export function usePendingQuestion() {
  return {
    pendingQuestion,
    answering,
    questionError,
    answer,
    dismiss,
  }
}
