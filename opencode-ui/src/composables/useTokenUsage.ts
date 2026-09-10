import { computed, ref } from 'vue'
import type { Message } from '@opencode-ai/sdk/client'

export interface TokenUsage {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface TokenLimit {
  context: number
  output: number
}

export type TokenWarningLevel = 'normal' | 'warning' | 'critical'

const THRESHOLD_WARNING = 0.8
const THRESHOLD_CRITICAL = 0.95

// Module-level state per session
const sessionUsage = ref<Map<string, TokenUsage>>(new Map())
const currentSessionID = ref<string | null>(null)
const modelLimit = ref<TokenLimit | null>(null)

function getUsage(sessionID: string): TokenUsage {
  if (!sessionUsage.value.has(sessionID)) {
    sessionUsage.value.set(sessionID, {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })
  }
  return sessionUsage.value.get(sessionID)!
}

function accumulateTokens(sessionID: string, message: Message): void {
  if (message.role !== 'assistant') return
  const assistantMsg = message as Message & {
    tokens?: {
      input: number
      output: number
      reasoning: number
      cache?: { read: number; write: number }
    }
  }
  if (!assistantMsg.tokens) return

  const usage = getUsage(sessionID)
  usage.input += assistantMsg.tokens.input ?? 0
  usage.output += assistantMsg.tokens.output ?? 0
  usage.reasoning += assistantMsg.tokens.reasoning ?? 0
  usage.cacheRead += assistantMsg.tokens.cache?.read ?? 0
  usage.cacheWrite += assistantMsg.tokens.cache?.write ?? 0
}

function setModelLimit(limit: TokenLimit | null): void {
  modelLimit.value = limit
}

function setCurrentSession(sessionID: string | null): void {
  currentSessionID.value = sessionID
}

function clearSession(sessionID: string): void {
  sessionUsage.value.delete(sessionID)
}

function clearAll(): void {
  sessionUsage.value.clear()
  currentSessionID.value = null
}

export function useTokenUsage() {
  const currentUsage = computed<TokenUsage>(() => {
    if (!currentSessionID.value) {
      return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
    }
    return getUsage(currentSessionID.value)
  })

  const totalTokensUsed = computed<number>(() => {
    const u = currentUsage.value
    return u.input + u.output + u.reasoning + u.cacheRead + u.cacheWrite
  })

  const remainingTokens = computed<number | null>(() => {
    if (!modelLimit.value) return null
    const remaining = modelLimit.value.context - totalTokensUsed.value
    return Math.max(0, remaining)
  })

  const usagePercent = computed<number>(() => {
    if (!modelLimit.value || modelLimit.value.context === 0) return 0
    return (totalTokensUsed.value / modelLimit.value.context) * 100
  })

  const warningLevel = computed<TokenWarningLevel>(() => {
    const percent = usagePercent.value
    if (percent >= THRESHOLD_CRITICAL * 100) return 'critical'
    if (percent >= THRESHOLD_WARNING * 100) return 'warning'
    return 'normal'
  })

  const formattedRemaining = computed<string>(() => {
    const remaining = remainingTokens.value
    if (remaining === null) return '—'
    if (remaining >= 1_000_000) return `${(remaining / 1_000_000).toFixed(1)}M`
    if (remaining >= 1_000) return `${(remaining / 1_000).toFixed(1)}K`
    return String(remaining)
  })

  const formattedUsed = computed<string>(() => {
    const used = totalTokensUsed.value
    if (used >= 1_000_000) return `${(used / 1_000_000).toFixed(1)}M`
    if (used >= 1_000) return `${(used / 1_000).toFixed(1)}K`
    return String(used)
  })

  return {
    currentUsage,
    totalTokensUsed,
    remainingTokens,
    usagePercent,
    warningLevel,
    formattedRemaining,
    formattedUsed,
    modelLimit,
    accumulateTokens,
    setModelLimit,
    setCurrentSession,
    clearSession,
    clearAll,
  }
}
