<script setup lang="ts">
import { computed } from 'vue'
import type { ToolPart } from '@opencode-ai/sdk/client'

import UiBadge from '@/components/ui/UiBadge.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'

const props = defineProps<{ part: ToolPart }>()

const statusLabel = computed(() => {
  switch (props.part.state.status) {
    case 'pending':
      return 'pending'
    case 'running':
      return 'running'
    case 'completed':
      return 'success'
    default:
      return 'error'
  }
})

const badgeTone = computed(() => {
  switch (props.part.state.status) {
    case 'running':
      return 'accent'
    case 'completed':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'neutral'
  }
})

const title = computed(() => {
  const state = props.part.state
  return state.status === 'running' || state.status === 'completed' ? state.title : null
})

// Call arguments, rendered generically so bash commands, file read/write paths
// and search patterns all surface without hard-coding per-tool schemas.
// `content`/`raw` are skipped to avoid dumping large payloads.
const callLines = computed(() => {
  const input = props.part.state.input
  const lines: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    if (key === 'content' || key === 'raw') continue
    const shown = typeof value === 'string' ? value : JSON.stringify(value)
    if (shown && shown !== '""' && shown !== '{}') lines.push(`${key}: ${shown}`)
  }
  return lines
})

const output = computed(() =>
  props.part.state.status === 'completed' ? props.part.state.output : null,
)

// ponytail: the SDK exposes no structured exit code; opencode appends a
// trailing "Exit code: N" line to bash tool output. The regex only matches
// that exact marker and degrades to no badge when it is absent.
const exitCode = computed(() => {
  const text = output.value
  if (!text) return null
  const match = text.match(/Exit code:\s*(-?\d+)\s*$/)
  return match ? Number(match[1]) : null
})

const body = computed(() => {
  if (!output.value) return ''
  return exitCode.value !== null
    ? output.value.replace(/Exit code:\s*-?\d+\s*$/, '').trimEnd()
    : output.value
})

const lineCount = computed(() => (body.value ? body.value.split('\n').length : 0))
</script>

<template>
  <article class="app-border panel-bg app-fg animate-in flex flex-col gap-1.5 rounded-lg border p-3">
    <header class="flex items-center gap-2 text-xs">
      <UiSpinner
        v-if="part.state.status === 'pending' || part.state.status === 'running'"
        size="sm"
      />
      <span v-else-if="part.state.status === 'completed'" class="text-[var(--success)]">✓</span>
      <span v-else class="text-[var(--error)]">✕</span>
      <code class="font-semibold">{{ part.tool }}</code>
      <span v-if="title" class="muted min-w-0 truncate">{{ title }}</span>
      <UiBadge :tone="badgeTone" class="ml-auto">{{ statusLabel }}</UiBadge>
    </header>
    <div
      v-if="part.state.status === 'running' || part.state.status === 'pending'"
      class="soft-progress"
    ></div>
    <pre
      v-if="callLines.length"
      class="app-border muted max-h-40 overflow-auto whitespace-pre-wrap rounded border px-2 py-1 font-mono text-[11px] leading-relaxed"
      >{{ callLines.join('\n') }}</pre
    >
    <details
      v-if="output !== null"
      class="app-border max-h-72 overflow-auto rounded border px-2 py-1"
      :open="lineCount <= 8"
    >
      <summary class="muted flex cursor-pointer select-none items-center gap-2 text-xs">
        output
        <span class="opacity-60">({{ lineCount }} line{{ lineCount === 1 ? '' : 's' }})</span>
        <span
          v-if="exitCode !== null"
          class="font-semibold"
          :class="exitCode === 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'"
          >exit {{ exitCode }}</span
        >
      </summary>
      <pre class="app-fg mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{{
        body
      }}</pre>
    </details>
    <pre
      v-if="part.state.status === 'error'"
      class="muted max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed"
      >{{ part.state.error }}</pre
    >
  </article>
</template>
