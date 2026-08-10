<script setup lang="ts">
// Penny the penguin: egg body, white belly, orange beak + feet, and two
// flippers that sway (and cheer in the responding scene). Shared by the busy
// builder (BuilderScene slots it in) and the cartoony delete sweeper. `scene`
// drives the per-phase motion, `hat` shows the hard hat.

defineProps<{
  scene?: string
  hat?: boolean
}>()
</script>

<template>
  <div class="penguin" :class="scene ? `penguin--${scene}` : ''">
    <span v-if="hat" class="penguin-hat">🪖</span>
    <span class="penguin-flipper penguin-flipper--l" />
    <div class="penguin-body">
      <div class="penguin-face">
        <span class="penguin-eye penguin-eye--l"><span class="penguin-pupil" /></span>
        <span class="penguin-eye penguin-eye--r"><span class="penguin-pupil" /></span>
        <span class="penguin-beak" />
        <span class="penguin-smile" />
      </div>
      <div class="penguin-belly" />
    </div>
    <span class="penguin-flipper penguin-flipper--r" />
    <span class="penguin-feet">
      <span class="penguin-foot penguin-foot--l" />
      <span class="penguin-foot penguin-foot--r" />
    </span>
  </div>
</template>

<style scoped>
.penguin {
  position: relative;
  width: 150px;
  height: 160px;
  /* Body/belly pair always contrast against each other on any theme tone;
     beak + feet borrow the accent (cartoony = #ff8a3d). */
  --penguin-dark: color-mix(in srgb, var(--text) 82%, var(--bg-panel));
  --penguin-belly: color-mix(in srgb, var(--bg-panel) 86%, var(--text));
  --penguin-feet: color-mix(in srgb, var(--accent) 88%, var(--bg-panel));
}
.penguin-body {
  position: absolute;
  left: 50%;
  top: 14px;
  width: 96px;
  height: 124px;
  transform: translateX(-50%);
  border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%;
  background: var(--penguin-dark);
  box-shadow:
    0 6px 14px color-mix(in srgb, var(--text) 20%, transparent),
    inset 0 3px 0 color-mix(in srgb, var(--bg-panel) 30%, transparent);
  z-index: 1;
}
.penguin-belly {
  position: absolute;
  left: 50%;
  bottom: 10px;
  width: 58px;
  height: 52px;
  transform: translateX(-50%);
  border-radius: 9999px 9999px 60% 60% / 80% 80% 40% 40%;
  background: var(--penguin-belly);
}
.penguin-face {
  position: absolute;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  width: 72px;
  height: 44px;
  z-index: 2;
}
.penguin-eye {
  position: absolute;
  top: 0;
  width: 24px;
  height: 30px;
  border-radius: 50%;
  background: var(--penguin-belly);
}
.penguin-eye--l {
  left: 0;
}
.penguin-eye--r {
  right: 0;
}
.penguin-pupil {
  position: absolute;
  left: 50%;
  bottom: 7px;
  width: 9px;
  height: 11px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--penguin-dark);
}
.penguin-beak {
  position: absolute;
  left: 50%;
  top: 22px;
  width: 20px;
  height: 13px;
  transform: translateX(-50%);
  border-radius: 3px 3px 10px 10px;
  background: var(--penguin-feet);
}
.penguin-smile {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 16px;
  height: 7px;
  transform: translateX(-50%);
  border-bottom: 2px solid var(--penguin-dark);
  border-radius: 0 0 50% 50%;
  opacity: 0.8;
}
.penguin-flipper {
  position: absolute;
  top: 40px;
  width: 20px;
  height: 46px;
  border-radius: 9999px;
  background: var(--penguin-dark);
  transform-origin: top center;
  animation: penguin-sway 2.8s ease-in-out infinite;
}
.penguin-flipper--l {
  left: 18px;
  z-index: 0;
}
.penguin-flipper--r {
  right: 18px;
  z-index: 0;
  animation-delay: 0.4s;
}
@keyframes penguin-sway {
  0%, 100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(6deg);
  }
}
.penguin-feet {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 60px;
  height: 12px;
  z-index: 0;
}
.penguin-foot {
  position: absolute;
  top: 0;
  width: 22px;
  height: 10px;
  border-radius: 50%;
  background: var(--penguin-feet);
}
.penguin-foot--l {
  left: 4px;
}
.penguin-foot--r {
  right: 4px;
}

/* Per-scene body motion, keyed off the scene class (kept subtle so the scene
   reads, not just wobbles). */
.penguin--thinking .penguin-body {
  transform-origin: bottom center;
  animation: penguin-tilt 2.4s ease-in-out infinite;
}
.penguin--checking .penguin-body {
  animation: penguin-scan 2.2s ease-in-out infinite;
}
.penguin--building .penguin-body {
  animation: penguin-bounce 0.9s ease-in-out infinite;
}
.penguin--responding .penguin-flipper {
  animation-name: penguin-cheer;
}
@keyframes penguin-tilt {
  0%, 100% {
    transform: translateX(-50%) rotate(-3deg);
  }
  50% {
    transform: translateX(-50%) rotate(3deg);
  }
}
@keyframes penguin-scan {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(2px);
  }
}
@keyframes penguin-bounce {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}
@keyframes penguin-cheer {
  0%, 100% {
    transform: rotate(-16deg);
  }
  50% {
    transform: rotate(16deg);
  }
}

.penguin-hat {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 26px;
  line-height: 1;
  z-index: 3;
  animation: penguin-bob 0.9s ease-in-out infinite;
}
@keyframes penguin-bob {
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
  .penguin-flipper,
  .penguin-body,
  .penguin-hat {
    animation: none;
  }
}
</style>
