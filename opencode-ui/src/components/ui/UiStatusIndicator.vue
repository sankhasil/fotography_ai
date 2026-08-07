<script lang="ts">
export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'offline'
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: ConnectionStatus
    label?: string
  }>(),
  { label: undefined },
)

const dotClass = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'bg-[var(--success)]'
    case 'offline':
      return 'bg-[var(--error)]'
    default:
      return 'accent-bg animate-pulse'
  }
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span class="h-2 w-2 rounded-full" :class="dotClass"></span>
    <span class="muted">{{ label ?? status }}</span>
  </span>
</template>
