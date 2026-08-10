<script setup lang="ts">
// Ollie the octopus: rounded body, six swaying tentacles, a hat while
// building. Shared by the busy builder (BuilderScene slots it in) and the
// cartoony delete sweeper. `scene` drives the per-phase motion, `hat` shows
// the hard hat.

defineProps<{
  scene?: string
  hat?: boolean
}>()
</script>

<template>
  <div class="octo" :class="scene ? `octo--${scene}` : ''">
    <span v-if="hat" class="octo-hat">🪖</span>
    <div class="octo-body">
      <div class="octo-face">
        <span class="octo-eye octo-eye--l" />
        <span class="octo-eye octo-eye--r" />
        <span class="octo-smile" />
      </div>
    </div>
    <span v-for="index in 6" :key="index" class="octo-arm" :class="`octo-arm--${index}`" />
  </div>
</template>

<style scoped>
.octo {
  position: relative;
  width: 140px;
  height: 150px;
  --octo-accent: color-mix(in srgb, var(--accent) 92%, var(--bg-panel));
  --octo-shade: color-mix(in srgb, var(--accent) 78%, var(--bg-elevated));
}
.octo-body {
  position: absolute;
  left: 50%;
  top: 6px;
  width: 104px;
  height: 92px;
  transform: translateX(-50%);
  border-radius: 48% 52% 46% 54% / 60% 60% 40% 40%;
  background: var(--octo-accent);
  box-shadow:
    0 6px 14px color-mix(in srgb, var(--accent) 30%, transparent),
    inset 0 3px 0 color-mix(in srgb, var(--bg-panel) 45%, transparent);
}
.octo-face {
  position: absolute;
  left: 50%;
  top: 34px;
  transform: translateX(-50%);
  width: 62px;
  height: 30px;
}
.octo-eye {
  position: absolute;
  top: 0;
  width: 12px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-panel);
}
.octo-eye--l {
  left: 6px;
}
.octo-eye--r {
  right: 6px;
}
.octo-smile {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 26px;
  height: 12px;
  transform: translateX(-50%);
  border-bottom: 3px solid var(--bg-panel);
  border-radius: 0 0 50% 50%;
}
.octo-arm {
  position: absolute;
  top: 88px;
  width: 15px;
  height: 46px;
  border-radius: 0 0 9999px 9999px;
  background: var(--octo-shade);
  transform-origin: top center;
  animation: octo-sway 2.8s ease-in-out infinite;
}
.octo-arm--1 { left: 6px; animation-delay: 0s; }
.octo-arm--2 { left: 26px; animation-delay: 0.15s; }
.octo-arm--3 { left: 46px; animation-delay: 0.3s; }
.octo-arm--4 { left: 66px; animation-delay: 0.45s; }
.octo-arm--5 { left: 86px; animation-delay: 0.6s; }
.octo-arm--6 { left: 106px; animation-delay: 0.75s; }
@keyframes octo-sway {
  0%, 100% {
    transform: rotate(-5deg);
  }
  50% {
    transform: rotate(5deg);
  }
}

/* Per-scene body motion, keyed off the scene class (kept subtle so the scene
   reads, not just wobbles). */
.octo--thinking .octo-body {
  animation: octo-tilt 2.4s ease-in-out infinite;
}
.octo--checking .octo-body {
  animation: octo-scan 2.2s ease-in-out infinite;
}
.octo--building .octo-body {
  animation: octo-floaty 0.9s ease-in-out infinite;
}
.octo--responding .octo-arm {
  animation-name: octo-cheer;
}
@keyframes octo-tilt {
  0%, 100% {
    transform: translateX(-50%) rotate(-3deg);
  }
  50% {
    transform: translateX(-50%) rotate(3deg);
  }
}
@keyframes octo-scan {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(2px);
  }
}
@keyframes octo-floaty {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}
@keyframes octo-cheer {
  0%, 100% {
    transform: rotate(-14deg);
  }
  50% {
    transform: rotate(14deg);
  }
}

.octo-hat {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 26px;
  line-height: 1;
  z-index: 3;
  animation: octo-bob 0.9s ease-in-out infinite;
}
@keyframes octo-bob {
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
  .octo-arm,
  .octo-body,
  .octo-hat {
    animation: none;
  }
}
</style>
