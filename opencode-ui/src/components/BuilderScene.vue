<script setup lang="ts">
import { computed } from 'vue'

import { currentStage, stageProgress, useTaskPct } from '@/composables/useTaskPct'

// Shared shell for the cartoony busy figure. The stage, brick tower, phase
// props and ground line are identical for every character, so they live here
// once; each character component slots in its own figure and keeps its own
// per-scene animations, keyed off the `builder-stage--<scene>` ancestor class.

const props = defineProps<{
  label: string
}>()

useTaskPct()

const BLOCKS = 8
const ASSEMBLING = 2
const RESPONDING = 3

const stage = computed(() => currentStage.value)
const isAssembling = computed(() => stage.value === ASSEMBLING)
const isResponding = computed(() => stage.value === RESPONDING)

// Scene class names match the friendly phase names; the assembling stage is
// the "building" scene per the design doc.
const SCENE_CLASS = ['thinking', 'checking', 'building', 'responding'] as const
const sceneClass = computed(() => SCENE_CLASS[stage.value] ?? 'thinking')

// Tower blocks appear in order as progress climbs through the assembling
// stage; the tower stays fully built (with a flag) in the responding stage.
const buildProgress = computed(() => {
  if (isResponding.value) return 1
  if (!isAssembling.value) return 0
  return stageProgress(ASSEMBLING) / 100
})

function blockVisible(index: number): boolean {
  if (!isAssembling.value && !isResponding.value) return false
  return index / BLOCKS <= buildProgress.value
}
</script>

<template>
  <div class="cartoony-builder" role="status" :aria-label="props.label">
    <div class="builder-stage" :class="`builder-stage--${sceneClass}`">
      <div class="builder-tower" aria-hidden="true">
        <span
          v-for="index in BLOCKS"
          :key="index"
          class="builder-block"
          :class="{ 'is-visible': blockVisible(index - 1) }"
          :style="{ '--block-i': index }"
        />
        <span v-if="isResponding" class="builder-flag">🚩</span>
      </div>

      <div class="builder-figure" aria-hidden="true">
        <slot :scene="sceneClass" :hat="isAssembling" />
      </div>

      <div class="builder-props" aria-hidden="true">
        <template v-if="stage === 0">
          <span class="builder-prop builder-bubble builder-bubble--1">💭</span>
          <span class="builder-prop builder-bubble builder-bubble--2">💡</span>
        </template>
        <template v-else-if="stage === 1">
          <span class="builder-prop builder-blueprint">📋</span>
          <span class="builder-prop builder-glass">🔍</span>
          <span class="builder-prop builder-hmm">hmm</span>
        </template>
        <template v-else-if="isAssembling">
          <span class="builder-prop builder-hammer">🔨</span>
          <span class="builder-prop builder-crane">🏗️</span>
          <span class="builder-prop builder-dust builder-dust--1">💨</span>
          <span class="builder-prop builder-dust builder-dust--2">💨</span>
        </template>
        <template v-else-if="isResponding">
          <span class="builder-prop builder-confetti builder-confetti--1">🎉</span>
          <span class="builder-prop builder-confetti builder-confetti--2">🎉</span>
          <span class="builder-prop builder-confetti builder-confetti--3">🎉</span>
          <span class="builder-prop builder-tada">ta-da!</span>
        </template>
      </div>

      <div class="builder-ground" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.cartoony-builder {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
  /* Shared brick colors for the tower; characters keep their own palette. */
  --builder-brick: color-mix(in srgb, var(--accent) 92%, var(--bg-panel));
  --builder-brick-shade: color-mix(in srgb, var(--accent) 78%, var(--bg-elevated));
}

.builder-stage {
  position: relative;
  width: 320px;
  height: 210px;
}

/* Ground line anchors the scene on both tones. */
.builder-ground {
  position: absolute;
  left: 4%;
  right: 4%;
  bottom: 8px;
  height: 4px;
  border-radius: 9999px;
  background: var(--border);
}

/* The tower: bricks appear one by one as the building stage progresses. */
.builder-tower {
  position: absolute;
  left: 12px;
  bottom: 16px;
  width: 60px;
  display: flex;
  flex-direction: column-reverse;
  z-index: 1;
}
.builder-block {
  width: 100%;
  height: 20px;
  margin-top: -3px;
  border-radius: 5px;
  background: var(--builder-brick);
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--bg-panel) 45%, transparent);
  opacity: 0;
  transform: translateY(-10px) scale(0.7);
  transition:
    opacity 0.25s ease,
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition-delay: calc((var(--block-i) - 1) * 0.05s);
}
.builder-block:nth-child(even) {
  background: var(--builder-brick-shade);
}
.builder-block.is-visible {
  opacity: 1;
  transform: none;
}
.builder-flag {
  position: absolute;
  top: -26px;
  left: 50%;
  font-size: 20px;
  transform: translateX(-50%);
  animation: builder-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Anchor for the slotted character figure (bottom-right of the stage). */
.builder-figure {
  position: absolute;
  right: 8px;
  bottom: 10px;
  z-index: 2;
}

/* Phase props. */
.builder-prop {
  position: absolute;
  z-index: 3;
}
.builder-bubble {
  font-size: 22px;
  animation: builder-float 2.6s ease-in-out infinite;
}
.builder-bubble--1 {
  left: 160px;
  top: 14px;
}
.builder-bubble--2 {
  left: 206px;
  top: 48px;
  animation-delay: 0.9s;
}
@keyframes builder-float {
  0% {
    transform: translateY(8px) scale(0.7);
    opacity: 0;
  }
  30% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    transform: translateY(-22px) scale(1.15);
    opacity: 0;
  }
}
.builder-blueprint {
  left: 154px;
  top: 38px;
  font-size: 30px;
  transform: rotate(-6deg);
}
.builder-glass {
  left: 146px;
  top: 30px;
  font-size: 24px;
  animation: builder-sweep 2.4s ease-in-out infinite;
}
@keyframes builder-sweep {
  0%, 100% {
    transform: translateX(0) rotate(8deg);
  }
  50% {
    transform: translateX(30px) rotate(0deg);
  }
}
.builder-hmm {
  left: 212px;
  top: 18px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  animation: builder-hmm-pop 2.4s ease-in-out infinite;
}
@keyframes builder-hmm-pop {
  0%, 80%, 100% {
    opacity: 0;
    transform: translateY(2px);
  }
  90% {
    opacity: 1;
    transform: none;
  }
}
.builder-hammer {
  right: 4px;
  bottom: 34px;
  font-size: 22px;
  transform-origin: 80% 20%;
  animation: builder-swing 0.8s ease-in-out infinite alternate;
}
@keyframes builder-swing {
  from {
    transform: rotate(-30deg);
  }
  to {
    transform: rotate(18deg);
  }
}
.builder-crane {
  left: 20px;
  top: -6px;
  font-size: 26px;
  animation: builder-floaty 1.6s ease-in-out infinite;
}
@keyframes builder-floaty {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
.builder-dust {
  font-size: 16px;
  opacity: 0;
  animation: builder-puff 1.2s ease-out infinite;
}
.builder-dust--1 {
  left: 14px;
  bottom: 16px;
}
.builder-dust--2 {
  left: 46px;
  bottom: 12px;
  animation-delay: 0.5s;
}
@keyframes builder-puff {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.6);
  }
  30% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(8px, -26px) scale(1.15);
  }
}
.builder-confetti {
  font-size: 18px;
  animation: builder-burst 2.4s ease-out infinite;
}
.builder-confetti--1 {
  left: 100px;
  top: 62px;
  --dx: -26px;
}
.builder-confetti--2 {
  left: 200px;
  top: 30px;
  animation-delay: 0.4s;
  --dx: 18px;
}
.builder-confetti--3 {
  left: 40px;
  top: 20px;
  animation-delay: 0.8s;
  --dx: 34px;
}
@keyframes builder-burst {
  0% {
    transform: translate(0, 0) rotate(0deg);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx, 12px), -34px) rotate(20deg);
    opacity: 0;
  }
}
.builder-tada {
  left: 50%;
  top: 6px;
  transform: translateX(-50%);
  font-size: 14px;
  font-weight: 800;
  color: var(--progress-accent);
  animation: builder-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes builder-pop {
  0% {
    transform: translateX(-50%) scale(0.5);
    opacity: 0;
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

/* Reduced motion: static scene props, thought bubbles / dust / confetti
   hidden, tower fully built. Characters keep their own figure rules. */
@media (prefers-reduced-motion: reduce) {
  .builder-bubble,
  .builder-glass,
  .builder-hmm,
  .builder-hammer,
  .builder-crane,
  .builder-dust,
  .builder-confetti,
  .builder-flag,
  .builder-tada {
    animation: none;
  }
  .builder-bubble,
  .builder-hmm,
  .builder-dust,
  .builder-confetti {
    display: none;
  }
  .builder-block {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
