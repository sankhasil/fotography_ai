# OpenCode WebUI — Cartoony Theme Beautify: The Octopus Builder

**Version:** 1.0
**Target Agent:** opencode (or any capable coding agent)
**Framework:** Vue 3 + Vite + TypeScript
**Depends on:** Base app (prompts 01–27 from `task-prompt.md`), beautify phase
(prompts 28–34 from `advanced-prompt.md`), and the current busy-visual work:
`TaskProgress.vue`, `PlasmaOrb.vue`, `MatrixRain.vue`, `OutputPanel.vue`.

---

# Introduction

Every theme now has a personality while a run is in flight:

| Theme | Busy backdrop | Under it |
|---|---|---|
| Matrix | Matrix rain | Task progress pies |
| Jarvis | Tesla orb | Task progress pies |
| Casual | none | Task progress pies |
| **Cartoony** | **none (today)** | Task progress pies |

Cartoony is the only themed one with no figure. This document adds its own:
an **octopus builder** that *thinks*, *checks the blueprints*, *builds a tower*,
and *presents the finished result* — phase by phase, driven by the same
progress clock as the pies.

Like matrix/jarvis, the octopus is a **backdrop figure behind the pies** and is
shown only while `showBusyVisual` is true (busy and no streamed output yet).

## The Promise

> Matrix gets rain. Jarvis gets an orb. Cartoony gets an octopus with a hard
> hat and a tiny crane. It thinks with thought bubbles, checks a blueprint with
> a magnifying glass, stacks bricks into a tower while you watch, and bursts
> into confetti when the answer lands.

No new dependencies. Pure CSS + a handful of emoji props. The same rules as
the rest of the app: scoped styles, `prefers-reduced-motion` respected, and
the visual always yields the moment messages render.

---

# Global Rules (Apply to Every Prompt)

These mirror `advanced-prompt.md`, with one correction: **`@vueuse/motion` has
been removed from the project.** All animation is pure CSS (keyframes +
`<Transition>`). Do not re-add any animation library.

## Architecture

* Use Vue 3, Composition API, `<script setup lang="ts">`, TypeScript strict.
* Use Vite + Tailwind CSS v4.
* Use `@opencode-ai/sdk` for communication. Do not create a backend.
* **No new dependencies.** Pure CSS animation only.

## Editing

* Only modify files listed in the prompt.
* Do not refactor unrelated files. Do not rebuild existing components.
* Reuse existing patterns: scoped CSS components (see `DeleteSweeper.vue`),
  module-level composables (see `useSession.ts`, `useSessionProvenance.ts`),
  theme CSS variables (`--accent`, `--border`, `--bg-elevated`, `--muted`).
* If an SDK API is uncertain, leave a clearly marked TODO.
* Match existing naming conventions (kebab file names, `useX` composables,
  BEM-ish class names like `task-progress__pct`).

## Goal

Every prompt must leave the project: **buildable**, **runnable**, **easy to
review**. Run `npm run test`, `npm run typecheck`, `npm run lint` after each
step. Keep the diffs small.

---

# Design — Ollie the Octo-builder

## Character

A friendly cartoon octopus. Reads as "cartoony" via:

* **Body:** rounded head built with CSS (`border-radius: 50%` + a smiley face
  from pure CSS or emoji), colored from theme variables so it survives both
  cartoony tones (light `#fff4e0` and dark `#2b2430`).
* **Tentacles:** 6–8 curved arms built from CSS (borders/rounded caps), each
  with its own subtle idle sway. Arms carry the "tools" below.
* **Hard hat:** an emoji or CSS cap (🪖 / a half-circle div) worn in the
  building phase only.

## Phase scenes

The octopus has four scenes, one per `TaskProgress` stage. Phases are driven
by the shared progress clock (see Prompt 35). Each scene is a distinct,
recognizable pose + props:

| Stage | Octopus does | Props | Motion ideas |
|---|---|---|---|
| **thinking** | sits, ponders | 💭 rising thought bubbles, 💡 flickering bulb, chin tap | head tilt side to side, bubbles float up and pop, one tentacle taps the chin |
| **checking** | inspects the blueprints | 📋 blueprint held up, 🔍 magnifier sweeping | head bobs scanning left→right, magnifier glides over the paper, occasional "hmm" bubble |
| **assembling** (building) | construction worker | 🪖 hard hat, 🔨 hammer, 🧱 bricks, 🏗️ tiny crane, 💨 dust puffs | a tower of bricks **visibly stacks up** as progress climbs, crane swings a block into place, dust bursts on each drop |
| **responding** | presents the result | 🚩 flag on finished tower, 🎉 confetti | octopus raises both arms, tower fully built, confetti bursts, a "ta-da!" pops up |

## The tower (the "surprise")

The centerpiece is a **building that is actually built**. During the
*assembling* phase the tower grows block by block:

* The tower has ~8 stacked blocks.
* Block `n` appears when progress within the assembling phase reaches
  `n/8` — so the user literally watches the construction happen.
* Each block drops in with a spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`,
  matching the existing cartoony `pop-in`), plus a tiny 💨 dust puff.
* In the *responding* phase the finished tower stays up with a 🚩 on top.

## Grounding

A simple ground line / scaffold keeps the scene anchored in both light and
dark tones (use `--border` / `--muted` for it). The octopus and tower sit side
by side or the tower sits behind the octopus.

## Reduced motion

Under `prefers-reduced-motion: reduce`, collapse every animation to a static
pose: octopus still, thought bubbles hidden, tower fully built, no confetti.
(Follow the pattern already in `DeleteSweeper.vue` / `PlasmaOrb.vue`.)

---

# The Plan

1. **Prompt 35** — Extract the shared progress clock (`useTaskPct`) so pies and
   octopus animate from the same source of truth. Refactor `TaskProgress.vue`
   onto it. *Behavior unchanged; all existing tests stay green.*
2. **Prompt 36** — Build `OctopusBuilder.vue`: the character, the four scenes,
   the growing tower, scoped CSS, reduced-motion. Standalone and testable.
3. **Prompt 37** — Wire the octopus into `OutputPanel.vue` for the cartoony
   theme only, and add the `--progress-accent` cartoony hook.
4. **Prompt 38** — Tests (unit + Cypress) and final validation.

---

## Prompt 35 — Shared Progress Clock (`useTaskPct`)

### Goal

The pies and the octopus must animate from the **same** percentage so stages
stay in lockstep. Extract the timer logic currently inside `TaskProgress.vue`
into a module-level composable both components share.

### Tasks

Create `src/composables/useTaskPct.ts`:

* Module-level state (same pattern as `useSession.ts`):
  * `pct` ref — the asymptotic percentage: `Math.min(99, Math.round(50 * (1 - Math.exp(-elapsed / 6))))`.
  * A `start()` / `stop()` driven by `active`, backed by `requestAnimationFrame`,
    with `cancelAnimationFrame` on stop/unmount.
* Keep the stage model in one place — move `STAGES` (thinking / checking /
  assembling / responding) and `SHARE` here and export them.
* Derived helpers exported for consumers:
  * `overall` — the current `pct`.
  * `stageProgress(index)` — per-stage fill (existing formula).
  * `isComplete(index)` — whether a stage is past its share.
  * `currentStage` — the active stage index (0–3) derived from `pct`.
* Export a `resetTaskPct()` for tests (match `resetDirectoryTree` /
  `resetSessionProvenance` conventions).

Refactor `src/components/TaskProgress.vue`:

* Delete its local `pct`/`tick`/`startTimer` code and the local `STAGES`
  constant. Consume `useTaskPct` instead.
* Keep the exact same markup and class names — **no visual change**.
* When `active` toggles on, call `start()`; off, `stop()`.

### Notes

* The composable is a module singleton (one clock for the whole app). Two
  consumers (pies + octopus) both read it — never two clocks.
* Do not change the stage labels; Cypress specs match `.task-progress__pct`.

### Acceptance Criteria

* `TaskProgress.vue` renders identically to before (all existing tests pass).
* `useTaskPct` exposes `pct`, `currentStage`, `stageProgress`, `isComplete`,
  `STAGES`, `SHARE`, `resetTaskPct`.
* `npm run test`, `npm run typecheck`, `npm run lint` pass.

---

## Prompt 36 — Octopus Builder (`OctopusBuilder.vue`)

### Goal

The cartoony busy figure: a pure-CSS octopus with four phase scenes and a
tower that visibly gets built. Standalone component — not yet wired into the
app.

### Tasks

Create `src/components/OctopusBuilder.vue`:

* `<script setup lang="ts">`, no props needed — read `useTaskPct()` internally
  to get `pct` / `currentStage` / stage helpers.
* Scoped CSS (like `DeleteSweeper.vue`). No Tailwind needed for the figure;
  layout may use a couple of utility classes if convenient.
* Structure:
  * A scene container `.octo-builder` sized to fill the panel (absolute
    inset-0, centered).
  * The octopus: `.octo-body` + 6–8 `.octo-arm` elements, one `.octo-face`
    (eyes + smile).
  * The tower: a stack of ~8 `.octo-block` elements that appear in order
    during the *assembling* stage, gated by `stageProgress` within that stage.
  * Phase props (emoji spans) shown per scene: 💭/💡 (thinking),
    📋/🔍 (checking), 🪖/🔨/🏗️/💨 (assembling), 🚩/🎉 (responding).
* Phase logic:
  * `currentStage === 0` → thinking scene.
  * `currentStage === 1` → checking scene.
  * `currentStage === 2` → assembling scene; render blocks whose
    index / 8 <= progress within the stage.
  * `currentStage === 3` → responding scene; tower fully built.
* Every animated element gets a class + keyframes; add a `reduced-motion`
  media query that collapses everything to a static pose.

### Notes

* Use theme variables for colors (`.octo-body` in `--accent` or a friendly
  mix; ground/scaffold in `--border`; face in `--bg-panel`). It must read well
  on both cartoony tones without hardcoding hex.
* Prefer a few chunky shapes over many divs. Cartoony = bold outlines, spring
  easing, soft shadows.
* Keep class names namespaced with `octo-` to avoid colliding with Tailwind.

### Acceptance Criteria

* Mounting it with `useTaskPct` started shows the thinking scene; advancing
  `pct` through 25/50/75 swaps scenes (verify via stage-based classes like
  `.octo-stage--building`).
* The tower builds block-by-block during assembling and stays up in responding.
* It renders on both cartoony tones and under `prefers-reduced-motion`.
* `npm run typecheck`, `npm run lint` pass.

---

## Prompt 37 — Wire the Octopus into the Cartoony Theme

### Goal

Make cartoony show the octopus behind the pies while a run is in flight —
mirroring how matrix shows rain and jarvis shows the orb.

### Tasks

Edit `src/components/layout/OutputPanel.vue`:

* Import `OctopusBuilder.vue`.
* Add `const isCartoony = computed(() => theme.value === 'cartoony')`.
* In the busy-visual block (line ~84–92), after the matrix/jarvis branches,
  render the octopus as the backdrop for cartoony:
  ```html
  <MatrixRain v-if="isMatrix" class="absolute inset-0" mode="panel" />
  <PlasmaOrb v-else-if="isJarvis" class="absolute inset-0 m-auto h-40 w-40" />
  <OctopusBuilder v-else-if="isCartoony" class="absolute inset-0" />
  <TaskProgress :active="busy" class="relative z-10" />
  ```
* Nothing else changes: the `showBusyVisual` gating, the crossfade, and the
  yield-to-messages behavior are shared and already correct.

Edit `src/style.css`:

* Add a cartoony progress-accent hook so the pies harmonize with the figure.
  Default `--progress-accent` already falls back to `--accent`; override it for
  a warmer orange if it improves contrast on the light tone, e.g.:
  ```css
  html[data-theme='cartoony'] {
    --progress-accent: #ff8a3d;
  }
  ```
  (Confirm it reads on both tones before keeping it.)

### Notes

* The octopus must never cover the pies — pies stay at `z-10` above it.
* The octopus must vanish the moment a message renders (handled by
  `showBusyVisual`; verify manually).

### Acceptance Criteria

* In cartoony theme, sending a prompt shows the octopus + pies; a second prompt
  in the same session shows it again until the new reply renders.
* Switching to casual/matrix/jarvis still shows their own visuals; cartoony
  figure never appears outside cartoony.
* No regression to matrix/jarvis busy visuals.
* `npm run test`, `npm run typecheck`, `npm run lint` pass.

---

## Prompt 38 — Tests & Final Validation

### Goal

Cover the new clock and the octopus, then validate the whole feature.

### Tasks

Unit tests (`tests/`):

* `tests/useTaskPct.test.ts`:
  * `pct` climbs and never exceeds 99 while running; stops when inactive.
  * `currentStage` advances at 25 / 50 / 75.
  * `isComplete` / `stageProgress` behave at boundaries.
  * Use `vi.useFakeTimers()` (or mock `requestAnimationFrame`) — follow the
    existing Vitest conventions; reset modules per test.
* `tests/OctopusBuilder.test.ts` (light):
  * Renders the thinking scene initially, and the building scene when
    `currentStage === 2` with blocks appearing as progress grows.
  * Uses `@vue/test-utils` + jsdom, no live server.

Cypress e2e (`cypress/e2e/cartoony-builder.cy.ts`):

* Mirror `prompt33.cy.ts` / `jarvis-orb.cy.ts`:
  * Select the cartoony theme.
  * Send a prompt; assert `.octo-builder` (or `.octo-*`) and
    `.task-progress__pct` exist, and the octopus disappears once an
    `article` renders.
  * Second prompt in the same session: octopus + pies reappear, then yield to
    the new message.

Polish:

* Confirm reduced-motion static pose; confirm both cartoony tones.
* Ensure no dead CSS / unused classes remain.

### Acceptance Criteria

* `npm run test` passes.
* `npm run build` passes with no TypeScript errors.
* `npm run lint` passes.
* Cypress `cartoony-builder.cy.ts` passes against a live console.
* No new dependencies; app remains browser-only.

---

# Final Validation Checklist

- [ ] Cartoony busy visual shows an octopus figure + task pies while a run is
      in flight, in both light and dark tones
- [ ] Octopus shows distinct phases: thinks (thinking), checks blueprints
      (checking), builds the tower (assembling), presents the result
      (responding)
- [ ] The tower visibly stacks block-by-block during the building phase
- [ ] Octopus and pies advance in lockstep (one shared clock)
- [ ] The visual yields smoothly the moment streamed messages render
- [ ] Second prompt in the same session brings the octopus back
- [ ] Matrix/jarvis/casual visuals unchanged
- [ ] Reduced-motion collapses the octopus to a static pose
- [ ] No new dependencies added
- [ ] `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` pass
- [ ] Cypress `cartoony-builder.cy.ts` passes
