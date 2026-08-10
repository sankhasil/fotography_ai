import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@opencode-ai/sdk/client'

import type { QuestionRequest } from '@/services/question'

vi.mock('@/services/question', () => ({
  listQuestions: vi.fn(),
  replyQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))

// usePendingQuestion keeps module-level state and a poll timer, so reset
// modules per test and shut the timer down by detaching the session.
beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

async function load() {
  const { listQuestions, replyQuestion, rejectQuestion } = await import('@/services/question')
  const { url } = (await import('@/composables/useOpenCode')).useOpenCode()
  const { activeSession } = (await import('@/composables/useSession')).useSession()
  const { usePendingQuestion, buildAnswers } = await import('@/composables/usePendingQuestion')
  return {
    store: usePendingQuestion(),
    listQuestions: vi.mocked(listQuestions),
    replyQuestion: vi.mocked(replyQuestion),
    rejectQuestion: vi.mocked(rejectQuestion),
    setUrl: (value: string | null) => {
      url.value = value
    },
    setSession: (session: Session | null) => {
      activeSession.value = session
    },
    buildAnswers,
  }
}

function request(sessionID: string, requestID = 'que-1'): QuestionRequest {
  return {
    id: requestID,
    sessionID,
    questions: [
      {
        header: 'Scope',
        question: 'Which tool?',
        options: [
          { label: 'A', description: 'First' },
          { label: 'B', description: 'Second' },
        ],
      },
    ],
  }
}

function session(id: string, directory: string): Session {
  return {
    id,
    projectID: 'proj',
    directory,
    title: id,
    version: '1',
    time: { created: 1, updated: 2 },
  }
}

describe('buildAnswers', () => {
  it('sends a single selected label for a single-select question', async () => {
    const { buildAnswers } = await load()
    const questions = request('s1').questions
    expect(buildAnswers(questions, [{ selected: ['A'], custom: '' }])).toEqual([['A']])
  })

  it('sends every picked label for a multi-select question', async () => {
    const { buildAnswers } = await load()
    const questions = [{ ...request('s1').questions[0], multiple: true }]
    expect(buildAnswers(questions, [{ selected: ['A', 'B'], custom: '' }])).toEqual([['A', 'B']])
  })

  it('replaces the pick with a typed custom answer on single-select', async () => {
    const { buildAnswers } = await load()
    expect(buildAnswers(request('s1').questions, [{ selected: ['A'], custom: '  my own  ' }])).toEqual(
      [['my own']],
    )
  })

  it('appends a typed custom answer to the picks on multi-select', async () => {
    const { buildAnswers } = await load()
    const questions = [{ ...request('s1').questions[0], multiple: true }]
    expect(buildAnswers(questions, [{ selected: ['A'], custom: 'custom' }])).toEqual([['A', 'custom']])
  })

  it('answers empty questions in order', async () => {
    const { buildAnswers } = await load()
    const questions = [
      request('s1').questions[0],
      { ...request('s1').questions[0], multiple: true },
    ]
    expect(buildAnswers(questions, [{ selected: ['A'], custom: '' }, { selected: [], custom: '' }])).toEqual([
      ['A'],
      [],
    ])
  })
})

describe('usePendingQuestion polling', () => {
  it('picks the pending question that belongs to the active session', async () => {
    const mod = await load()
    mod.setUrl('http://test')
    mod.listQuestions.mockResolvedValue([request('ses-other'), request('ses-1')])

    mod.setSession(session('ses-1', '/x'))

    await vi.waitFor(() => {
      expect(mod.store.pendingQuestion.value?.id).toBe('que-1')
    })
    expect(mod.listQuestions).toHaveBeenCalledWith('http://test', '/x')

    mod.setSession(null)
  })

  it('clears the question when the active session changes', async () => {
    const mod = await load()
    mod.setUrl('http://test')
    mod.listQuestions.mockResolvedValue([request('ses-1')])

    mod.setSession(session('ses-1', '/x'))
    await vi.waitFor(() => {
      expect(mod.store.pendingQuestion.value).not.toBeNull()
    })

    mod.setSession(session('ses-2', '/y'))
    await vi.waitFor(() => {
      expect(mod.store.pendingQuestion.value).toBeNull()
    })

    mod.setSession(null)
  })
})

describe('usePendingQuestion answering', () => {
  it('replies with the answers and clears the pending question', async () => {
    const mod = await load()
    mod.setUrl('http://test')
    mod.replyQuestion.mockResolvedValue(undefined)
    mod.listQuestions.mockResolvedValue([request('ses-1')])

    mod.setSession(session('ses-1', '/x'))
    await vi.waitFor(() => {
      expect(mod.store.pendingQuestion.value).not.toBeNull()
    })

    await mod.store.answer([['A']])

    expect(mod.replyQuestion).toHaveBeenCalledWith('http://test', 'que-1', [['A']])
    expect(mod.store.pendingQuestion.value).toBeNull()
    expect(mod.store.answering.value).toBe(false)

    mod.setSession(null)
  })

  it('reports an error and keeps the question when the reply fails', async () => {
    const mod = await load()
    mod.setUrl('http://test')
    mod.replyQuestion.mockRejectedValue(new Error('boom'))
    mod.listQuestions.mockResolvedValue([request('ses-1')])

    mod.setSession(session('ses-1', '/x'))
    await vi.waitFor(() => {
      expect(mod.store.pendingQuestion.value).not.toBeNull()
    })

    await mod.store.answer([['A']])

    expect(mod.store.questionError.value).toBe('boom')
    expect(mod.store.pendingQuestion.value).not.toBeNull()
    expect(mod.store.answering.value).toBe(false)

    mod.setSession(null)
  })

  it('dismisses by rejecting the question request', async () => {
    const mod = await load()
    mod.setUrl('http://test')
    mod.rejectQuestion.mockResolvedValue(undefined)
    mod.listQuestions.mockResolvedValue([request('ses-1')])

    mod.setSession(session('ses-1', '/x'))
    await vi.waitFor(() => {
      expect(mod.store.pendingQuestion.value).not.toBeNull()
    })

    await mod.store.dismiss()

    expect(mod.rejectQuestion).toHaveBeenCalledWith('http://test', 'que-1')
    expect(mod.store.pendingQuestion.value).toBeNull()

    mod.setSession(null)
  })
})
