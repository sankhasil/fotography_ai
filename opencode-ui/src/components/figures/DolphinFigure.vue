<script setup lang="ts">
// A circus-style dolphin standing on its tail, the character shown when a
// Deepseek model is the session. Shared by the busy builder (BuilderScene
// slots it in) and the cartoony delete sweeper. `scene` drives the per-phase
// motion, `hat` shows the hard hat.

defineProps<{
  scene?: string
  hat?: boolean
}>()
</script>

<template>
  <div class="dolphin" :class="scene ? `dolphin--${scene}` : ''">
    <span v-if="hat" class="dolphin-hat">🪖</span>
    <span class="dolphin-fin" />
    <div class="dolphin-body">
      <div class="dolphin-face">
        <span class="dolphin-snout" />
        <span class="dolphin-eye" />
      </div>
      <div class="dolphin-belly" />
    </div>
    <span class="dolphin-flipper dolphin-flipper--l" />
    <span class="dolphin-flipper dolphin-flipper--r" />
    <span class="dolphin-tail" />
  </div>
</template>

<style scoped>
.dolphin {
  position: relative;
  width: 130px;
  height: 150px;
  /* Blue-grey body that holds contrast on any theme tone. */
  --dolphin: color-mix(in srgb, #6f8aa0 88%, var(--bg-panel));
  --dolphin-dark: color-mix(in srgb, #4d6478 85%, var(--bg-panel));
  --dolphin-belly: color-mix(in srgb, var(--bg-panel) 90%, var(--text));
}
.dolphin-body {
  position: absolute;
  left: 50%;
  top: 4px;
  width: 92px;
  height: 120px;
  transform: translateX(-50%);
  border-radius: 44% 44% 40% 40% / 38% 38% 60% 60%;
  background: var(--dolphin);
  box-shadow:
    0 6px 14px color-mix(in srgb, var(--text) 20%, transparent),
    inset 0 3px 0 color-mix(in srgb, var(--bg-panel) 30%, transparent);
  z-index: 1;
}
.dolphin-belly {
  position: absolute;
  left: 50%;
  bottom: 12px;
  width: 52px;
  height: 46px;
  transform: translateX(-50%);
  border-radius: 9999px 9999px 60% 60% / 80% 80% 45% 45%;
  background: var(--dolphin-belly);
}
.dolphin-face {
  position: absolute;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  width: 74px;
  height: 34px;
  z-index: 2;
}
.dolphin-snout {
  position: absolute;
  left: 0;
  top: 14px;
  width: 24px;
  height: 11px;
  border-radius: 6px 0 0 6px;
  background: var(--dolphin-dark);
}
.dolphin-snout::after {
  content: '';
  position: absolute;
  right: 2px;
  bottom: -4px;
  width: 20px;
  height: 8px;
  border-bottom: 2px solid var(--dolphin-dark);
  border-radius: 0 0 50% 50%;
}
.dolphin-eye {
  position: absolute;
  right: 8px;
  top: 4px;
  width: 12px;
  height: 13px;
  border-radius: 50%;
  background: var(--dolphin-dark);
  box-shadow: inset -2px -2px 0 0 var(--dolphin-belly);
}
.dolphin-fin {
  position: absolute;
  right: 14px;
  top: 0;
  width: 30px;
  height: 24px;
  background: var(--dolphin-dark);
  clip-path: polygon(100% 0, 100% 100%, 0 45%);
  z-index: 0;
}
.dolphin-flipper {
  position: absolute;
  top: 58px;
  width: 32px;
  height: 13px;
  border-radius: 9999px;
  background: var(--dolphin-dark);
  transform-origin: center;
  animation: dolphin-flip 3s ease-in-out infinite;
}
.dolphin-flipper--l {
  left: 0;
}
.dolphin-flipper--r {
  right: 0;
  animation-delay: 0.5s;
}
@keyframes dolphin-flip {
  0%, 100% {
    transform: rotate(-8deg);
  }
  50% {
    transform: rotate(8deg);
  }
}
.dolphin-tail {
  position: absolute;
  left: 50%;
  bottom: -2px;
  width: 60px;
  height: 26px;
  transform: translateX(-50%);
  background: var(--dolphin-dark);
  clip-path: polygon(30% 0, 70% 0, 100% 100%, 50% 55%, 0 100%);
  z-index: 0;
}

/* Per-scene body motion, keyed off the scene class (kept subtle so the scene
   reads, not just wobbles). */
.dolphin--thinking .dolphin-body {
  animation: dolphin-scan 2.4s ease-in-out infinite;
}
.dolphin--checking .dolphin-body {
  transform-origin: bottom center;
  animation: dolphin-tilt 2.2s ease-in-out infinite;
}
.dolphin--building .dolphin-body {
  animation: dolphin-bounce 0.9s ease-in-out infinite;
}
.dolphin--responding .dolphin-flipper {
  animation-name: dolphin-cheer;
}
@keyframes dolphin-scan {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(2px);
  }
}
@keyframes dolphin-tilt {
  0%, 100% {
    transform: translateX(-50%) rotate(-3deg);
  }
  50% {
    transform: translateX(-50%) rotate(3deg);
  }
}
@keyframes dolphin-bounce {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}
@keyframes dolphin-cheer {
  0%, 100% {
    transform: rotate(-20deg);
  }
  50% {
    transform: rotate(20deg);
  }
}

.dolphin-hat {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 26px;
  line-height: 1;
  z-index: 3;
  animation: dolphin-bob 0.9s ease-in-out infinite;
}
@keyframes dolphin-bob {
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
  .dolphin-flipper,
  .dolphin-body,
  .dolphin-hat {
    animation: none;
  }
}
</style>
