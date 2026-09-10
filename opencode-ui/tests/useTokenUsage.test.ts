import { beforeEach, describe, expect, it, vi } from 'vitest'

// useTokenUsage keeps module-level state, so reset modules per test.
beforeEach(() => {
  vi.resetModules()
})

async function load() {
  const mod = await import('@/composables/useTokenUsage')
  return mod.useTokenUsage()
}

describe('useTokenUsage', () => {
  it('returns zero usage when no session is active', async () => {
    const { totalTokensUsed, remainingTokens, usagePercent } = await load()
    expect(totalTokensUsed.value).toBe(0)
    expect(remainingTokens.value).toBeNull()
    expect(usagePercent.value).toBe(0)
  })

  it('accumulates tokens from assistant messages', async () => {
    const { accumulateTokens, totalTokensUsed, setCurrentSession } = await load()
    setCurrentSession('session-1')

    const message1 = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant' as const,
      agent: 'assistant',
      model: { providerID: 'opencode', modelID: 'test' },
      time: { created: Date.now() },
      tokens: { input: 100, output: 50, reasoning: 25, cache: { read: 10, write: 5 } },
    }

    const message2 = {
      id: 'msg-2',
      sessionID: 'session-1',
      role: 'assistant' as const,
      agent: 'assistant',
      model: { providerID: 'opencode', modelID: 'test' },
      time: { created: Date.now() },
      tokens: { input: 200, output: 100, reasoning: 50, cache: { read: 20, write: 10 } },
    }

    accumulateTokens('session-1', message1)
    accumulateTokens('session-1', message2)

    expect(totalTokensUsed.value).toBe(570) // 100+50+25+10+5 + 200+100+50+20+10
  })

  it('ignores user messages', async () => {
    const { accumulateTokens, totalTokensUsed, setCurrentSession } = await load()
    setCurrentSession('session-1')

    const userMessage = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'user' as const,
      agent: 'user',
      model: { providerID: '', modelID: '' },
      time: { created: Date.now() },
    }

    accumulateTokens('session-1', userMessage)
    expect(totalTokensUsed.value).toBe(0)
  })

  it('calculates remaining tokens based on model limit', async () => {
    const { setModelLimit, accumulateTokens, remainingTokens, setCurrentSession } = await load()
    setModelLimit({ context: 1000, output: 4096 })
    setCurrentSession('session-1')

    const message = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant' as const,
      agent: 'assistant',
      model: { providerID: 'opencode', modelID: 'test' },
      time: { created: Date.now() },
      tokens: { input: 300, output: 100, reasoning: 50, cache: { read: 0, write: 0 } },
    }

    accumulateTokens('session-1', message)
    expect(remainingTokens.value).toBe(550) // 1000 - 450
  })

  it('returns warning level based on usage percentage', async () => {
    const { setModelLimit, accumulateTokens, warningLevel, setCurrentSession } = await load()
    setModelLimit({ context: 1000, output: 4096 })
    setCurrentSession('session-1')

    const createMessage = (input: number) => ({
      id: `msg-${input}`,
      sessionID: 'session-1',
      role: 'assistant' as const,
      agent: 'assistant',
      model: { providerID: 'opencode', modelID: 'test' },
      time: { created: Date.now() },
      tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    })

    // 70% usage - normal
    accumulateTokens('session-1', createMessage(700))
    expect(warningLevel.value).toBe('normal')

    // 85% usage - warning
    accumulateTokens('session-1', createMessage(150))
    expect(warningLevel.value).toBe('warning')

    // 96% usage - critical
    accumulateTokens('session-1', createMessage(110))
    expect(warningLevel.value).toBe('critical')
  })

  it('formats token counts correctly', async () => {
    const { setModelLimit, accumulateTokens, formattedRemaining, formattedUsed, setCurrentSession } =
      await load()
    setModelLimit({ context: 1_500_000, output: 4096 })
    setCurrentSession('session-1')

    const message = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant' as const,
      agent: 'assistant',
      model: { providerID: 'opencode', modelID: 'test' },
      time: { created: Date.now() },
      tokens: { input: 250_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }

    accumulateTokens('session-1', message)
    expect(formattedUsed.value).toBe('250.0K')
    expect(formattedRemaining.value).toBe('1.3M')
  })

  it('clears session usage', async () => {
    const { accumulateTokens, clearSession, totalTokensUsed, setCurrentSession } = await load()
    setCurrentSession('session-1')

    const message = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant' as const,
      agent: 'assistant',
      model: { providerID: 'opencode', modelID: 'test' },
      time: { created: Date.now() },
      tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
    }

    accumulateTokens('session-1', message)
    expect(totalTokensUsed.value).toBe(150)

    clearSession('session-1')
    expect(totalTokensUsed.value).toBe(0)
  })
})
