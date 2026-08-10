<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import DolphinFigure from '@/components/figures/DolphinFigure.vue'
import OctopusFigure from '@/components/figures/OctopusFigure.vue'
import PenguinFigure from '@/components/figures/PenguinFigure.vue'
import PickleRickFigure from '@/components/figures/PickleRickFigure.vue'
import StickFigure from '@/components/figures/StickFigure.vue'
import type { BusyCharacter } from '@/composables/useBusyCharacter'

// Cartoony delete wipe: the session model's mascot sweeps the documents into
// the trash with a broom, and "task finished" confirms the wipe. Plays once
// per delete; emits `done` when the animation completes so the parent can
// unmount it. CSS-driven (scoped keyframes), no runtime deps.

const props = defineProps<{
  visible: boolean
  character: BusyCharacter
}>()
const emit = defineEmits<{ (e: 'done'): void }>()

// Total animation length in ms; must match the slowest CSS animation.
const DURATION = 2400

const playing = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.visible,
  (value) => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (value) {
      playing.value = true
      timer = setTimeout(() => {
        playing.value = false
        emit('done')
      }, DURATION)
    } else {
      playing.value = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="playing" class="cartoony-sweeper" role="status" aria-label="Deleting session">
      <div class="cartoony-sweeper__stage">
        <div class="cartoony-sweeper__ground" />

        <div class="cartoony-sweeper__character">
          <div class="cartoony-sweeper__figure">
            <OctopusFigure v-if="character === 'octopus'" />
            <PickleRickFigure v-else-if="character === 'pickle-rick'" />
            <PenguinFigure v-else-if="character === 'penguin'" />
            <DolphinFigure v-else-if="character === 'dolphin'" />
            <StickFigure v-else />
          </div>
          <span class="cartoony-sweeper__broom">🧹</span>
        </div>

        <span class="cartoony-sweeper__doc cartoony-sweeper__doc--1">📄</span>
        <span class="cartoony-sweeper__doc cartoony-sweeper__doc--2">📄</span>
        <span class="cartoony-sweeper__doc cartoony-sweeper__doc--3">📄</span>
        <span class="cartoony-sweeper__doc cartoony-sweeper__doc--4">📄</span>

        <span class="cartoony-sweeper__bin">🗑</span>

        <p class="cartoony-sweeper__text">task finished</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cartoony-sweeper {
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--bg-panel);
}

/* Fixed-width stage so the character, docs and bin always line up. */
.cartoony-sweeper__stage {
  position: relative;
  width: 720px;
  height: 440px;
  pointer-events: none;
}

.cartoony-sweeper__ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 32px;
  height: 4px;
  border-radius: 9999px;
  background: var(--border);
}

/* The mascot, larger than in the busy scene, bobbing gently while it sweeps.
   It stays put; the broom and docs do the work. */
.cartoony-sweeper__character {
  position: absolute;
  left: 76px;
  bottom: 32px;
  width: 190px;
  height: 220px;
  z-index: 3;
  animation: cartoony-bob 1.1s ease-in-out infinite;
}
.cartoony-sweeper__figure {
  position: absolute;
  left: 0;
  bottom: 0;
  transform-origin: bottom center;
  transform: scale(1.35);
}

/* Broom held in front of the figure, sweeping the floor. */
.cartoony-sweeper__broom {
  position: absolute;
  left: 118px;
  top: 100px;
  font-size: 46px;
  line-height: 1;
  transform-origin: 50% 100%;
  transform: rotate(30deg);
  filter: drop-shadow(0 6px 10px color-mix(in srgb, var(--text) 20%, transparent));
  animation: cartoony-broom 1.1s ease-in-out infinite;
}

/* Trash bin waits on the right for the documents. */
.cartoony-sweeper__bin {
  position: absolute;
  right: 72px;
  bottom: 36px;
  font-size: 72px;
  line-height: 1;
  z-index: 2;
  filter: drop-shadow(0 8px 16px color-mix(in srgb, var(--text) 25%, transparent));
  animation: cartoony-bin 600ms ease-in-out 1300ms 3;
}

/* Documents sweep out of the pile and fly into the bin, staggered. */
.cartoony-sweeper__doc {
  position: absolute;
  font-size: 32px;
  line-height: 1;
  opacity: 0;
  z-index: 1;
  animation: cartoony-doc 700ms ease-in forwards;
}
.cartoony-sweeper__doc--1 {
  left: 250px;
  bottom: 200px;
  --doc-dx: 330px;
  --doc-dy: -100px;
  animation-delay: 200ms;
}
.cartoony-sweeper__doc--2 {
  left: 300px;
  bottom: 160px;
  --doc-dx: 290px;
  --doc-dy: -80px;
  animation-delay: 450ms;
}
.cartoony-sweeper__doc--3 {
  left: 260px;
  bottom: 120px;
  --doc-dx: 340px;
  --doc-dy: -60px;
  animation-delay: 700ms;
}
.cartoony-sweeper__doc--4 {
  left: 320px;
  bottom: 90px;
  --doc-dx: 290px;
  --doc-dy: -40px;
  animation-delay: 950ms;
}

.cartoony-sweeper__text {
  position: absolute;
  bottom: 12%;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-family: var(--font);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 2px 12px color-mix(in srgb, var(--accent) 35%, transparent);
  opacity: 0;
  animation: cartoony-text 500ms ease-out 1600ms forwards;
}

@keyframes cartoony-bob {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes cartoony-broom {
  0%, 100% {
    transform: rotate(30deg);
  }
  50% {
    transform: rotate(4deg);
  }
}

@keyframes cartoony-bin {
  0%, 100% {
    transform: rotate(0);
  }
  25% {
    transform: rotate(-7deg);
  }
  75% {
    transform: rotate(7deg);
  }
}

@keyframes cartoony-doc {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0) scale(1);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--doc-dx), var(--doc-dy)) rotate(-24deg) scale(0.3);
  }
}

@keyframes cartoony-text {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cartoony-sweeper__character,
  .cartoony-sweeper__broom,
  .cartoony-sweeper__bin,
  .cartoony-sweeper__doc,
  .cartoony-sweeper__text {
    animation: none;
  }
  .cartoony-sweeper__doc {
    opacity: 0;
  }
}
</style>
