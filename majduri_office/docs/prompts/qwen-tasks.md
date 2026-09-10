# Qwen Task Prompts — Foundation Layer

> Feed these prompts one at a time to a local Qwen 2.5 Coder session.
> Each task is self-contained. Qwen doesn't need to know the full architecture.
> Run: `opencode -m "ollama-qwen/qwen2.5-coder:7b"` from `majduri_office/`

---

## Task 1: Folder Structure

```
Create the following folder structure inside the current directory:

orchestrator/
  src/
tools/

Just create the empty folders. No files yet.
```

---

## Task 2: package.json

```
Create a file called orchestrator/package.json with this content:

{
  "name": "majduri-orchestrator",
  "version": "0.1.0",
  "type": "module",
  "description": "Multi-agent orchestrator for OpenCode sessions",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "start": "node --loader ts-node/esm src/index.ts",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/better-sqlite3": "^7.6.0",
    "tsx": "^4.0.0"
  }
}

Write this exactly as shown. Do not modify or add anything.
```

---

## Task 3: tsconfig.json

```
Create a file called orchestrator/tsconfig.json with this content:

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}

Write this exactly as shown.
```

---

## Task 4: .gitignore

```
Create a file called orchestrator/.gitignore with this content:

node_modules/
dist/
orchestrator.db
orchestrator.db-wal
orchestrator.db-shm
.env
*.log

Write this exactly as shown.
```

---

## Task 5: types.ts

```
Create a file called orchestrator/src/types.ts with the following TypeScript types:

1. Backend type: "local" | "zen"

2. Session status: "starting" | "ready" | "busy" | "error" | "stopped"

3. Task status: "pending" | "running" | "completed" | "failed" | "queued"

4. RouteConfig interface:
   - backend: Backend
   - parallel: boolean
   - token_limit: number | null

5. RoutingConfig interface:
   - A record where keys are strings (tag names) and values are RouteConfig

6. Session interface:
   - id: string
   - port: number
   - backend: Backend
   - status: SessionStatus
   - directory: string
   - created_at: string

7. Task interface:
   - id: string
   - session_id: string | null
   - tag: string
   - prompt: string
   - status: TaskStatus
   - tokens_used: number
   - created_at: string
   - completed_at: string | null

8. TokenUsage interface:
   - id: number (auto-increment)
   - session_id: string
   - tag: string
   - tokens: number
   - recorded_at: string

9. BackendStatus interface:
   - backend: Backend (primary key)
   - available: boolean
   - reason: string | null
   - updated_at: string

10. Event interface:
    - id: number (auto-increment)
    - session_id: string | null
    - event_type: string
    - payload: string | null
    - created_at: string

11. ApprovalConfig interface:
    - routing_approval: boolean

12. AppConfig interface:
    - routing: RoutingConfig
    - approval: ApprovalConfig

Use TypeScript type aliases and interfaces. Export all types.
```

---

## Task 6: routing.json

```
Create a file called orchestrator/routing.json with this content:

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

Write this exactly as shown. This maps task tags to backends.
- backend: which OpenCode instance handles the task
- parallel: can this run alongside other tasks with the same tag
- token_limit: max tokens for Zen backend (null = unlimited for local)
```

---

## Task 7: config.ts

```
Create a file called orchestrator/src/config.ts that:

1. Reads orchestrator/routing.json from disk
2. Parses it as JSON
3. Validates it has the expected structure (each key has backend, parallel, token_limit)
4. Returns the parsed config
5. Also reads an optional approval setting (default routing_approval: false)
6. Exports a function loadConfig() that returns an AppConfig object
7. Exports a function getRouteForTag(tag: string, config: AppConfig) that returns the RouteConfig for a tag, defaulting to "feature" if tag not found

Use fs.readFileSync and JSON.parse. Keep it simple.
Import types from ./types.ts.
```

---

## Task 8: db.ts (Schema Only)

```
Create a file called orchestrator/src/db.ts that:

1. Imports Database from "better-sqlite3"
2. Exports a function initDatabase(dbPath: string) that:
   - Opens (or creates) a SQLite database at the given path
   - Enables WAL mode: db.pragma('journal_mode = WAL')
   - Creates these tables if they don't exist:

   sessions:
     id TEXT PRIMARY KEY
     port INTEGER NOT NULL
     backend TEXT NOT NULL
     status TEXT NOT NULL
     directory TEXT
     created_at TEXT DEFAULT (datetime('now'))

   tasks:
     id TEXT PRIMARY KEY
     session_id TEXT REFERENCES sessions(id)
     tag TEXT NOT NULL
     prompt TEXT NOT NULL
     status TEXT NOT NULL DEFAULT 'pending'
     tokens_used INTEGER DEFAULT 0
     created_at TEXT DEFAULT (datetime('now'))
     completed_at TEXT

   token_usage:
     id INTEGER PRIMARY KEY AUTOINCREMENT
     session_id TEXT REFERENCES sessions(id)
     tag TEXT NOT NULL
     tokens INTEGER NOT NULL
     recorded_at TEXT DEFAULT (datetime('now'))

   backend_status:
     backend TEXT PRIMARY KEY
     available INTEGER NOT NULL DEFAULT 1
     reason TEXT
     updated_at TEXT DEFAULT (datetime('now'))

   events:
     id INTEGER PRIMARY KEY AUTOINCREMENT
     session_id TEXT
     event_type TEXT NOT NULL
     payload TEXT
     created_at TEXT DEFAULT (datetime('now'))

   - Returns the database instance

3. Exports the Database type from better-sqlite3 for use in other files.

Keep it simple. One function, one file. Use db.exec() for multi-statement SQL.
```

---

## Task 9: db.ts (CRUD Queries)

```
Add the following functions to orchestrator/src/db.ts:

1. insertSession(db, session: Session) — INSERT into sessions table
2. updateSessionStatus(db, id: string, status: string) — UPDATE status WHERE id = ?
3. getSessionsByBackend(db, backend: string) — SELECT * WHERE backend = ?
4. getActiveSessionCount(db) — SELECT count WHERE status IN ('ready', 'busy')
5. deleteSession(db, id: string) — DELETE WHERE id = ?

6. insertTask(db, task: Task) — INSERT into tasks table
7. updateTaskStatus(db, id: string, status: string) — UPDATE status WHERE id = ?
8. updateTaskSession(db, id: string, session_id: string) — UPDATE session_id WHERE id = ?
9. getPendingTasks(db) — SELECT * WHERE status = 'pending' ORDER BY created_at
10. getTasksByTag(db, tag: string) — SELECT * WHERE tag = ?

11. insertTokenUsage(db, session_id: string, tag: string, tokens: number) — INSERT into token_usage
12. getTokenUsageByTag(db, tag: string) — SELECT sum(tokens) WHERE tag = ? AND recorded_at > datetime('now', '-1 hour')
13. getTotalTokenUsage(db, tag: string) — SELECT sum(tokens) WHERE tag = ? (all time)

14. setBackendStatus(db, backend: string, available: boolean, reason: string | null) — INSERT OR REPLACE into backend_status
15. getBackendStatus(db, backend: string) — SELECT * WHERE backend = ?
16. isBackendAvailable(db, backend: string) — SELECT available WHERE backend = ? (returns boolean)

17. insertEvent(db, session_id: string | null, event_type: string, payload: string | null) — INSERT into events
18. getRecentEvents(db, limit: number) — SELECT * ORDER BY created_at DESC LIMIT ?

Use prepared statements (db.prepare(...).run(...)) for all writes.
Use .get() for single rows, .all() for multiple rows.
Export all functions.
```

---

## Task 10: classifier.ts

```
Create a file called orchestrator/src/classifier.ts that:

1. Defines a constant KEYWORD_MAP that maps tags to keyword arrays:

   test:    ["test", "spec", "assert", "mock", "coverage", "unit", "integration"]
   docs:    ["doc", "readme", "comment", "javadoc", "kdoc", "document", "explain"]
   bugfix:  ["fix", "bug", "error", "crash", "broken", "issue", "resolve"]
   feature: ["add", "create", "implement", "build", "new", "extend", "feature"]
   refactor:["refactor", "clean", "reorganize", "extract", "simplify", "optimize"]

2. Exports a function classify(task: string) that:
   - Converts the task to lowercase
   - Checks each tag's keywords against the task string
   - Returns the first matching tag
   - Returns "feature" if no match (default)

3. Exports a function isValidTag(tag: string, validTags: string[]) that:
   - Returns true if tag is in the validTags array

Keep it pure functions, no side effects. Export both functions.
```

---

## Task 11: utils.ts

```
Create a file called orchestrator/src/utils.ts with these helper functions:

1. sleep(ms: number): Promise<void>
   - Returns a promise that resolves after ms milliseconds
   - Use: new Promise(resolve => setTimeout(resolve, ms))

2. retry<T>(fn: () => T, maxAttempts: number, delayMs: number): T
   - Calls fn up to maxAttempts times
   - If it throws, waits delayMs then retries
   - Returns the result on success
   - Throws the last error if all attempts fail

3. getFreeMemoryMB(): number
   - Import os from 'node:os'
   - Return Math.floor(os.freemem() / 1024 / 1024)

4. getTotalMemoryMB(): number
   - Import os from 'node:os'
   - Return Math.floor(os.totalmem() / 1024 / 1024)

5. generateId(): string
   - Import crypto from 'node:crypto'
   - Return crypto.randomUUID()

6. timestamp(): string
   - Return new Date().toISOString()

Export all functions. Keep each function under 5 lines.
```

---

## Task 12: opencode.json

```
Create a file called opencode.json (in the current directory, NOT inside orchestrator/) with this content:

{
  "model": "ollama/gemma4:e4b",
  "small_model": "ollama/gemma4:e4b",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "http://localhost:11434/v1",
        "apiKey": "ollama"
      },
      "models": {
        "gemma4:e4b": {
          "name": "Gemma4"
        }
      }
    },
    "ollama-qwen": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Qwen2.5 (tool-wrapped)",
      "options": {
        "baseURL": "http://localhost:4198/v1",
        "apiKey": "ollama"
      },
      "models": {
        "qwen2.5-coder:7b": {
          "name": "Qwen 2.5 Coder 7B"
        },
        "hhao/qwen2.5-coder-tools:7b": {
          "name": "Qwen 2.5 Coder Tools 7B"
        }
      }
    }
  },
  "skills": {
    "paths": []
  }
}

Write this exactly as shown.
```

---

## Task 13: Copy Tools

```
Copy these files from the opencode-ui/tools/ directory into the tools/ directory here:

1. ollama-tool-call-proxy.mjs
2. ollama-serve.sh
3. ollama-stop.sh

Use the bash command:
  cp ../opencode-ui/tools/ollama-tool-call-proxy.mjs tools/
  cp ../opencode-ui/tools/ollama-serve.sh tools/
  cp ../opencode-ui/tools/ollama-stop.sh tools/

Then make the .sh files executable:
  chmod +x tools/ollama-serve.sh
  chmod +x tools/ollama-stop.sh
```

---

## Task 14: Verify Foundation

```
Run these commands to verify the foundation is set up correctly:

1. ls -la orchestrator/
2. ls -la orchestrator/src/
3. cat orchestrator/package.json
4. cat orchestrator/tsconfig.json
5. cat orchestrator/routing.json
6. cat orchestrator/src/types.ts
7. cat orchestrator/src/db.ts
8. cat orchestrator/src/config.ts
9. cat orchestrator/src/classifier.ts
10. cat orchestrator/src/utils.ts

Report any errors or missing files.
```

---

## After Qwen Finishes

Once all 14 tasks are done, the foundation layer is complete. Then switch to Zen (me) for:

- `router.ts` — full routing with failover
- `sessions.ts` — opencode serve process management
- `monitor.ts` — SSE event streaming
- `index.ts` — wiring everything together
- Integration and testing

---

## Notes for Qwen Sessions

- Each prompt is self-contained. Don't reference other files unless the prompt says to.
- If Qwen asks clarifying questions, just repeat the prompt. The prompts are complete.
- If Qwen generates extra code beyond what's asked, delete it. Keep exactly what's specified.
- If a task fails, try rephrasing the prompt slightly. Qwen sometimes needs a nudge.
- Save each file exactly where the prompt says. Path matters.
