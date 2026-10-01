<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAppStore } from '@/composables/useAppStore'

const props = defineProps<{ eventsVisible: boolean; lastEventAt: number | null }>()
defineEmits<{ (e: 'toggle-events'): void }>()

const { status, error, connect, formattedRemaining, usagePercent, warningLevel } =
  useAppStore()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const elapsed = computed(() => {
  if (!props.lastEventAt) return '—'
  const seconds = Math.max(0, Math.floor((now.value - props.lastEventAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
})

const warningClass = computed(() => {
  if (warningLevel.value === 'critical') return 'text-[var(--error)] font-semibold'
  if (warningLevel.value === 'warning') return 'text-[var(--warning)]'
  return ''
})
</script>

<template>
  <footer
    class="app-border app-bg muted flex items-center gap-4 border-t px-4 py-1.5 text-xs"
  >
    <span>tool: —</span>
    <span :class="warningClass" title="Tokens remaining in context window">
      tokens: {{ formattedRemaining }}
      <span v-if="usagePercent > 0" class="opacity-70">
        ({{ Math.round(usagePercent) }}% used)
      </span>
    </span>
    <span>elapsed: {{ elapsed }}</span>
    <span v-if="status === 'offline' && error" class="text-[var(--error)]" :title="error">
      offline
    </span>
    <button
      v-if="status === 'offline'"
      type="button"
      class="cursor-pointer text-[var(--error)] underline-offset-2 hover:underline"
      @click="connect"
    >
      retry
    </button>
    <button
      type="button"
      class="ml-auto cursor-pointer underline-offset-2 hover:underline"
      @click="$emit('toggle-events')"
    >
      {{ eventsVisible ? 'hide events' : 'show events' }}
    </button>
  </footer>
</template>
