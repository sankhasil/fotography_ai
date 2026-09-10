# Task: Local/Zen Mini-Orchestrator for OpenCode UI

> Detailed architecture and implementation prompt.
> Generated from Phase 1 interview decisions.

---

## Goal

Build a multi-agent orchestrator that routes tasks between concurrent OpenCode sessions across two backends:

1. **Local**: Ollama qwen2.5-coder via `tools/ollama-tool-call-proxy.mjs` → Ollama on `:11434`
2. **Hosted**: OpenCode Zen free-tier models (e.g. `opencode/big-pickle`)

The orchestrator assigns incoming tasks to one or more concurrent OpenCode sessions based on tags, and can run several sessions in parallel.

---

## Architecture

```
                         ┌──────────────────────────────────┐
                         │         User / API Call          │
                         │    "Write tests for auth.ts"     │
                         └───────────────┬──────────────────┘
                                         │
                                         ▼
                         ┌──────────────────────────────────┐
                         │        Orchestrator (Node.js)    │
                         │                                  │
                         │  ┌──────────────────────────┐    │
                         │  │  1. Classifier           │    │
                         │  │  Auto-tag if no tag      │    │
                         │  │  "write tests" → test    │    │
                         │  └─────────────┬────────────┘    │
                         │                │                 │
                         │                ▼                 │
                         │  ┌───────────────────────────┐   │
                         │  │  2. Router                │   │
                         │  │  Tag → backend mapping    │   │
                         │  │  + token_limit check      │   │
                         │  │  + availability check     │   │
                         │  └─────────────┬─────────────┘   │
                         │                │                 │
                         │         ┌──────┴──────┐          │
                         │         ▼             ▼          │
                         │  ┌───────────┐ ┌───────────┐     │
                         │  │ Local     │ │ Zen       │     │
                         │  │ Queue     │ │ Queue     │     │
                         │  └─────┬─────┘ └─────┬─────┘     │
                         │        │             │           │
                         │        ▼             ▼           │
                         │  ┌───────────────────────────┐   │
                         │  │  3. Session Manager       │   │
                         │  │  Spawn opencode serve     │   │
                         │  │  on port :4097, :4098...  │   │
                         │  └─────────────┬─────────────┘   │
                         │                │                 │
                         │                ▼                 │
                         │  ┌───────────────────────────┐   │
                         │  │  4. Monitor (SSE)         │   │
                         │  │  Track tokens, progress   │   │
                         │  │  Detect failures          │   │
                         │  └─────────────┬─────────────┘   │
                         │                │                 │
                         │                ▼                 │
                         │  ┌────────────────────────────┐  │
                         │  │  5. SQLite (better-sqlite3)│  │
                         │  │  tasks, sessions, tokens   │  │
                         │  │  routing config, events    │  │
                         │  └────────────────────────────┘  │
                         └──────────────────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
          ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
          │ opencode serve  │  │ opencode serve  │  │ opencode serve  │
          │   :4097         │  │   :4098         │  │   :4099         │
          │   (Zen)         │  │   (Local)       │  │   (CLI manual)  │
          └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
                   │                    │                    │
                   ▼                    ▼                    ▼
          ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
          │  OpenCode SDK   │  │  OpenCode SDK   │  │  OpenCode CLI   │
          │  @opencode-ai/  │  │  @opencode-ai/  │  │  (subprocess)   │
          │  sdk/client     │  │  sdk/client     │  │                 │
          └─────────────────┘  └─────────────────┘  └─────────────────┘
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                    ┌──────────────┐  ┌──────────────┐
                    │ ollama-proxy │  │   Ollama     │
                    │   :4198      │  │   :11434     │
                    └──────┬───────┘  └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  qwen2.5     │
                    │  local model │
                    └──────────────┘
```

---

## Data Flow

```
User submits task
       │
       ▼
  Classifier assigns tag (or uses user-provided tag)
       │
       ▼
  Router checks routing.json:
    - Which backend for this tag?
    - Is backend available? (token_limit, network, memory)
    - Can this be parallelized with other tasks?
       │
       ▼
  Session Manager spawns/reuses opencode serve instance:
    - Each instance on a unique port
    - Each instance has its own SDK client
    - Graceful degradation if memory insufficient
       │
       ▼
  Monitor watches SSE event stream:
    - Tracks token usage per session
    - Detects Zen rate-limit errors (429)
    - Detects network failures
    - Updates SQLite with progress
       │
       ▼
  On failure/quota exhaustion:
    - Router fails over to other backend
    - Or queues task for retry
    - Or notifies user (if routing_approval enabled)
       │
       ▼
  Task completes → SQLite updated → result available
```

---

## Decisions (Phase 1 Interview)

| # | Question | Decision |
|---|----------|----------|
| 1 | Session spawning | Multiple `opencode serve` on different ports + on-demand CLI subprocess. Graceful degradation on memory. |
| 2 | Coordination state | SQLite with `better-sqlite3`, embedded in Node.js process. No server, no Docker. |
| 3 | Tag taxonomy | Fixed enum (`test`, `feature`, `refactor`, `docs`, `bugfix`) + auto-classification by keyword + extensible config with `token_limit`. |
| 4 | Concurrency safety | Scope tags — parallel only for non-overlapping file paths. Sequential otherwise. |
| 5 | Token full detection | Proactive tracking (SQLite counter vs `token_limit`) + Zen error parsing as fallback. |
| 6 | Approval gate | Configurable — OpenCode built-in permissions (default) + optional orchestrator routing approval. |
| 7 | Repo location | `majduri_office/` as complete standalone solution with tools and config. |

---

## Folder Structure

```
majduri_office/
├── AGENTS.md                         # Engineering rules (Ponytail principles)
├── tasks-prompt.md                   # Original task spec (Phase 1 questions)
├── task-detailed-prompt.md           # This document
│
├── orchestrator/                     # Main Node.js project
│   ├── package.json                  # Dependencies: better-sqlite3, @opencode-ai/sdk
│   ├── tsconfig.json                 # TypeScript config
│   │
│   ├── src/
│   │   ├── index.ts                  # Entry point — starts orchestrator, loads config
│   │   ├── router.ts                 # Tag-based routing: tag → backend + parallel decision
│   │   ├── classifier.ts             # Auto-classify untagged tasks by keyword heuristics
│   │   ├── sessions.ts               # Spawn/monitor/kill opencode serve instances
│   │   ├── monitor.ts                # SSE event stream, token tracking, failover detection
│   │   ├── db.ts                     # SQLite schema, migrations, queries
│   │   ├── config.ts                 # Load routing.json + approval settings
│   │   ├── types.ts                  # Shared TypeScript types
│   │   └── utils.ts                  # Helpers (sleep, retry, memory check)
│   │
│   ├── routing.json                  # Tag → backend + token_limit + parallel config
│   ├── orchestrator.db               # SQLite database (gitignored)
│   └── .gitignore                    # Ignore node_modules, orchestrator.db
│
├── tools/                            # Copied from opencode-ui/tools/
│   ├── ollama-tool-call-proxy.mjs    # Proxy: Ollama → OpenAI-compatible tool calls
│   ├── ollama-serve.sh               # Start Ollama with context length config
│   └── ollama-stop.sh                # Stop Ollama
│
└── opencode.json                     # OpenCode provider/model configuration
```

---

## Key Components

### 1. Classifier (`classifier.ts`)

Auto-tags untagged tasks using keyword heuristics:

```typescript
const KEYWORD_MAP: Record<string, string[]> = {
  test:    ["test", "spec", "assert", "mock", "coverage"],
  docs:    ["doc", "readme", "comment", "javadoc", "kdoc"],
  bugfix:  ["fix", "bug", "error", "crash", "broken"],
  feature: ["add", "create", "implement", "build", "new"],
  refactor:["refactor", "clean", "reorganize", "extract", "simplify"],
}

function classify(task: string): string {
  const lower = task.toLowerCase()
  for (const [tag, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) return tag
  }
  return "feature" // default
}
```

### 2. Router (`router.ts`)

Reads `routing.json`, checks backend availability, decides parallelism:

```typescript
interface RouteConfig {
  backend: "local" | "zen"
  parallel: boolean
  token_limit: number | null
}

function route(tag: string, db: Database): { backend: string; parallel: boolean } {
  const config = loadRoutingConfig()
  const rule = config[tag] ?? config["feature"] // fallback

  // Check token limit
  if (rule.token_limit !== null) {
    const used = db.getTokenUsage(tag)
    if (used >= rule.token_limit) {
      // Failover: try other backend or queue
      return failover(tag, rule)
    }
  }

  // Check backend availability
  if (!isBackendAvailable(rule.backend)) {
    return failover(tag, rule)
  }

  return { backend: rule.backend, parallel: rule.parallel }
}
```

### 3. Session Manager (`sessions.ts`)

Spawns and manages `opencode serve` instances:

```typescript
interface ManagedSession {
  id: string
  port: number
  backend: "local" | "zen"
  status: "starting" | "ready" | "busy" | "error" | "stopped"
  client: OpencodeClient
  process: ChildProcess
}

class SessionManager {
  private sessions = new Map<string, ManagedSession>()
  private nextPort = 4097

  async spawn(backend: "local" | "zen", directory: string): Promise<ManagedSession> {
    // Check memory before spawning
    const freeMem = getFreeMemoryMB()
    if (backend === "local" && freeMem < 2048) {
      throw new Error("Insufficient memory for local session (need 2GB free)")
    }

    const port = this.nextPort++
    const process = spawn("opencode", [
      "serve",
      "--hostname=127.0.0.1",
      `--port=${port}`,
    ], { cwd: directory })

    const client = createOpencodeClient({ baseUrl: `http://127.0.0.1:${port}` })

    // Wait for health check
    await waitForHealth(client, 10_000)

    const session: ManagedSession = {
      id: crypto.randomUUID(),
      port,
      backend,
      status: "ready",
      client,
      process,
    }
    this.sessions.set(session.id, session)
    return session
  }
}
```

### 4. Monitor (`monitor.ts`)

Watches SSE events, tracks tokens, detects failures:

```typescript
class Monitor {
  async watch(session: ManagedSession, db: Database): Promise<void> {
    const events = await session.client.event.subscribe()

    for await (const event of events.stream) {
      switch (event.type) {
        case "message.part.updated":
          // Track token usage
          db.updateTokenUsage(session.id, event.properties)
          break

        case "session.idle":
          // Task completed
          db.markTaskComplete(session.id)
          break

        case "session.error":
          // Check if it's a quota error
          if (isQuotaError(event.properties)) {
            db.markBackendUnavailable("zen", "token_limit_exceeded")
            // Router will failover for next task
          }
          break
      }
    }
  }
}
```

### 5. SQLite Schema (`db.ts`)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  port INTEGER NOT NULL,
  backend TEXT NOT NULL,
  status TEXT NOT NULL,
  directory TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  tag TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tokens_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  tag TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backend_status (
  backend TEXT PRIMARY KEY,
  available INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 6. Routing Config (`routing.json`)

```json
{
  "test": {
    "backend": "local",
    "parallel": true,
    "token_limit": null
  },
  "feature": {
    "backend": "zen",
    "parallel": false,
    "token_limit": 10000
  },
  "refactor": {
    "backend": "zen",
    "parallel": true,
    "token_limit": 10000
  },
  "docs": {
    "backend": "local",
    "parallel": false,
    "token_limit": null
  },
  "bugfix": {
    "backend": "zen",
    "parallel": false,
    "token_limit": 10000
  }
}
```

### 7. Approval Config (in `routing.json` or separate)

```json
{
  "approval": {
    "routing_approval": false
  }
}
```

- `false` (default): Orchestrator routes tasks silently, OpenCode handles tool permissions
- `true`: Orchestrator presents "Route task X to Zen? [y/n]" before sending

---

## Constraints (Fixed, Non-Negotiable)

1. **Tag-driven routing.** Every task carries a tag. Auto-classify if untagged.
2. **Dual control on model selection.** User manual override always wins. Auto-router reassigns on failure/quota.
3. **OpenCode executes tools.** Orchestrator routes and coordinates only. Never reimplements tool logic.
4. **Hardware ceiling.** 16GB unified-memory Mac. No fast local parallelism assumption.
5. **Build on existing proxy.** Don't duplicate ollama-tool-call-proxy parsing logic.
6. **Zen free-tier is rate-limited.** Design for quota exhaustion as a normal condition.

---

## Definition of Done

- [ ] A task with an explicit tag routes to the correct backend without manual intervention
- [ ] An untagged task gets auto-classified and routed the same way
- [ ] Forcing a manual model switch mid-task overrides the router's choice
- [ ] Simulating a Zen quota/network failure causes automatic failover
- [ ] Two tagged subtasks can run concurrently without corrupting each other's file edits

---

## Implementation Order

### Phase 2a — Foundation
1. Set up `majduri_office/` folder structure
2. Initialize Node.js project with `better-sqlite3` + `@opencode-ai/sdk`
3. Implement SQLite schema and queries (`db.ts`)
4. Implement config loader (`config.ts`)
5. Copy tools and opencode.json

### Phase 2b — Core Routing
6. Implement classifier (`classifier.ts`)
7. Implement router (`router.ts`)
8. Implement session manager (`sessions.ts`)
9. Wire classifier → router → session manager

### Phase 2c — Monitoring & Failover
10. Implement SSE monitor (`monitor.ts`)
11. Implement proactive token tracking
12. Implement error-based failover
13. Wire monitor → SQLite → router

### Phase 2d — Integration & Polish
14. Add approval gate (optional routing approval)
15. Add memory check before spawning local sessions
16. Add concurrency safety (scope tag file overlap check)
17. Write tests for classifier, router, db
18. End-to-end test with real OpenCode sessions

---

## Dependencies

```json
{
  "name": "majduri-orchestrator",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "@opencode-ai/sdk": "latest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/better-sqlite3": "^7.6.0",
    "vitest": "^2.0.0"
  }
}
```

---

## Ponytail Notes

- SQLite is embedded — no server, no Docker, one file on disk
- `better-sqlite3` is synchronous — no async complexity for DB operations
- Each `opencode serve` is a real OpenCode instance — tool permissions are native
- The orchestrator is a thin routing layer — it never executes tools itself
- Token tracking is a simple SQLite counter — no complex analytics
- Failover is reactive (error-based) + proactive (counter-based) — belt and suspenders
