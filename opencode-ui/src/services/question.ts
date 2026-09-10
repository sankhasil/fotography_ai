// The SDK (v1.18.x) does not ship the question API yet, so the UI talks to the
// server's /question routes directly. Schemas mirror the OpenAPI spec served
// at /doc. Drop this file and switch to the SDK client once it exposes the
// endpoint group.
export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionInfo {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface QuestionTool {
  messageID: string
  callID: string
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: QuestionTool
}

async function parse(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Question API request failed: ${response.status}`)
  }
  return response.json()
}

// The server answers 404 with QuestionNotFoundError when the request is no
// longer pending (already answered, rejected, or the server restarted).
export class QuestionNotFoundError extends Error {
  constructor(requestID: string) {
    super(`Question request no longer pending: ${requestID}`)
    this.name = 'QuestionNotFoundError'
  }
}

export async function listQuestions(
  url: string,
  directory: string | null,
): Promise<QuestionRequest[]> {
  const query = directory ? `?directory=${encodeURIComponent(directory)}` : ''
  const response = await fetch(`${url}/question${query}`)
  return (await parse(response)) as QuestionRequest[]
}

export async function replyQuestion(
  url: string,
  requestID: string,
  directory: string | null,
  answers: string[][],
): Promise<void> {
  const query = directory ? `?directory=${encodeURIComponent(directory)}` : ''
  const response = await fetch(`${url}/question/${encodeURIComponent(requestID)}/reply${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  if (response.status === 404) throw new QuestionNotFoundError(requestID)
  await parse(response)
}

export async function rejectQuestion(
  url: string,
  requestID: string,
  directory: string | null,
): Promise<void> {
  const query = directory ? `?directory=${encodeURIComponent(directory)}` : ''
  const response = await fetch(`${url}/question/${encodeURIComponent(requestID)}/reject${query}`, {
    method: 'POST',
  })
  if (response.status === 404) throw new QuestionNotFoundError(requestID)
  await parse(response)
}
