import { computed, ref } from 'vue'

// Shared task-progress clock. One module singleton drives both the task pies
// and the cartoony octopus so every consumer animates from the same source of
// truth. `useTaskPct()` exposes the same surface TaskProgress used locally.
//
// The clock is event-driven, not time-driven: real run signals (see
// useConversation) mark the start of a phase and the percentage snaps to that
// phase's floor. There is no fake "it must be close to done by now" curve.

export interface Stage {
  key: string
  label: string
}

export const STAGES: Stage[] = [
  { key: 'reasoning', label: 'reasoning' },
  { key: 'searching', label: 'searching' },
  { key: 'applying', label: 'applying' },
  { key: 'streaming', label: 'streaming' },
]

export type StageKey = (typeof STAGES)[number]['key']

export const SHARE = 100 / STAGES.length

// ponytail: reasoning/streaming text arrives as message.part.delta tokens long
// before the phase's terminal part.updated, so boundary signals alone froze the
// longest phase (reasoning) at its band floor. Token length is an imperfect
// "how much thinking happened" proxy but it is the only in-flight signal the
// server offers; the asymptotic fill below keeps the pie alive without ever
// faking stage completion.
export const FILL_SCALE = 400
export const FILL_CAP = 0.9

export const pct = ref(0)

// The session the current run belongs to. Only that session's signals advance
// the clock; other sessions (e.g. subagents) are ignored.
let runSessionID: string | null = null

// Text tokens accumulated per stage since the run started, driving advance()'s
// in-band fill. Reset on a new run like the clock itself.
const stageChars = [0, 0, 0, 0]

// Tracks which stages have had their floor set by observe(). Without this,
// repeated message.part.updated events during a single phase would keep
// resetting pct to the phase floor, overwriting the in-band fill from advance().
const observedStages = new Set<number>()

export function startTaskPct(sessionID: string | null = null): void {
  // ponytail: idempotent when re-called for the same session. The busy flag
  // can flap (status polling reconciles it every 5s, folder switches change
  // the active session), and each flap used to reset the clock to 0 mid-run —
  // the percent then never visibly moved. Only a *different* run session
  // restarts the clock.
  if (sessionID === runSessionID) return
  runSessionID = sessionID
  pct.value = 0
  stageChars.fill(0)
  observedStages.clear()
}

// The server announces the end of a run with session.idle; snap the clock to
// 100 so the pie completes instead of freezing at the streaming floor (75).
// Guarded like observe: only the run session may complete the clock.
export function completeTaskPct(sessionID: string | null): void {
  if (sessionID !== runSessionID) return
  pct.value = 100
}

export function stopTaskPct(): void {
  runSessionID = null
}

export function resetTaskPct(): void {
  stopTaskPct()
  pct.value = 0
  stageChars.fill(0)
  observedStages.clear()
}

// A phase started on the run session. Snaps pct to the phase's band start so
// the stage derived from pct stays consistent (reasoning owns band [0,25),
// searching [25,50), applying [50,75), streaming [75,100)). The clock never
// regresses, and phases that produce no signals are skipped — the first real
// signal jumps straight to its floor.
// ponytail: a pure time curve faked the phases, so a long reasoning stretch
// now sits honestly at 0% instead of pretending to climb. Discrete steps mean
// the percentage can look frozen during long tool runs; that is intentional.
export function observe(sessionID: string | null, stage: StageKey): void {
  if (sessionID !== runSessionID) return
  const index = STAGES.findIndex((s) => s.key === stage)
  if (index === -1) return
  if (observedStages.has(index)) return
  observedStages.add(index)
  pct.value = Math.max(pct.value, index * SHARE)
}

// In-band progress from the token stream. Reasoning and streaming text are
// delivered as deltas, so advance() lets the busy pies fill while the model is
// actually working. Streaming is the terminal text phase: its first token ends
// whatever phase preceded it (reasoning, tools, diffs) and snaps the clock to
// the streaming floor; other phases only advance while they are current. The
// fill is asymptotic under FILL_CAP, so a long phase approaches a near-full pie
// but never completes its stage — only the next boundary signal or session.idle
// does that.
export function advance(sessionID: string | null, stage: StageKey, chars: number): void {
  if (sessionID !== runSessionID) return
  const index = STAGES.findIndex((s) => s.key === stage)
  if (index === -1) return
  if (stage === 'streaming') {
    pct.value = Math.max(pct.value, index * SHARE)
  } else if (currentStage.value !== index) {
    return
  }
  stageChars[index] += chars
  const fill = 1 - 1 / (1 + stageChars[index] / FILL_SCALE)
  pct.value = Math.max(pct.value, index * SHARE + fill * SHARE * FILL_CAP)
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
    observe,
    advance,
    complete: completeTaskPct,
  }
}
