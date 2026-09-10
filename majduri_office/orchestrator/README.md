# Majduri Office Orchestrator

Multi-agent orchestrator for OpenCode sessions with tag-driven routing, dual backends, and SQLite memory.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start the orchestrator (headless mode)
npm run dev

# Start the CLI chat interface
npm run cli
```

## Architecture

```
User → Classifier (auto-tag) → Router (tag→backend+failover) → Session Manager → Monitor → SQLite
```

### Components

- **Classifier**: Keyword-based auto-classification (test, feature, docs, bugfix, refactor)
- **Router**: Tag-based routing with failover between local (Ollama) and hosted (Zen) backends
- **Session Manager**: Spawn/kill OpenCode serve instances
- **Monitor**: SSE event streaming + token tracking
- **Memory**: Conversation history + context management

## Usage

### CLI Mode

```bash
npm run cli
```

Type tasks directly or use prefixes:

```
> test: write unit tests for auth module
> feature: add user profile page
> fix bug in login flow
```

### Headless Mode

```bash
npm run dev "test: write unit tests for auth module"
```

## Configuration

### routing.json

```json
{
  "routing": {
    "test": { "backend": "zen", "parallel": true, "token_limit": 100000 },
    "feature": { "backend": "local", "parallel": true, "token_limit": null },
    "docs": { "backend": "local", "parallel": true, "token_limit": null },
    "bugfix": { "backend": "local", "parallel": false, "token_limit": null },
    "refactor": { "backend": "local", "parallel": false, "token_limit": null }
  },
  "approval": {
    "routing_approval": false
  }
}
```

## Testing

```bash
npm test
```

Runs unit tests for:
- Classifier (8 tests)
- Router (5 tests)
- Database (4 tests)

## File Structure

```
orchestrator/
├── src/
│   ├── index.ts          # Entry point
│   ├── types.ts          # TypeScript interfaces
│   ├── config.ts         # Config loader
│   ├── db.ts             # SQLite schema + CRUD
│   ├── classifier.ts     # Auto-classification
│   ├── router.ts         # Tag-based routing
│   ├── sessions.ts       # Session management
│   ├── monitor.ts        # SSE event streaming
│   ├── memory.ts         # Conversation history
│   └── cli/
│       ├── index.tsx      # CLI entry point
│       ├── app.tsx        # Main app component
│       ├── adapter.ts     # OpenCode SDK adapter
│       ├── message.tsx    # Message component
│       ├── footer.tsx     # Token usage display
│       ├── tool-call.tsx  # Tool call visualization
│       ├── session-switcher.tsx
│       ├── permission-prompt.tsx
│       └── keybindings.ts
├── tests/
│   ├── classifier.test.ts
│   ├── router.test.ts
│   └── db.test.ts
├── routing.json
├── package.json
└── tsconfig.json
```

## Dependencies

- **better-sqlite3**: SQLite database
- **ink**: React renderer for terminal
- **@assistant-ui/react-ink**: Chat UI primitives
- **@opencode-ai/sdk**: OpenCode server client
- **tsx**: TypeScript execution
- **vitest**: Testing framework

## License

MIT
