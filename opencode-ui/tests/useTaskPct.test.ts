import { beforeEach, describe, expect, it, vi } from 'vitest'

// useTaskPct keeps module-level singleton state, so reset modules per test to
// give each one a fresh clock.
beforeEach(() => {
  vi.resetModules()
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

describe('useTaskPct observe', () => {
  it('snaps pct to the stage floor and never regresses', async () => {
    const { observe, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    expect(pct.value).toBe(0)

    observe('ses_run', 'reasoning')
    expect(pct.value).toBe(0)

    observe('ses_run', 'searching')
    expect(pct.value).toBe(25)

    observe('ses_run', 'applying')
    expect(pct.value).toBe(50)

    observe('ses_run', 'streaming')
    expect(pct.value).toBe(75)

    // An earlier-phase signal after a later one must not move the clock back.
    observe('ses_run', 'reasoning')
    expect(pct.value).toBe(75)
  })

  it('ignores signals from other sessions', async () => {
    const { observe, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    observe('ses_other', 'streaming')
    expect(pct.value).toBe(0)

    observe('ses_other', 'applying')
    expect(pct.value).toBe(0)
  })

  it('does nothing when no run is active', async () => {
    const { observe, pct } = await import('@/composables/useTaskPct')

    pct.value = 75
    observe('ses_run', 'streaming')
    expect(pct.value).toBe(75)
  })

  it('start resets pct for the new run', async () => {
    const { observe, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_a')
    observe('ses_a', 'streaming')
    expect(pct.value).toBe(75)

    startTaskPct('ses_b')
    expect(pct.value).toBe(0)
    observe('ses_a', 'streaming')
    expect(pct.value).toBe(0)
    observe('ses_b', 'searching')
    expect(pct.value).toBe(25)
  })

  it('does not reset a live clock when start repeats for the same session', async () => {
    // Regression: the busy flag flaps while the status poll reconciles;
    // re-starting the same run used to zero the clock mid-run.
    const { observe, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    observe('ses_run', 'searching')
    expect(pct.value).toBe(25)

    startTaskPct('ses_run')
    expect(pct.value).toBe(25)

    observe('ses_run', 'applying')
    expect(pct.value).toBe(50)
  })

  it('completes the clock only for its own session', async () => {
    const { completeTaskPct, observe, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    observe('ses_run', 'streaming')
    expect(pct.value).toBe(75)

    completeTaskPct('ses_other')
    expect(pct.value).toBe(75)

    completeTaskPct('ses_run')
    expect(pct.value).toBe(100)
  })
})

describe('useTaskPct advance (token-driven fill)', () => {
  it('fills the reasoning band without completing the stage', async () => {
    const { advance, isComplete, pct, startTaskPct, stageProgress } =
      await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    advance('ses_run', 'reasoning', 400)
    expect(pct.value).toBeGreaterThan(0)
    expect(pct.value).toBeLessThan(25)
    expect(stageProgress(0)).toBeGreaterThan(0)
    expect(isComplete(0)).toBe(false)

    advance('ses_run', 'reasoning', 8000)
    expect(pct.value).toBeLessThan(25)
    expect(isComplete(0)).toBe(false)
  })

  it('snaps to the streaming floor on the first text token, then advances', async () => {
    const { advance, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    advance('ses_run', 'reasoning', 400)
    advance('ses_run', 'streaming', 200)
    expect(pct.value).toBeGreaterThanOrEqual(75)
    expect(pct.value).toBeLessThan(100)

    const before = pct.value
    advance('ses_run', 'streaming', 800)
    expect(pct.value).toBeGreaterThan(before)
  })

  it('ignores deltas from other sessions and after the phase ends', async () => {
    const { advance, observe, pct, startTaskPct } = await import('@/composables/useTaskPct')

    startTaskPct('ses_run')
    advance('ses_other', 'reasoning', 500)
    expect(pct.value).toBe(0)

    observe('ses_run', 'searching')
    expect(pct.value).toBe(25)
    advance('ses_run', 'reasoning', 500)
    expect(pct.value).toBe(25)
  })
})
