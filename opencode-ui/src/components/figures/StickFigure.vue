<script setup lang="ts">
// A plain stick figure, the fallback busy character for any model without a
// dedicated mascot. Shared by the busy builder (BuilderScene slots it in) and
// the cartoony delete sweeper. `scene` drives the per-phase motion, `hat`
// shows the hard hat.

defineProps<{
  scene?: string
  hat?: boolean
}>()
</script>

<template>
  <div class="stick" :class="scene ? `stick--${scene}` : ''">
    <span v-if="hat" class="stick-hat">🪖</span>
    <span class="stick-arm stick-arm--l" />
    <span class="stick-arm stick-arm--r" />
    <span class="stick-leg stick-leg--l" />
    <span class="stick-leg stick-leg--r" />
    <div class="stick-head">
      <span class="stick-eye stick-eye--l" />
      <span class="stick-eye stick-eye--r" />
      <span class="stick-smile" />
    </div>
    <div class="stick-body" />
  </div>
</template>

<style scoped>
.stick {
  position: relative;
  width: 110px;
  height: 160px;
  --stick: color-mix(in srgb, var(--text) 68%, var(--bg-elevated));
}
.stick-head {
  position: absolute;
  left: 50%;
  top: 0;
  width: 44px;
  height: 44px;
  transform: translateX(-50%);
  border: 4px solid var(--stick);
  border-radius: 50%;
  z-index: 1;
}
.stick-eye {
  position: absolute;
  top: 14px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--stick);
}
.stick-eye--l {
  left: 12px;
}
.stick-eye--r {
  right: 12px;
}
.stick-smile {
  position: absolute;
  left: 50%;
  bottom: 8px;
  width: 14px;
  height: 6px;
  transform: translateX(-50%);
  border-bottom: 2px solid var(--stick);
  border-radius: 0 0 50% 50%;
}
.stick-body {
  position: absolute;
  left: 50%;
  top: 40px;
  width: 6px;
  height: 62px;
  transform: translateX(-50%);
  border-radius: 9999px;
  background: var(--stick);
}
.stick-arm {
  position: absolute;
  top: 52px;
  width: 46px;
  height: 6px;
  border-radius: 9999px;
  background: var(--stick);
  transform-origin: 0 50%;
}
.stick-arm--l {
  left: 49px;
  transform: rotate(22deg);
}
.stick-arm--r {
  left: 49px;
  transform: rotate(158deg);
}
.stick-leg {
  position: absolute;
  top: 96px;
  width: 6px;
  height: 44px;
  border-radius: 9999px;
  background: var(--stick);
  transform-origin: top center;
}
.stick-leg--l {
  left: 47px;
  transform: rotate(-10deg);
}
.stick-leg--r {
  right: 47px;
  transform: rotate(10deg);
}

/* Per-scene motion, keyed off the scene class. The whole figure bounces
   while building; arms wave when responding. */
.stick--thinking .stick-head {
  animation: stick-tilt 2.4s ease-in-out infinite;
}
.stick--checking .stick-head {
  animation: stick-scan 2.2s ease-in-out infinite;
}
.stick--building .stick {
  animation: stick-bounce 0.9s ease-in-out infinite;
}
.stick--responding .stick-arm--l {
  animation: stick-wave-l 0.7s ease-in-out infinite alternate;
}
.stick--responding .stick-arm--r {
  animation: stick-wave-r 0.7s ease-in-out infinite alternate;
}
@keyframes stick-tilt {
  0%, 100% {
    transform: translateX(-50%) rotate(-5deg);
  }
  50% {
    transform: translateX(-50%) rotate(5deg);
  }
}
@keyframes stick-scan {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(2px);
  }
}
@keyframes stick-bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
@keyframes stick-wave-l {
  from {
    transform: rotate(8deg);
  }
  to {
    transform: rotate(52deg);
  }
}
@keyframes stick-wave-r {
  from {
    transform: rotate(138deg);
  }
  to {
    transform: rotate(182deg);
  }
}

.stick-hat {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 24px;
  line-height: 1;
  z-index: 2;
  animation: stick-bob 0.9s ease-in-out infinite;
}
@keyframes stick-bob {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}

/* Reduced motion: static figure pose. Matches the DeleteSweeper / PlasmaOrb
   convention. */
@media (prefers-reduced-motion: reduce) {
  .stick,
  .stick-head,
  .stick-arm,
  .stick-hat {
    animation: none;
  }
}
</style>
