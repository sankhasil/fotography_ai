# OpenCode WebUI — Requirements Document

**Status:** Draft  
**Version:** 1.0  
**Scope:** Browser-based UI for the `opencode-ai` npm package

---

## 1. Context & Problem

`opencode-ai` is a terminal agent. The terminal is fast but gives no visual
feedback on what the agent is doing, no persistent output panel, and no way to
apply themes or animation to make the workflow feel alive.

This document specifies a local-only browser UI that wraps the existing
OpenCode server — no new backend, no cloud calls.

---

## 2. How OpenCode Actually Communicates

<cite index="28-1">OpenCode's API server is built on Hono and runs locally on port 4096. It
exposes REST endpoints for session management and **Server-Sent Events (SSE)**
for one-way streaming of AI responses and tool events to clients.</cite>

<cite index="26-1">The `@opencode-ai/sdk` package provides type-safe access to OpenCode's HTTP
and WebSocket APIs, enabling external applications to manage sessions, send
prompts, handle events, and integrate with the tool system.</cite>

```
Browser UI  ──── REST (create session, send message) ────►  opencode serve
             ◄─── SSE stream (tokens, tool calls, status) ─
```

**Key decision:** use `@opencode-ai/sdk` directly — do not re-implement the
protocol. The SDK handles SSE reconnection, typing, and session lifecycle.

```ts
import Opencode from "@opencode-ai/sdk";

const client = new Opencode({ baseURL: "http://localhost:4096" });

// Create session
const session = await client.session.create({ cwd: "/your/project" });

// Send message
await client.message.create(session.id, { role: "user", parts: [{ type: "text", text: prompt }] });

// Stream events
const stream = await client.event.list();
for await (const event of stream) {
  // event.type: "message.part" | "tool.use" | "tool.result" | "session.complete"
  render(event);
}
```

---

## 3. UI Library Comparison

The requirement is **human-readable, easy-to-understand code.**

### Candidates

| | React | Vue 3 | Svelte 5 | Solid.js |
|---|---|---|---|---|
| Syntax | JSX — HTML in JS | Templates — HTML-first | `.svelte` — HTML + minimal JS | JSX, like React |
| Readability | Medium — JSX unfamiliar to non-JS devs | **High** — standard HTML + `v-model` | **Highest** — almost no framework concepts visible | Medium |
| Learning curve | High (hooks, re-renders, closure bugs) | Low–Medium | **Lowest** | Medium |
| Animation ecosystem | Framer Motion (excellent) | VueUse Motion / GSAP | GSAP / native transitions | Solid Motion |
| Bundle size | Large | Medium | **Tiny** (compiled away) | Tiny |
| Devtools | Excellent | Excellent | Good | Basic |
| NPM ecosystem | Largest | Large | Growing | Small |
| Community size | Massive | Large | Medium | Small |

### Verdict

**Vue 3 is the recommendation.**

Reasons:
- Template syntax is closest to plain HTML — non-React developers read it
  without context switching.
- `v-model`, `v-for`, `v-if` are self-explanatory in code review.
- Excellent Vite integration (no config needed — `npm create vue@latest`).
- VueUse Motion covers all animation needs without a separate library.
- Large enough ecosystem that every problem has a solved answer.

Svelte would be the choice if bundle size were critical. React would be the
choice only if the team already lives in React.

---

## 4. Functional Requirements

### 4.1 Core

| ID | Requirement |
|---|---|
| F-01 | Connect to the OpenCode server at `http://localhost:4096` on load |
| F-02 | Show connection status — connected / reconnecting / offline |
| F-03 | Allow user to set the working directory (defaults to `$HOME`) |
| F-04 | Create a new OpenCode session via SDK |
| F-05 | Send a user prompt from an input panel |
| F-06 | Stream AI response tokens into the output panel in real time via SSE |
| F-07 | Show each tool call (bash, file read, file write) as it happens |
| F-08 | Show tool results (exit code, file diff, search hits) when they return |
| F-09 | Session history — list past sessions, load one to continue |
| F-10 | Cancel an in-progress generation |

### 4.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header: logo · session name · model · status · theme   │
├────────────────────────────────┬─────────────────────────┤
│                                │                         │
│        INPUT PANEL             │     OUTPUT PANEL        │
│                                │                         │
│  Multiline prompt textarea     │  Streamed AI tokens     │
│  Send button                   │  Tool call widgets      │
│  Session selector              │  Progress animation     │
│                                │  File diff viewer       │
│                                │                         │
└────────────────────────────────┴─────────────────────────┘
│  Status bar: current tool · tokens used · elapsed time  │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Themes

The theme system controls **colours**, **typography**, and **animation style**
simultaneously. Users pick one; all three change together.

| Theme | Colours | Animation style | Personality |
|---|---|---|---|
| **Casual** | Warm pastels, soft greys | Gentle fade-ins, smooth easing | Calm productivity tool |
| **Cartoony** | Bright primaries, high contrast | Bouncy spring physics, pop-in effects | Fun, playful |
| **Jarvis** | Dark navy, electric blue, gold accents | Sweep reveals, holographic scan lines | Sci-fi HUD |
| **Matrix** | Pure black, phosphor green (#00ff41) | Falling character rain, terminal flicker | Classic hacker |

Theme is stored in `localStorage`. No page reload required to switch.

---

## 5. Animation Requirements

### 5.1 Progress Widgets

Each tool call produces a visible widget with an animated state machine:

```
pending → running → success
                  → error
```

| State | Casual | Cartoony | Jarvis | Matrix |
|---|---|---|---|---|
| Pending | Soft pulse | Bouncing dots | Slow HUD scan | Blinking cursor `_` |
| Running | Smooth spinner | Spinning star ⭐ | Sweeping arc | Scrolling green chars |
| Success | Fade to green ✓ | Pop bounce ✓ | Gold flash + lock | `[OK]` flicker in |
| Error | Fade to red ✗ | Shake + ✗ | Red alert strobe | `[ERR]` blink |

### 5.2 Token Streaming

AI tokens appear one-by-one as they arrive from the SSE stream.

| Theme | Token appearance |
|---|---|
| Casual | Simple fade-in per word |
| Cartoony | Slide-up per word |
| Jarvis | Reveal left-to-right, typewriter |
| Matrix | Green character substitution — random chars settle to final letter |

### 5.3 Theme Transition

Switching themes animates the background and text colours with a 300ms
crossfade. No flash of unstyled content.

### 5.4 Animation Library

**VueUse Motion** (`@vueuse/motion`) — chosen because:
- Declarative: `v-motion` directive, no imperative animation code
- Spring physics built in (needed for Cartoony)
- Works with Vue 3 `<Transition>` for enter/leave
- Zero config

For Matrix rain specifically: a `<canvas>` component with `requestAnimationFrame`
— no library needed, ~50 lines.

---

## 6. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NF-01 | Runs entirely in the browser — no server component beyond OpenCode itself |
| NF-02 | First paint < 2 seconds on localhost |
| NF-03 | SSE reconnects automatically if the connection drops |
| NF-04 | Works in Chrome, Firefox, Safari — latest two versions each |
| NF-05 | No data sent to any external service |
| NF-06 | Keyboard navigable: `Tab` through panels, `Ctrl+Enter` to send |

---

## 7. Technical Stack

```
opencode-ai          ← existing (serves HTTP + SSE on :4096)
@opencode-ai/sdk     ← official TypeScript client
Vue 3 + Vite         ← UI framework + build
@vueuse/motion       ← animations
Tailwind CSS v4      ← utility styling (theme via CSS vars)
```

No additional backend. No database. Sessions stored in OpenCode's own SQLite.

### Theme implementation

Themes are CSS custom property sets swapped on `<html>`:

```css
[data-theme="matrix"] {
  --bg:        #000000;
  --fg:        #00ff41;
  --accent:    #00cc33;
  --font:      "Courier New", monospace;
  --anim-dur:  80ms;        /* fast flicker */
}

[data-theme="jarvis"] {
  --bg:        #060d1f;
  --fg:        #7ec8e3;
  --accent:    #f0b429;
  --font:      "Exo 2", sans-serif;
  --anim-dur:  220ms;       /* sweep reveal */
}
```

---

## 8. Out of Scope

- Authentication / multi-user
- Remote (non-localhost) OpenCode servers
- Mobile layout
- File browser / editor (OpenCode handles file edits; UI shows diffs only)
- Electron wrapper (browser tab is sufficient)

---

## 9. Open Questions

| # | Question | Impact |
|---|---|---|
| Q-1 | Does the target OpenCode version (1.18.x) expose a stable `/event` SSE endpoint, or is it still pre-1.0 breaking? | High — may need version pin |
| Q-2 | Should the Matrix rain run as a full-screen background or only in the progress widget? | Design scope |
| Q-3 | Is a dark-mode toggle needed inside each theme, or is each theme fixed? | Design scope |

---

## 10. Suggested First Milestone

Build in this order — each step is runnable and testable:

1. **Bare connect** — Vue app that connects to `:4096` and shows status
2. **Send + stream** — textarea sends a message, tokens appear in output panel
3. **Tool widgets** — each tool call renders a card with state animation
4. **Themes** — CSS var swap + Casual animation first, others after
5. **Session history** — sidebar listing past sessions
6. **Matrix / Jarvis** — canvas rain + HUD animations last (isolated components)