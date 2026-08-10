import { computed, ref } from 'vue'

// Shared task-progress clock. One module singleton drives both the task pies
// and the cartoony octopus so every consumer animates from the same source of
// truth. `useTaskPct()` exposes the same surface TaskProgress used locally.

export interface Stage {
  key: string
  label: string
}

export const STAGES: Stage[] = [
  { key: 'thinking', label: 'thinking' },
  { key: 'checking', label: 'checking' },
  { key: 'assembling', label: 'assembling' },
  { key: 'responding', label: 'responding' },
]

export const SHARE = 100 / STAGES.length

export const pct = ref(0)

let startedAt = 0
let frame = 0

function tick(): void {
  if (!frame) return // stopped
  const elapsed = (Date.now() - startedAt) / 1000
  // Asymptotic approach so it never quite hits 100 while still running; the
  // output reveal snaps it to 100 via the conversation transition.
  // ponytail: doc's draft used amplitude 50, which asymptotes at ~50% and
  // never reaches the assembling/responding stages — the tower would never
  // stack. Amplitude 99 keeps the `min(99, ...)` cap the doc intended.
  pct.value = Math.min(99, Math.round(99 * (1 - Math.exp(-elapsed / 6))))
  frame = requestAnimationFrame(tick)
}

export function startTaskPct(): void {
  cancelAnimationFrame(frame)
  startedAt = Date.now()
  pct.value = 0
  frame = requestAnimationFrame(tick)
}

export function stopTaskPct(): void {
  cancelAnimationFrame(frame)
  frame = 0
}

export function resetTaskPct(): void {
  stopTaskPct()
  startedAt = 0
  pct.value = 0
}

export const overall = computed(() => pct.value)

export function stageProgress(index: number): number {
  const filled = (overall.value / 100) * STAGES.length - index
  return Math.max(0, Math.min(1, filled)) * 100
}

export function isComplete(index: number): boolean {
  return overall.value >= (index + 1) * SHARE
}

export const currentStage = computed(() => {
  for (let i = 0; i < STAGES.length; i++) {
    if (!isComplete(i)) return i
  }
  return STAGES.length - 1
})

export function useTaskPct() {
  return {
    pct,
    overall,
    currentStage,
    stageProgress,
    isComplete,
    STAGES,
    SHARE,
    start: startTaskPct,
    stop: stopTaskPct,
  }
}
