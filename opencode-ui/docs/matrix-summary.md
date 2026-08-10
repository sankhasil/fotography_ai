```
███╗   ███╗ █████╗ ████████╗██████╗ ██╗██╗  ██╗
████╗ ████║██╔══██╗╚══██╔══╝██╔══██╗██║╚██╗██╔╝
██╔████╔██║███████║   ██║   ██████╔╝██║ ╚███╔╝
██║╚██╔╝██║██╔══██║   ██║   ██╔══██╗██║ ██╔██╗
██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║██╔╝ ██╗
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝

OpenCode WebUI :: DOCS DOSSER
System decrypt :: 4 files :: 1,710 lines :: 0x00FF41
```

> The docs are the blueprints. Follow them or wake up in the desert.

---

## [01] AGENTS.md — THE RULES OF THE MACHINE

**Role:** Engineering law for every agent touching the repo.

- **Ponytail Principle** — build the smallest correct solution. Every line of
  code is a liability. Prefer deletion over addition.
- Stop at the first step that solves the problem (YAGNI ladder):
  does it need to exist → does the project/Spring/Kotlin solve it → only then
  write new code.
- **Kotlin + Spring Boot** are the target stack: constructor injection, data
  classes, sealed classes, services own business logic, controllers validate +
  map DTOs.
- Architecture is one-directional: `Controller → Service → Repository → DB`.
- Bug fixes hit the root cause — inspect every caller, implementation, and
  test; fix the shared abstraction once.
- Testing tests behavior, not implementation.
- Security: validate auth/authz/input/output, never log passwords, JWTs, keys.
- YAML/JSON/Bash all have boring, deterministic formatting rules.
- Every non-obvious trade-off gets a `ponytail:` comment explaining why it's
  acceptable today + the upgrade path.

**Bottom line:** simplicity is a feature; every abstraction must earn its life.

---

## [02] requirement.md — THE SPEC

**Role:** The *what*. A browser UI wrapping `opencode-ai` running locally on
`:4096`. No backend, no cloud.

- **Stack:** Vue 3 (Composition API, `<script setup lang="ts">`) + Vite +
  Tailwind CSS v4 + `@vueuse/motion` + `@opencode-ai/sdk`.
- **Communication:** REST to create sessions / send prompts, SSE stream for
  tokens + tool events. Use the SDK — never reimplement the protocol.
- **Functional core (F-01..F-10):**
  - Connect to `localhost:4096`, show connection status
  - Working directory picker (defaults to `$HOME`)
  - Create sessions, send prompts, stream tokens in real time
  - Render tool calls + results (bash, file read/write, diffs)
  - Session history + cancel in-progress generation
- **Layout:** Header (logo·session·model·status·theme) / Input panel (left) /
  Output panel (right) / Status bar (bottom).
- **Four themes** controlling colours + typography + animation together:
  Casual · Cartoony · Jarvis (HUD) · Matrix (rain, phosphor green `#00ff41`).
  Stored in `localStorage`, no reload to switch.
- **Non-functional:** browser-only, first paint < 2s, SSE auto-reconnect,
  no external calls, keyboard navigable.
- **Out of scope:** auth, multi-user, remote servers, mobile, file editor,
  Electron.

---

## [03] task-prompt.md — THE 27-PROMPT EXECUTION SEQUENCE

**Role:** The *how*. 27 tiny prompts, each keeping the app buildable + runnable.

| Phase | Prompts | What it builds |
|---|---|---|
| 1. Foundation | 01–04 | Project init, base layout, theme engine, shared UI components |
| 2. OpenCode Integration | 05–09 | SDK service, connection status, working dir, session create + store |
| 3. Messaging | 10–14 | Prompt input, send, event stream, streamed rendering, auto-scroll |
| 4. Tool Events | 15–18 | Tool card, event rendering, results, diff viewer |
| 5. Sessions | 19–21 | History, switching, cancel generation |
| 6. Themes & Animation | 22–25 | Casual, Cartoony, Jarvis, Matrix |
| 7. Polish | 26 | Keyboard nav, a11y, error handling, dead code, theme integrity |
| 8. Testing | 27 | Vitest + `@vue/test-utils` + jsdom; mock the SDK, no live server |

**Ground rules:** no shell commands, no `npm install` unless deps change, only
touch files listed in the prompt, TODO comment when an SDK API is uncertain.

**Final validation checklist:** connect on `:4096`, create/send/stream,
tool events + results, session history, cancel, 4 themes, `npm run test`.

---

## [04] advanced-prompt.md — THE BEAUTIFY SEQUENCE

**Role:** 7 more prompts (28–34) on top of the 27 — the *personality* layer.

| # | Prompt | What it adds |
|---|---|---|
| 28 | Session Alias System | Deterministic `{emoji} {Adjective} {Noun}` aliases (FNV-1a hash, ~50/150/120 curated words). Header + selector show alias; real UUID only in `data-session-id` + hover tooltip. Client-side only. |
| 29 | Session Management UX | Refresh session list (spinner, keep old on failure); per-row trash icon with confirm + fade-out delete |
| 30 | Startup Folder Picker v2 | Two-group picker: OpenCode projects (pinned leaves) + local favorites (never above `$HOME`) + custom path |
| 31 | Working-Dir Change Flow | New session / Override / Cancel dialog on directory change; Override deletes + recreates server-side |
| 32 | GC Sweeper Animation | Full-screen per-theme garbage-collection wipe on Override only, skippable via click/Escape |
| 33 | Matrix Rain as Progress & Header | Matrix theme: full output-panel rain while busy + header rain (bg + slim band); stops the moment messages render |
| 34 | Polish & Tests | a11y, empty states, error/loading states, theme switching integrity, Vitest for alias/picker/override/sweeper/rain |

**Rule:** no new dependencies — `@vueuse/motion` + CSS transitions cover
everything. GSAP deliberately rejected.

---

## [05] THE MATRIX OUTLOOK

```
> WAKE UP, NEO.
> The docs describe a client-only agent cockpit:
>   TALK to opencode-ai on :4096
>   WATCH tokens + tool calls stream over SSE
>   FEEL it via 4 animated themes
>   HEAL it via the ponytail rule — smallest correct solution
>
> The machine is already built (all 27 base prompts + 45/50 tests green).
> Beautify phase (28–34) is the last upload.
```

```
[OK] dossier decrypted :: do you have the red pill?
```
