import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useTaskPct keeps module-level state and a rAF loop, so reset modules per
// test and stub rAF to drive the clock deterministically alongside fake Date.
let rafCallbacks: Array<() => void> = []

function stubRaf(): void {
  rafCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (cb: () => void): number => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
}

// Runs `count` frames of `stepMs` each, firing the single pending rAF
// callback per frame so the clock advances like it does in the browser.
function frames(count: number, stepMs = 16): void {
  for (let i = 0; i < count; i++) {
    vi.advanceTimersByTime(stepMs)
    rafCallbacks.splice(0).forEach((cb) => cb())
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  stubRaf()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useTaskPct clock', () => {
  it('climbs and never exceeds 99 while running; holds still when stopped', async () => {
    const { pct, startTaskPct, stopTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct()
    frames(60, 1000) // one simulated minute
    expect(pct.value).toBeGreaterThan(0)
    expect(pct.value).toBeLessThanOrEqual(99)

    stopTaskPct()
    const frozen = pct.value
    frames(10, 1000)
    expect(pct.value).toBe(frozen)
  })

  it('resets pct to 0 and stops the clock', async () => {
    const { pct, resetTaskPct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct()
    frames(20, 1000)
    expect(pct.value).toBeGreaterThan(0)

    resetTaskPct()
    expect(pct.value).toBe(0)
    frames(10, 1000)
    expect(pct.value).toBe(0)
  })
})

describe('useTaskPct stage model', () => {
  it('derives currentStage from pct at the 25/50/75 boundaries', async () => {
    const { currentStage, pct } = await import('@/composables/useTaskPct')

    pct.value = 0
    expect(currentStage.value).toBe(0)
    pct.value = 10
    expect(currentStage.value).toBe(0)
    pct.value = 25
    expect(currentStage.value).toBe(1)
    pct.value = 50
    expect(currentStage.value).toBe(2)
    pct.value = 75
    expect(currentStage.value).toBe(3)
    pct.value = 99
    expect(currentStage.value).toBe(3)
  })

  it('reports isComplete and stageProgress at stage boundaries', async () => {
    const { isComplete, pct, stageProgress } = await import('@/composables/useTaskPct')

    pct.value = 10
    expect(isComplete(0)).toBe(false)
    expect(stageProgress(0)).toBe(40)
    expect(stageProgress(1)).toBe(0)

    pct.value = 25
    expect(isComplete(0)).toBe(true)
    expect(isComplete(1)).toBe(false)
    expect(stageProgress(0)).toBe(100)
    expect(stageProgress(1)).toBe(0)

    pct.value = 100
    expect(isComplete(3)).toBe(true)
    expect(stageProgress(3)).toBe(100)
    expect(stageProgress(2)).toBe(100)
  })
})
