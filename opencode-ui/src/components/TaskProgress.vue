<script setup lang="ts">
import { STAGES, useTaskPct } from '@/composables/useTaskPct'

// Animated task progress for the busy state. A big percentage drives a row of
// stage pies ("reasoning", "searching", "applying", "streaming"); each pie
// fills as the percentage climbs and is marked done once its band completes.
// The whole widget is themed via CSS custom properties so every theme reuses
// it. The clock itself lives in useTaskPct — driven by the run lifecycle in
// OutputPanel — so the octopus busy figure animates in lockstep.

const { overall, stageProgress, isComplete, currentStage } = useTaskPct()

function dasharray(index: number): string {
  const p = stageProgress(index)
  return `${p} ${100 - p}`
}

function roundedOverall(): number {
  return Math.round(overall.value)
}
</script>

<template>
  <div class="task-progress">
    <div class="task-progress__overall">
      <span class="task-progress__pct">{{ roundedOverall() }}</span>
      <span class="task-progress__unit">%</span>
    </div>
    <div class="task-progress__stages">
      <div
        v-for="(stage, index) in STAGES"
        :key="stage.key"
        class="task-progress__stage"
        :class="{
          'is-active': currentStage === index && !isComplete(index),
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
