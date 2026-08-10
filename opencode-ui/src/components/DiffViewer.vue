<script setup lang="ts">
import { computed } from 'vue'
import type { FileDiff } from '@opencode-ai/sdk/client'

const props = defineProps<{ diff: FileDiff }>()

interface DiffLine {
  kind: 'add' | 'remove' | 'context'
  text: string
}

const MAX_CELLS = 2_000_000

// ponytail: LCS DP is O(n*m) on lines. Capped to keep huge files fast; beyond
// the cap the diff degrades to whole-file add/remove blocks, which is still
// readable. Switch to Myers if large diffs become common.
function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length
  const m = after.length
  if (n * m > MAX_CELLS) {
    return [
      ...before.map((text) => ({ kind: 'remove' as const, text })),
      ...after.map((text) => ({ kind: 'add' as const, text })),
    ]
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      lines.push({ kind: 'context', text: before[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ kind: 'remove', text: before[i] })
      i++
    } else {
      lines.push({ kind: 'add', text: after[j] })
      j++
    }
  }
  while (i < n) lines.push({ kind: 'remove', text: before[i++] })
  while (j < m) lines.push({ kind: 'add', text: after[j++] })
  return lines
}

const lines = computed(() => diffLines(props.diff.before.split('\n'), props.diff.after.split('\n')))
</script>

<template>
  <div class="app-border panel-bg animate-in flex min-h-0 flex-col rounded-lg border">
    <header class="app-border flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
      <code class="app-fg min-w-0 truncate font-semibold">{{ diff.file }}</code>
      <span class="flex shrink-0 gap-2 font-mono">
        <span class="text-[var(--success)]">+{{ diff.additions }}</span>
        <span class="text-[var(--error)]">-{{ diff.deletions }}</span>
      </span>
    </header>
    <div class="min-h-0 flex-1 overflow-auto">
      <table class="app-fg w-full border-collapse font-mono text-[11px] leading-5">
        <tbody>
          <tr v-for="(line, index) in lines" :key="index">
            <td
              class="select-none px-1 text-right opacity-50"
              :class="line.kind === 'add' ? 'text-[var(--success)]' : line.kind === 'remove' ? 'text-[var(--error)]' : ''"
              >{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : '' }}</td
            >
            <td
              class="whitespace-pre-wrap px-2"
              :class="line.kind === 'add' ? 'bg-[var(--success)]/10 text-[var(--success)]' : line.kind === 'remove' ? 'bg-[var(--error)]/10 text-[var(--error)]' : ''"
              >{{ line.text }}</td
            >
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
