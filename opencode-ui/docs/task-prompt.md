# OpenCode WebUI — AI Build Prompts

**Version:** 1.0
**Target Model:** Qwen2.5-Coder 14B (Ollama)
**Framework:** Vue 3 + Vite + TypeScript

---

# Introduction

This document contains **27 incremental prompts** for building the OpenCode WebUI.

Each prompt is intentionally small so that Qwen2.5-Coder 14B can complete it reliably.

After every prompt:

1. Review the generated code.
2. Run the application.
3. Verify the acceptance criteria.
4. Fix issues if necessary.
5. Continue to the next prompt.

The project should remain **buildable and runnable after every step**.

---

# Global Rules (Apply to Every Prompt)

Always follow these rules.

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
* Only modify `package.json` when dependencies change.
* Do not add unnecessary dependencies.

## Code Style

* Keep components reasonably small.
* Use reusable components.
* Avoid duplicated logic.
* Follow Vue best practices.
* Use descriptive names.

## Editing Rules

* Only modify files listed in the prompt.
* Do not refactor unrelated files.
* Do not rename existing folders without reason.
* If an SDK API is uncertain, leave a clearly marked TODO instead of inventing an API.

## Goal

Every prompt must leave the project:

* Buildable
* Runnable
* Easy to review

---

# Phase 1 — Project Foundation

## Prompt 01 — Initialize Project

### Goal

Create the Vue 3 + Vite project structure.

### Tasks

* Create project structure.
* Configure TypeScript.
* Configure Vite.
* Configure Tailwind CSS v4.
* Configure VueUse Motion.
* Add `@opencode-ai/sdk`.
* Configure ESLint and Prettier.
* Add npm scripts only.

### Acceptance Criteria

* Project builds.
* No application logic yet.

---

## Prompt 02 — Base Application Layout

### Goal

Create the static application shell.

### Tasks

Build:

* Header
* Left Input Panel
* Right Output Panel
* Bottom Status Bar

Use responsive CSS.

### Acceptance Criteria

Application displays the required layout.

---

## Prompt 03 — Theme System

### Goal

Implement the theme engine.

### Tasks

Create:

* Theme composable
* CSS variables
* Theme persistence
* localStorage support

Implement only:

* Casual theme

No animations yet.

---

## Prompt 04 — Shared UI Components

Create reusable components.

Examples:

* Button
* Card
* Badge
* Panel
* Spinner
* StatusIndicator

---

# Phase 2 — OpenCode Integration

## Prompt 05 — SDK Service

Create an OpenCode service layer.

Responsibilities:

* Initialize SDK
* Connect
* Disconnect
* Health check

No UI.

---

## Prompt 06 — Connection Status

Display:

* Connecting
* Connected
* Offline
* Reconnecting

Automatically update UI.

---

## Prompt 07 — Working Directory

Allow selecting a working directory.

Default:

`$HOME`

Persist last selection.

---

## Prompt 08 — Session Creation

Create a session.

Display:

* Session ID
* Current directory
* Session state

---

## Prompt 09 — Session Store

Create a composable to manage:

* Active session
* Connection state
* Current directory

---

# Phase 3 — Messaging

## Prompt 10 — Prompt Input

Create:

* Textarea
* Send button
* Ctrl+Enter support

---

## Prompt 11 — Send Messages

Use SDK.

Send user prompts.

No streaming yet.

---

## Prompt 12 — Receive Event Stream

Connect to the event stream.

Display raw events inside a developer panel.

---

## Prompt 13 — Render Assistant Messages

Render streamed assistant messages.

Support incremental token updates.

---

## Prompt 14 — Auto Scroll

Automatically scroll output while streaming.

Do not interrupt manual scrolling.

---

# Phase 4 — Tool Events

## Prompt 15 — Tool Card Component

Create reusable Tool Card.

States:

* Pending
* Running
* Success
* Error

---

## Prompt 16 — Tool Event Rendering

Render:

* bash
* file read
* file write
* search

Show live progress.

---

## Prompt 17 — Tool Results

Render:

* exit codes
* search results
* output
* summaries

---

## Prompt 18 — Diff Viewer

Create a simple file diff viewer.

Requirements:

* Added lines
* Removed lines
* Modified lines

No syntax highlighting.

---

# Phase 5 — Sessions

## Prompt 19 — Session History

Display previous sessions.

Allow selecting one.

---

## Prompt 20 — Session Switching

Switch active session.

Reload conversation.

---

## Prompt 21 — Cancel Generation

Allow cancelling an active generation.

Update UI immediately.

---

# Phase 6 — Themes & Animation

## Prompt 22 — Casual Theme

Implement:

* Fade-in tokens
* Soft progress animation
* Smooth transitions

---

## Prompt 23 — Cartoony Theme

Implement:

* Bounce
* Spring motion
* Pop effects

---

## Prompt 24 — Jarvis Theme

Implement:

* HUD styling
* Sweep reveals
* Typewriter streaming
* Gold highlights

---

## Prompt 25 — Matrix Theme

Implement:

* Canvas rain
* Terminal flicker
* Green token reveal
* Matrix progress widgets

---

# Phase 7 — Polish

## Prompt 26 — Final Polish

Review entire application.

Improve:

* Keyboard navigation
* Accessibility
* Error handling
* Reconnection UX
* Loading states
* Empty states
* Folder organization
* Remove dead code
* Add TODO comments where SDK APIs need confirmation
* Verify all themes switch without reload
* Verify all components are reusable
* Ensure the project builds cleanly

---

# Phase 8 — Testing

## Prompt 27 — Unit & Component Tests

### Goal

Add a Vitest test suite covering core composables and components.

No live OpenCode server is required — mock `@opencode-ai/sdk`.

### Tasks

Install as dev dependencies only:

* Vitest
* `@vue/test-utils`
* `jsdom`

Configure:

* `test` script
* Vitest environment (`jsdom`)

Write unit tests for:

* `useTheme` — apply, persist, switch, light/dark toggle
* `useSession` — create, select, switch, cancel
* `useOpenCode` — URL probe order, fallback to `localhost:4096`
* Event reducer — `message.part.updated` token append, tool parts to card states

Write component tests for:

* `ToolCard` — pending → running → success/error
* `DiffViewer` — added, removed, modified lines

### Acceptance Criteria

* `npm run test` passes.
* Tests run headless.
* Tests cover behavior, not implementation details.

---

# Final Validation Checklist

Before considering the project complete, verify:

* Connects to OpenCode on `localhost:4096`
* Creates sessions
* Sends prompts
* Streams responses
* Displays tool events
* Displays tool results
* Loads previous sessions
* Cancels generation
* Theme switching works without reload
* Theme is stored in `localStorage`
* All four themes function correctly
* Animations work smoothly
* Keyboard shortcuts function
* Application remains browser-only
* No external network calls
* Project builds without TypeScript errors
* Unit tests pass (`npm run test`)
* Project runs after a fresh `npm install`
