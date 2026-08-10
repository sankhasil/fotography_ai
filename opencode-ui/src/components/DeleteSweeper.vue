<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import MatrixRain from '@/components/MatrixRain.vue'

// Full-screen delete wipe: matrix rain sweeps the app away into a blackhole,
// documents are pulled into the trash, and "task finished" confirms the wipe.
// Plays once per delete; emits `done` when the animation completes so the
// parent can unmount it. CSS-driven (scoped keyframes), no runtime deps.

const props = defineProps<{ visible: boolean }>()
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
    <div
      v-if="playing"
      class="sweeper fixed inset-0 z-[100] overflow-hidden"
      role="status"
      aria-label="Deleting session"
    >
      <MatrixRain class="sweeper__rain" mode="panel" :opacity="0.85" />
      <div class="sweeper__sweep"></div>

      <div class="sweeper__center">
        <div class="sweeper__hole">
          <div class="sweeper__hole-ring"></div>
        </div>
        <div class="sweeper__bin">🗑</div>
        <div class="sweeper__doc sweeper__doc--1">📄</div>
        <div class="sweeper__doc sweeper__doc--2">📄</div>
        <div class="sweeper__doc sweeper__doc--3">📄</div>
        <div class="sweeper__doc sweeper__doc--4">📄</div>
        <p class="sweeper__text">task finished</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* The rain canvas is absolute inset-0 within the fixed overlay. */
.sweeper__rain {
  position: absolute;
  inset: 0;
}

/* The "broom": a vertical phosphor-green gradient bar translating across,
   wiping the content beneath out as it passes. */
.sweeper__sweep {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform: translateX(-120%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(26, 255, 140, 0.05) 30%,
    rgba(26, 255, 140, 0.55) 50%,
    rgba(26, 255, 140, 0.05) 70%,
    transparent 100%
  );
  animation: sweeper-sweep 900ms ease-in-out forwards;
  pointer-events: none;
}

.sweeper__center {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/* Blackhole at center: dark disc + glowing accretion ring. */
.sweeper__hole {
  position: relative;
  width: 160px;
  height: 160px;
  border-radius: 9999px;
  background: radial-gradient(circle at 50% 40%, #05230f 0%, #021006 55%, #000 100%);
  box-shadow:
    0 0 40px 8px rgba(26, 255, 140, 0.25),
    inset 0 0 30px 6px rgba(26, 255, 140, 0.3);
  animation: sweeper-grow 900ms ease-out both;
}

.sweeper__hole-ring {
  position: absolute;
  inset: -14px;
  border-radius: 9999px;
  border: 3px solid transparent;
  border-top-color: #1aff8c;
  border-bottom-color: #0d7a44;
  filter: drop-shadow(0 0 8px rgba(26, 255, 140, 0.7));
  animation: sweeper-spin 2.4s linear infinite;
}

/* Trash bin sits over the blackhole and shrinks into it. */
.sweeper__bin {
  position: absolute;
  z-index: 4;
  font-size: 52px;
  line-height: 1;
  animation: sweeper-bin 1500ms ease-in forwards;
}

/* Documents spiral into the trash from different offsets. */
.sweeper__doc {
  position: absolute;
  font-size: 30px;
  line-height: 1;
  opacity: 0;
  animation: sweeper-doc 1300ms ease-in forwards;
}
.sweeper__doc--1 {
  transform: translate(-240px, -120px);
  animation-delay: 150ms;
}
.sweeper__doc--2 {
  transform: translate(240px, -140px);
  animation-delay: 300ms;
}
.sweeper__doc--3 {
  transform: translate(-220px, 120px);
  animation-delay: 450ms;
}
.sweeper__doc--4 {
  transform: translate(260px, 90px);
  animation-delay: 600ms;
}

.sweeper__text {
  position: absolute;
  bottom: 18%;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-family: var(--font);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1aff8c;
  text-shadow: 0 0 12px rgba(26, 255, 140, 0.8);
  opacity: 0;
  animation: sweeper-text 700ms ease-out 1300ms forwards;
}

@keyframes sweeper-sweep {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

@keyframes sweeper-grow {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes sweeper-spin {
  to {
    transform: rotate(1turn);
  }
}

@keyframes sweeper-bin {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  70% {
    transform: translateY(-8px) scale(1.05);
    opacity: 1;
  }
  100% {
    transform: translateY(0) scale(0.1);
    opacity: 0;
  }
}

@keyframes sweeper-doc {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(0, 0) scale(0.1);
    opacity: 0;
  }
}

@keyframes sweeper-text {
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
  .sweeper__sweep,
  .sweeper__hole,
  .sweeper__hole-ring,
  .sweeper__bin,
  .sweeper__doc,
  .sweeper__text {
    animation-duration: 0.01s;
    animation-delay: 0s;
  }
  .sweeper__bin {
    animation: none;
  }
}
</style>
