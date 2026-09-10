# Majduri Office

Multi-agent orchestrator that routes coding tasks between local Ollama and hosted OpenCode Zen backends.

## What It Does

Takes a task like `"write unit tests for auth"` and automatically:

1. **Classifies** it (test, feature, docs, bugfix, refactor)
2. **Routes** it to the right backend (local Ollama or hosted Zen)
3. **Spawns** an OpenCode session to execute the task
4. **Monitors** token usage and handles failovers
5. **Remembers** conversations for future context
6. **Coordinates** agents via file-based inbox/outbox
7. **Escalates** issues via GOD agent

## Quick Start

### Prerequisites

- Node.js 22+
- Ollama running with `qwen2.5-coder-tools:7b` model
- OpenCode installed (or set `OPENCODE_PATH` env var)

### Install

```bash
cd majduri_office/orchestrator
npm install
```

### Run

**Headless mode** (one-shot task):
```bash
npm run dev "feature: add user authentication"
```

**CLI mode** (interactive chat):
```bash
npm run cli
```

**Test**:
```bash
npm test
```

## How It Works

```
User Input → Classifier → Router → Circuit Breaker → Session Manager → OpenCode Server → Response
                  ↓           ↓           ↓               ↓                ↓
              auto-tag    backend+failover  green/yellow/red  spawn process   stream via SSE
                  ↓           ↓           ↓               ↓                ↓
              SQLite ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←
                  ↓
              Coordinator → Inbox/Outbox/Blackboard
                  ↓
              GodAgent → Escalation (notify/reroute/halt)
```

## Tag System

Prefix your task with a tag to force routing, or let the classifier auto-detect:

| Tag | Backend | Parallel | Token Limit |
|-----|---------|----------|-------------|
| `test` | local | yes | none |
| `feature` | zen | no | 10,000 |
| `refactor` | zen | yes | 10,000 |
| `docs` | local | no | none |
| `bugfix` | zen | no | 10,000 |

**Auto-classification** by keywords:
- "test", "spec", "unit" → `test`
- "add", "create", "implement" → `feature`
- "fix", "bug", "error" → `bugfix`
- "refactor", "clean", "simplify" → `refactor`
- "doc", "readme", "comment" → `docs`

## Configuration

Edit `routing.json` to change backends, parallelism, or token limits.

Set `approval.routing_approval` to `true` to require manual approval before routing.

## Architecture

See [docs/architecture/solution_design.md](architecture/solution_design.md) for Mermaid diagrams.

## Project Structure

```
majduri_office/
├── orchestrator/           # Main application
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── classifier.ts   # Auto-tagging
│   │   ├── router.ts       # Backend routing + circuit breaker
│   │   ├── sessions.ts     # Process management
│   │   ├── monitor.ts      # SSE streaming + token tracking
│   │   ├── memory.ts       # Conversation memory
│   │   ├── coordinator.ts  # Agent coordination (inbox/outbox)
│   │   ├── capabilities.ts # Worker isolation tokens
│   │   ├── worktree.ts     # Parallel worktree isolation
│   │   ├── god-agent.ts    # Escalation logic
│   │   ├── circuit-breaker.ts # Failure tracking
│   │   ├── hooks.ts        # Lifecycle events
│   │   ├── db.ts           # SQLite (8 tables)
│   │   └── cli/            # Terminal UI (Ink + React)
│   ├── tests/              # 22 unit + integration tests
│   └── routing.json        # Tag → backend config
├── tools/                  # Ollama proxy scripts
├── docs/
│   ├── architecture/       # Mermaid diagrams
│   └── prompts/            # Task specifications
└── opencode.json           # OpenCode provider config
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run headless with a task |
| `npm run cli` | Start interactive chat |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |

## CLI Commands

| Command | Description |
|---------|-------------|
| `/exit`, `/quit`, `/q` | Exit the CLI |
| `/clear`, `/new` | Start a new session |
| `/help` | Show available commands |
| `/sessions` | List active sessions |
| `!command` | Execute shell command |
| `@file` | Reference a file |
| `Ctrl+C`, `Ctrl+D` | Exit |
