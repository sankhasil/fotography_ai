<script setup lang="ts">
import { onUnmounted, watch } from 'vue'

import { STAGES, useTaskPct } from '@/composables/useTaskPct'

// Animated task progress for the busy state. A big percentage drives a row of
// stage pies ("thinking", "checking", "assembling", "responding"); each pie
// fills in turn as the overall percentage climbs. The whole widget is themed
// via CSS custom properties so every theme reuses it. The clock itself lives
// in useTaskPct so the octopus busy figure animates in lockstep.

const props = defineProps<{ active: boolean }>()

const { overall, stageProgress, isComplete, start, stop } = useTaskPct()

watch(
  () => props.active,
  (active) => {
    if (active) start()
    else stop()
  },
  { immediate: true },
)

onUnmounted(() => stop())

function dasharray(index: number): string {
  const p = stageProgress(index)
  return `${p} ${100 - p}`
}
</script>

<template>
  <div class="task-progress">
    <div class="task-progress__overall">
      <span class="task-progress__pct">{{ overall }}</span>
      <span class="task-progress__unit">%</span>
    </div>
    <div class="task-progress__stages">
      <div
        v-for="(stage, index) in STAGES"
        :key="stage.key"
        class="task-progress__stage"
        :class="{
          'is-active': !isComplete(index) && stageProgress(index) > 0,
          'is-done': isComplete(index),
        }"
      >
        <svg class="task-progress__pie" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="task-progress__pie-track" cx="18" cy="18" r="15.9" />
          <circle
            class="task-progress__pie-fill"
            cx="18"
            cy="18"
            r="15.9"
            :stroke-dasharray="dasharray(index)"
          />
        </svg>
        <span class="task-progress__label">{{ stage.label }}</span>
      </div>
    </div>
  </div>
</template>
