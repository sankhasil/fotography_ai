<script setup lang="ts">
// Pickle Rick (from the Rick and Morty episode of the same name): a bumpy
// green pickle wearing Rick's lab coat. The character shown when Big Pickle is
// the session model, in the cartoony theme only. Shared by the busy builder
// (BuilderScene slots it in) and the cartoony delete sweeper. `scene` drives
// the per-phase motion, `hat` shows the hard hat.
//
// By default the face is drawn onto the pickle itself (brows, glasses, grin).
// With `head="image"` — used by the busy builder only — that CSS face is
// replaced by the Pickle Rick Generator head artwork (SVG) sitting on top of
// the pickle body, with the speech bubble attached above it. The sweeper keeps
// the default body face.

defineProps<{
  scene?: string
  hat?: boolean
  head?: 'css' | 'image'
}>()
</script>

<template>
  <div
    class="pickle-rick"
    :class="[scene ? `pickle-rick--${scene}` : '', head === 'image' ? 'pickle-rick--head' : '']"
  >
    <span v-if="hat" class="pickle-hat">🪖</span>
    <span v-if="head === 'image'" class="pickle-upper">
      <span class="pickle-bubble" />
      <span class="pickle-head" />
    </span>
    <span class="pickle-arm pickle-arm--l">
      <span class="pickle-hand" />
    </span>
    <span class="pickle-arm pickle-arm--r">
      <span class="pickle-hand" />
    </span>
    <span class="pickle-leg pickle-leg--l" />
    <span class="pickle-leg pickle-leg--r" />
    <div class="pickle-body">
      <div v-if="head !== 'image'" class="pickle-face">
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
  --pickle-head: color-mix(in srgb, var(--text) 90%, var(--bg-panel));
  --pickle-bubble: color-mix(in srgb, var(--bg-elevated) 92%, var(--accent));
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

/* Image-head mode: the Pickle Rick Generator head artwork replaces the CSS
   face. The head sits on the pickle's shoulders (its bottom overlaps the body
   top by a few px so the neck seam is hidden), and the speech bubble is
   attached above the head. `scene` drives the head + bubble per phase. */
.pickle-rick--head .pickle-upper {
  position: absolute;
  left: 50%;
  bottom: 140px;
  width: 76px;
  height: 92px;
  transform: translateX(-50%);
  transform-origin: 50% 100%;
  z-index: 2;
}
/* ponytail: the artwork is a single-color silhouette, so it is applied as a
   mask and painted with a theme-mixed color to keep contrast on both tones.
   The body face is dropped in this mode because two faces would read as a bug. */
.pickle-head {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--pickle-head);
  -webkit-mask: url('@/assets/pickle-rick-face.svg') center / contain no-repeat;
  mask: url('@/assets/pickle-rick-face.svg') center / contain no-repeat;
}
.pickle-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 12px);
  width: 52px;
  height: 26px;
  transform: translateX(-50%);
  border-radius: 9999px;
  background: var(--pickle-bubble);
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--bg-panel) 35%, transparent);
  animation: pickle-bubble-drift 2.8s ease-in-out infinite;
}
.pickle-bubble::after {
  content: '';
  position: absolute;
  bottom: -9px;
  left: 62%;
  border: 9px solid transparent;
  border-bottom: 0;
  border-left: 0;
  border-top-color: var(--pickle-bubble);
}
.pickle-rick--thinking.pickle-rick--head .pickle-upper {
  animation: pickle-head-tilt 2.4s ease-in-out infinite;
}
.pickle-rick--checking.pickle-rick--head .pickle-upper {
  animation: pickle-head-scan 2.2s ease-in-out infinite;
}
.pickle-rick--building.pickle-rick--head .pickle-upper {
  animation: pickle-head-bob 0.9s ease-in-out infinite;
}
/* Building: no talk bubble — the hard hat takes its place above the head. */
.pickle-rick--building.pickle-rick--head .pickle-bubble {
  display: none;
}
.pickle-rick--responding.pickle-rick--head .pickle-upper {
  animation: pickle-head-cheer 0.5s ease-in-out infinite;
}
.pickle-rick--responding.pickle-rick--head .pickle-bubble {
  animation: pickle-bubble-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pickle-head-tilt {
  0%, 100% {
    transform: translateX(-50%) rotate(-4deg);
  }
  50% {
    transform: translateX(-50%) rotate(4deg);
  }
}
@keyframes pickle-head-scan {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(2px) rotate(-2deg);
  }
}
@keyframes pickle-head-bob {
  0%, 100% {
    transform: translateX(-50%) translateY(0) rotate(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px) rotate(2deg);
  }
}
@keyframes pickle-head-cheer {
  0%, 100% {
    transform: translateX(-50%) translateY(0) rotate(0);
  }
  50% {
    transform: translateX(-50%) translateY(-6px) rotate(-5deg);
  }
}
@keyframes pickle-bubble-drift {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}
@keyframes pickle-bubble-pop {
  0% {
    transform: translateX(-50%) scale(0);
    opacity: 0;
  }
  70% {
    transform: translateX(-50%) scale(1.15);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}
/* The hard hat moves up to the head image; its own bob animation already
   preserves the translateX centering. */
.pickle-rick--head .pickle-hat {
  top: -98px;
  font-size: 18px;
}

/* Reduced motion: static figure pose. Matches the DeleteSweeper / PlasmaOrb
   convention. */
@media (prefers-reduced-motion: reduce) {
  .pickle-arm,
  .pickle-body,
  .pickle-hat,
  .pickle-upper,
  .pickle-bubble {
    animation: none;
  }
}
</style>
