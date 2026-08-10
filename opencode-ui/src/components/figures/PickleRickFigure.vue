<script setup lang="ts">
// Pickle Rick (from the Rick and Morty episode of the same name): a bumpy
// green pickle wearing Rick's lab coat, with his angry brows, round glasses
// and wide open-mouth grin. The character shown when Big Pickle is the
// session model, in the cartoony theme only. Shared by the busy builder
// (BuilderScene slots it in) and the cartoony delete sweeper. `scene` drives
// the per-phase motion, `hat` shows the hard hat.

defineProps<{
  scene?: string
  hat?: boolean
}>()
</script>

<template>
  <div class="pickle-rick" :class="scene ? `pickle-rick--${scene}` : ''">
    <span v-if="hat" class="pickle-hat">🪖</span>
    <span class="pickle-arm pickle-arm--l">
      <span class="pickle-hand" />
    </span>
    <span class="pickle-arm pickle-arm--r">
      <span class="pickle-hand" />
    </span>
    <span class="pickle-leg pickle-leg--l" />
    <span class="pickle-leg pickle-leg--r" />
    <div class="pickle-body">
      <div class="pickle-face">
        <span class="pickle-brow pickle-brow--l" />
        <span class="pickle-brow pickle-brow--r" />
        <span class="pickle-glass pickle-glass--l"><span class="pickle-pupil" /></span>
        <span class="pickle-glass pickle-glass--r"><span class="pickle-pupil" /></span>
        <span class="pickle-grin" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pickle-rick {
  position: relative;
  width: 140px;
  height: 150px;
  /* Greens + lab-coat whites, all mixed against the panel color so the figure
     keeps contrast in both light and dark themes. */
  --pickle: color-mix(in srgb, #7fb257 90%, var(--bg-panel));
  --pickle-dark: color-mix(in srgb, #5a8a3e 85%, var(--bg-panel));
  --pickle-deep: color-mix(in srgb, #3f6b2a 80%, var(--bg-panel));
  --coat: color-mix(in srgb, var(--bg-panel) 92%, var(--text));
  --coat-shade: color-mix(in srgb, var(--bg-elevated) 80%, var(--text));
}
.pickle-body {
  position: absolute;
  left: 50%;
  top: 6px;
  width: 84px;
  height: 122px;
  transform: translateX(-50%);
  border-radius: 50% 50% 46% 46% / 44% 44% 56% 56%;
  background: var(--pickle);
  box-shadow:
    0 6px 14px color-mix(in srgb, var(--text) 20%, transparent),
    inset 0 3px 0 color-mix(in srgb, var(--bg-panel) 40%, transparent);
}
/* Bumpy pickle texture: a few darker speckles. */
.pickle-body::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: inherit;
  background:
    radial-gradient(circle at 30% 28%, var(--pickle-dark) 0 2.5px, transparent 3.5px),
    radial-gradient(circle at 68% 45%, var(--pickle-dark) 0 2px, transparent 3px),
    radial-gradient(circle at 40% 62%, var(--pickle-dark) 0 2.5px, transparent 3.5px),
    radial-gradient(circle at 60% 78%, var(--pickle-dark) 0 2px, transparent 3px),
    radial-gradient(circle at 24% 84%, var(--pickle-dark) 0 2px, transparent 3px),
    radial-gradient(circle at 74% 20%, var(--pickle-dark) 0 2px, transparent 3px);
  opacity: 0.5;
}
.pickle-face {
  position: absolute;
  left: 50%;
  top: 24px;
  transform: translateX(-50%);
  width: 76px;
  height: 56px;
  z-index: 2;
}
/* Rick's thick, inward-slanting eyebrows. */
.pickle-brow {
  position: absolute;
  top: 0;
  width: 26px;
  height: 7px;
  border-radius: 9999px;
  background: var(--pickle-deep);
}
.pickle-brow--l {
  left: 0;
  transform: rotate(-16deg);
}
.pickle-brow--r {
  right: 0;
  transform: rotate(16deg);
}
/* Round, dark-rimmed glasses with small centred pupils. */
.pickle-glass {
  position: absolute;
  top: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-panel) 75%, transparent);
  border: 3px solid var(--pickle-deep);
}
.pickle-glass--l {
  left: 2px;
}
.pickle-glass--r {
  right: 2px;
}
.pickle-pupil {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 9px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--pickle-deep);
}
/* Rick's wide open grin: dark mouth, a full row of teeth, and a tongue. */
.pickle-grin {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 46px;
  height: 24px;
  transform: translateX(-50%);
  background: var(--pickle-deep);
  border-radius: 0 0 9999px 9999px;
  overflow: hidden;
}
.pickle-grin::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 9px;
  background: color-mix(in srgb, var(--bg-panel) 95%, var(--text));
}
.pickle-grin::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 14px;
  height: 9px;
  transform: translateX(-50%);
  background: color-mix(in srgb, #e8846b 85%, var(--bg-panel));
  border-radius: 9999px 9999px 0 0;
}
/* Lab-coat sleeves with pickle hands poking out. */
.pickle-arm {
  position: absolute;
  top: 74px;
  width: 36px;
  height: 16px;
  background: var(--coat);
  border: 2px solid var(--coat-shade);
  border-radius: 9999px;
  transform-origin: center;
  animation: pickle-sway 2.8s ease-in-out infinite;
}
.pickle-arm--l {
  left: -6px;
}
.pickle-arm--r {
  right: -6px;
  animation-delay: 0.4s;
}
.pickle-hand {
  position: absolute;
  top: 50%;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--pickle);
  border: 2px solid var(--pickle-dark);
  transform: translateY(-50%);
}
.pickle-arm--l .pickle-hand {
  right: -9px;
}
.pickle-arm--r .pickle-hand {
  left: -9px;
}
@keyframes pickle-sway {
  0%, 100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(6deg);
  }
}
.pickle-leg {
  position: absolute;
  bottom: 2px;
  width: 12px;
  height: 14px;
  border-radius: 4px 4px 50% 50%;
  background: var(--pickle-dark);
}
.pickle-leg--l {
  left: 34px;
  transform: rotate(-6deg);
}
.pickle-leg--r {
  right: 34px;
  transform: rotate(6deg);
}

/* Per-scene body motion, keyed off the scene class (kept subtle so the scene
   reads, not just wobbles). */
.pickle-rick--thinking .pickle-body {
  transform-origin: bottom center;
  animation: pickle-tilt 2.4s ease-in-out infinite;
}
.pickle-rick--checking .pickle-body {
  animation: pickle-scan 2.2s ease-in-out infinite;
}
.pickle-rick--building .pickle-body {
  animation: pickle-bounce 0.9s ease-in-out infinite;
}
.pickle-rick--responding .pickle-arm {
  animation-name: pickle-cheer;
}
@keyframes pickle-tilt {
  0%, 100% {
    transform: translateX(-50%) rotate(-3deg);
  }
  50% {
    transform: translateX(-50%) rotate(3deg);
  }
}
@keyframes pickle-scan {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(2px);
  }
}
@keyframes pickle-bounce {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}
@keyframes pickle-cheer {
  0%, 100% {
    transform: rotate(-20deg);
  }
  50% {
    transform: rotate(20deg);
  }
}

.pickle-hat {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 26px;
  line-height: 1;
  z-index: 3;
  animation: pickle-bob 0.9s ease-in-out infinite;
}
@keyframes pickle-bob {
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
  .pickle-arm,
  .pickle-body,
  .pickle-hat {
    animation: none;
  }
}
</style>
