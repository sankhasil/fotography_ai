# OpenCode WebUI — Advanced Build Prompts (Beautify)

**Version:** 1.0
**Target Model:** Qwen2.5-Coder 14B (Ollama)
**Framework:** Vue 3 + Vite + TypeScript
**Depends on:** All 27 prompts from `task-prompt.md` being complete and runnable.

---

# Introduction

This document contains **7 incremental prompts** that beautify the OpenCode
WebUI with personality, playful session aliases, a smarter folder picker, a
safe working-directory change flow, a full-screen garbage-collection
animation, and Matrix rain woven into the output progress and header.

Each prompt is intentionally small so that Qwen2.5-Coder 14B can complete it
reliably. After every prompt:

1. Review the generated code.
2. Run the application.
3. Verify the acceptance criteria.
4. Fix issues if necessary.
5. Continue to the next prompt.

The project must remain **buildable and runnable after every step**.

---

# Global Rules (Apply to Every Prompt)

These rules are identical to `task-prompt.md`. Follow them always.

## Architecture

* Use Vue 3.
* Use Composition API.
* Use `<script setup lang="ts">`.
* Use TypeScript strict mode.
* Use Vite.
* Use Tailwind CSS v4.
* Use `@vueuse/motion`.
* Use `@opencode-ai/sdk`.
* Do not create a backend.
* Do not reimplement the OpenCode protocol.
* Use the SDK for all communication.

## Package Management

* Do **not** execute shell commands.
* Do **not** run npm install.
* Do not add new dependencies unless a prompt explicitly requires it.
* The base project already has `@opencode-ai/sdk`, `@vueuse/motion`,
  Tailwind v4, Vitest, and Cypress installed. Do not reinstall them.

## Code Style

* Keep components reasonably small.
* Use reusable components.
* Avoid duplicated logic.
* Follow Vue best practices.
* Use descriptive names.

## Editing Rules

* Only modify files listed in the prompt.
* Do not refactor unrelated files.
* Do not rename existing folders or files without reason.
* The base app already exists in `src/`. Extend and reuse it — do not rebuild.
* If an SDK API is uncertain, leave a clearly marked TODO instead of
  inventing an API.

## Goal

Every prompt must leave the project:

* Buildable
* Runnable
* Easy to review

---

# Animation Library Research

The beauty features require these animation capabilities:

* Word-by-word token reveal
* Per-theme progress widget states (pending → running → success/error)
* Theme crossfade without reload
* Full-screen "garbage collection" sweep (a sweeper wiping the screen)
* List enter/leave motion (session history rows)

## Candidates

| Library | Approach | Bundle | Springs | Timelines | Vue 3 | License | Verdict for us |
|---|---|---|---|---|---|---|---|
| `@vueuse/motion` | Declarative `v-motion` + variants | <25kb | Yes | Limited | First-class | MIT | **Already installed. Covers springs + enters/leaves.** |
| Motion (`motion` / `motion/vue`) | Declarative, layout animations | ~18kb core + ~15kb Vue | Yes | No | First-class | MIT | Strong, but a new dependency |
| GSAP | Imperative timelines | ~25kb core | Plugin | Yes (powerful) | Via wrapper | Free (Webflow-owned) | Best-in-class timelines, overkill here |
| AutoAnimate | Zero-config DOM transitions | ~2kb | No | No | Yes | MIT | Nice for lists, but Vue `<Transition>` already does this |
| CSS + Web Animations API | Native | 0kb | `linear()` easing only | Manual | Any | N/A | Covers simple sweeps with no library |

## Decision

**Use only what is already installed: `@vueuse/motion` + CSS transitions.**

* The per-theme GC sweep is a full-screen div translating `-100% → 0` with a
  gradient "broom" edge — trivially done in CSS per theme, no timeline library
  needed.
* Token reveals, progress widgets, and theme crossfades are already
  `@vueuse/motion` / CSS territory.
* GSAP is deliberately **not** added: it would be a new dependency for one
  animation that CSS already solves.

> ponytail: CSS sweep reused across all four themes via CSS vars.
> Swap to GSAP only if a future feature needs scrubable, timeline-synced motion.

---

# Phase 8 — Beautify

## Prompt 28 — Session Alias System

### Goal

Replace raw UUIDs in the UI with funny, deterministic emoji aliases.

### Tasks

Create a composable `useSessionAlias.ts` that:

* Hashes a session ID (small stable hash, e.g. FNV-1a) and maps it to
  `{emoji} {Adjective} {Noun}`.
* Uses curated lists (~50 emoji, ~150 adjectives, ~120 nouns).
* Is deterministic — the same session ID always yields the same alias.
* Exports a `aliases(sessions)` helper that returns a
  `Map<sessionID, string>`.

Wire it into the UI:

* `src/components/layout/AppHeader.vue` — show the active session alias
  instead of the raw ID.
* The session selector list — show the alias for each session.
* Store the real UUID in an HTML attribute (e.g. `data-session-id`) on the
  alias element.
* On hover, show the real UUID in a native tooltip (`title` attribute or a
  small hover popover).

### Notes

* Alias is client-side only. Never write it to the server.
* Sessions created in the terminal get an alias too — it is derived from the
  ID, not stored.
* Collisions are astronomically rare with 900k combos; accept them silently.

### Acceptance Criteria

* Session selector and header show `{emoji} {Adjective} {Noun}`, never a UUID.
* Hovering an alias shows the real session ID.
* Same session ID always renders the same alias across reloads.
* Project builds and type-checks.

---

## Prompt 29 — Session Management UX

### Goal

Let the user refresh the session list and delete individual sessions.

### Tasks

* **Refresh button** in `AppHeader.vue`:
  * Re-fetches the session list via `client.session.list()`.
  * Re-derives aliases for the new list.
  * Shows a short spinner while loading; silently keeps old data on failure.
* **Trash icon** per session row in the session selector:
  * Clicking it opens a mini-confirm (the delete is irreversible
    server-side).
  * On confirm, call `client.session.delete({ path: { id } })`.
  * Remove the row with a fade-out transition (`<Transition>`).
  * If the deleted session is active, clear it and show the empty state.
  * Manual delete does **not** play the GC sweeper animation.

### Acceptance Criteria

* Refresh updates the list without a page reload.
* Deleting a session removes it from the list with a fade-out and confirms
  before deleting.
* Deleting the active session leaves the app in a clean empty state.
* Project builds and type-checks.

---

## Prompt 30 — Startup Folder Picker v2

### Goal

Replace the free-browse folder dialog with a two-group picker shown at startup.

### Tasks

Extend `src/components/DirectoryBrowser.vue` (or add a new
`FolderPicker.vue`) with two groups:

**Group 1 — OpenCode projects** (default):

* Fetch via `client.project.list()`.
* Each project is a **fixed leaf**: click to select it, but there is **no
  parent navigation** and no browsing inside it.
* Default selected path is the OpenCode project directory.

**Group 2 — Local favorites**:

* Stored in `localStorage` (key `opencode-ui:favorites`).
* User can add the current path as a favorite.
* Parent navigation is allowed, but the browser must **never go above
  `$HOME`** — the "↑" button is hidden when at home, and attempts to enter
  `/Users` or `/` are blocked.
* Respect `$HOME` on both macOS (`/Users/<name>`) and Linux (`/home/<name>`).
  Resolve it from the SDK `path.get()` result or an env-derived default —
  leave a TODO if uncertain.

Also support:

* A **custom path** text input for arbitrary directories.
* Persist the last selection via `useWorkingDirectory` (already exists).

Show the picker as a **startup modal** on first launch and keep it reachable
via a header button.

### Acceptance Criteria

* On load, the picker shows projects (default selected) and favorites.
* Project paths cannot be navigated above or into.
* Favorites can browse up but never above `$HOME`.
* A custom path can be selected and persists.
* Project builds and type-checks.

---

## Prompt 31 — Working-Directory Change Flow

### Goal

Handle working-directory changes safely with a New session / Override choice.

### Tasks

When the user selects a different working directory than the current one,
show a dialog:

* **New session** — keep the current session in history, create a fresh
  session at the new directory via `client.session.create()`, switch to it.
* **Override** — warning: *"This will delete the current session and its
  history."* Two-step confirm:
  * `client.session.delete({ path: { id: currentId } })`
  * `client.session.create({ ...newDir })`
  * Switch to the new session and trigger the GC sweeper (Prompt 32).
* **Cancel** — do nothing.

Logic belongs in `src/composables/useSession.ts` (or the session store);
the dialog is a small reusable component. Reuse existing UI primitives.

### Acceptance Criteria

* Changing the directory always prompts; nothing is lost silently.
* New session preserves history; Override truly deletes it server-side.
* Dialog is keyboard-accessible (Tab, Enter, Escape).
* Project builds and type-checks.

---

## Prompt 32 — GC Sweeper Animation

### Goal

A full-screen, per-theme "garbage collection" wipe that clears the app after
an Override.

### Tasks

Create `GcSweeper.vue`:

* A full-screen overlay covering the message list, tool cards, input panel,
  and status bar.
* A sweeper edge (gradient "broom" bar) translates across the screen,
  `-100% → 100%`, wiping the content out.
* Duration ~600–900ms, plays once, non-blocking.
* Content beneath fades/scales away as the sweep passes.

Per-theme styling via CSS variables on `[data-theme]` (match `useTheme`):

* **Casual** — soft gradient sweep, smooth ease.
* **Cartoony** — bright rainbow sweep, bouncy spring on the bar.
* **Jarvis** — holographic scanline bar, gold edge, slight glow.
* **Matrix** — phosphor-green sweep with trailing character flicker
  (reuse the existing `MatrixRain` canvas approach).

Use `@vueuse/motion` for the bar motion and CSS transitions for the rest.
No new dependency.

Only trigger it from the Override flow (Prompt 31), not manual deletes.

### Acceptance Criteria

* Override plays the sweep, then lands on a clean new-session state.
* Each theme renders a distinct sweep without reload.
* The sweep is skippable if the user clicks or presses Escape.
* Project builds and type-checks.

---

## Prompt 33 — Matrix Rain as Progress & Header

### Goal

Turn the Matrix rain into the output panel's loading animation and surface it
in the header. Matrix theme only.

### Tasks

**Output panel progress:**

* While the app is waiting/processing (sending, streaming, busy — the same
  condition that drives the current `UiProgress` bar), the **entire output
  panel** shows Matrix rain as the progress animation. It replaces the thin
  striped `UiProgress` bar in Matrix theme.
* Stop condition: as soon as streamed messages start rendering, the rain
  stops and the panel transitions smoothly to the conversation.
* Add a good transition between the rain state and the message list (rain
  fades/scales away, messages fade in) via `@vueuse/motion` or CSS
  `<Transition>`.
* Non-Matrix themes keep the existing striped `UiProgress` bar unchanged.

**Header (menubar):**

* Rain renders **both** as a low-opacity background behind the header
  controls (clipped to header bounds) **and** as a slim rain band in the
  header (e.g. 24px).
* Header controls stay readable and sit above the rain (z-index).

**Notes:**

* Refactor the existing `MatrixRain.vue` canvas logic into a reusable
  component that accepts a `mode` (`"background"` | `"panel"` | `"strip"`)
  and an opacity — keep it Matrix-only.
* The panel rain must never obscure new messages — it stops the moment
  content renders.
* Respect the reduced-motion preference already used elsewhere in the app.

### Acceptance Criteria

* In Matrix theme, waiting/processing shows rain across the full output
  panel; it stops when messages appear.
* The header shows rain as background plus a slim band.
* Rain ↔ messages transition is smooth, in both directions.
* Switching themes starts/stops rain appropriately without reload.
* Project builds and type-checks.

---

## Prompt 34 — Polish & Tests

### Goal

Review the beauty features end-to-end and add tests.

### Tasks

Review and fix:

* Keyboard navigation and focus management in the new dialogs
  (folder picker, New session / Override, delete confirm).
* Empty states for the session selector and output panel.
* Error handling and loading states for refresh, delete, and create.
* Verify all four themes still switch without reload.
* Verify components remain reusable; remove dead code.
* Add TODO comments where SDK APIs need confirmation.

Add Vitest tests (mock `@opencode-ai/sdk`, no live server):

* `useSessionAlias` — determinism, formatting, same input → same alias.
* Folder-picker rule — project paths are leaves; favorites never exceed
  `$HOME`.
* Override flow — delete called, then create; New session keeps history.
* `GcSweeper` — renders per theme, respects Escape to skip.
* Matrix rain — panel rain starts on busy, stops when messages render;
  header rain renders in Matrix theme only.

### Acceptance Criteria

* `npm run test` passes.
* `npm run build` passes with no TypeScript errors.
* All beauty features work with the base app.
* Application remains browser-only; no external network calls.

---

# Final Validation Checklist

Before considering the beautify phase complete, verify:

* Session aliases show emoji + adjective + noun, never a UUID
* Hovering an alias reveals the real session ID
* Refresh re-fetches sessions and re-derives aliases
* Sessions delete one-by-one with a confirm and fade-out
* Startup picker shows OpenCode projects (pinned leaves) and favorites
* Favorites browsing never goes above `$HOME`
* Working-directory change prompts New session / Override
* Override deletes history and recreates the session
* GC sweeper plays full-screen on Override, once, per-theme, skippable
* In Matrix theme, the whole output panel shows rain while waiting/processing
* Rain stops and transitions smoothly the moment messages render
* Matrix header shows rain as background plus a slim band
* All four themes still switch without reload
* No new dependencies were added
* Application remains browser-only
* Project builds without TypeScript errors
* Unit tests pass (`npm run test`)
* Project runs after a fresh `npm install`
