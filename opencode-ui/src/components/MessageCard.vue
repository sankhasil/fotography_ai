<script setup lang="ts">
import { computed } from 'vue'
import type { Part } from '@opencode-ai/sdk/client'

import ToolCard from '@/components/tool/ToolCard.vue'
import type { MessageRecord } from '@/composables/useConversation'

const props = defineProps<{ record: MessageRecord }>()

const role = computed(() => props.record.info?.role ?? 'assistant')

const modelID = computed(() =>
  props.record.info?.role === 'assistant' ? props.record.info.modelID : null,
)

// In-flight assistant message: no completion timestamp yet. Drives the jarvis
// typewriter caret on its text parts.
const streaming = computed(
  () => props.record.info?.role === 'assistant' && !props.record.info.time?.completed,
)

function partKey(part: Part): string {
  return part.id
}

function partTime(part: Part): number | null {
  if (!('time' in part) || !part.time) return null
  return 'start' in part.time ? part.time.start : null
}
</script>

<template>
  <article
    v-motion
    :initial="{ opacity: 0, y: 6 }"
    :enter="{ opacity: 1, y: 0, transition: { duration: 250 } }"
    class="app-border panel-bg animate-in flex flex-col gap-2 rounded-lg border p-3"
  >
    <header class="muted flex items-center gap-2 text-xs">
      <span class="accent-bg accent-fg rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
        {{ role }}
      </span>
      <span v-if="modelID" class="truncate">{{ modelID }}</span>
      <span
        v-if="record.info?.time?.created"
        class="ml-auto"
      >{{ new Date(record.info.time.created).toLocaleTimeString() }}</span>
    </header>

    <div class="app-fg flex flex-col gap-2">
      <template v-for="part in record.parts" :key="partKey(part)">
        <div
          v-if="part.type === 'text' && part.text"
          class="whitespace-pre-wrap text-sm leading-relaxed"
          :class="{ typewriter: streaming }"
        >
          {{ part.text }}
        </div>
        <details v-else-if="part.type === 'reasoning' && part.text" class="group">
          <summary class="muted cursor-pointer select-none text-xs">
            reasoning <span v-if="partTime(part)" class="opacity-60">{{ partTime(part) }}</span>
          </summary>
          <div class="muted mt-1 whitespace-pre-wrap text-xs leading-relaxed">{{ part.text }}</div>
        </details>
        <ToolCard v-else-if="part.type === 'tool'" :part="part" />
        <div v-else-if="part.type === 'file'" class="muted text-xs">
          file: {{ part.filename ?? part.url }}
        </div>
        <div v-else class="muted opacity-60 text-xs">{{ part.type }}</div>
      </template>
    </div>
  </article>
</template>
