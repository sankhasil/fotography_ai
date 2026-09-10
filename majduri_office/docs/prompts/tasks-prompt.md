# Task: Local/Zen mini-orchestrator for opencode-ui

Use the `plan-and-grill` skill for this task. Do not write or edit any code
until Phase 1 (Interview) below is fully resolved with the user.

## Goal

Build a small multi-agent orchestrator, inspired by the "hive" concept in
[Munder Difflin](https://github.com/chaitanyagiri/munder-difflin) (GOD agent
routes work between concurrent CLI sessions, shared memory/mailbox
coordination, human approval gate for risky actions) — but scoped down to
two backends instead of twelve engines and a full Electron UI:

1. **Local**: OpenCode's `ollama-qwen` provider (qwen2.5-coder family via
   `tools/ollama-tool-call-proxy.mjs` → Ollama on `:11434`).
2. **Hosted**: OpenCode Zen free-tier models (e.g. `opencode/big-pickle`).

The orchestrator assigns incoming tasks to one or more concurrent OpenCode
sessions based on tags, and can run several sessions in parallel.

## Fixed constraints — do not re-litigate these, they're already decided

- **Tag-driven routing.** Every task carries a tag. If the user supplies one,
  use it. If not, auto-classify the task by type (test, refactor, feature,
  docs, etc.) and use that as the tag. Tags decide both (a) which backend
  handles the task and (b) whether the task should be decomposed into
  parallel subtasks across multiple sessions.
- **Dual control on model selection.** The user can manually force a model
  switch at any time — that always wins. On top of that, an automatic router
  reassigns tasks based on: network/connectivity failure to a backend,
  token/context exhaustion (Zen free-tier rate limit, or local context
  window filling up), and the task's category/tag as the default policy
  when nothing else overrides it.
- **OpenCode executes tools, not the orchestrator.** Confirmed from OpenCode's
  actual source (`anomalyco/opencode`): tool execution — `bash`, `edit`,
  `glob`, `grep`, `question`, `read`, `skill`, `task`, `todowrite`,
  `webfetch`, `write` — lives inside each OpenCode session itself. The
  orchestrator's job is routing and coordination between sessions, never
  reimplementing what a tool does.
- **Hardware ceiling.** 16GB unified-memory Mac. Confirmed: MLX acceleration
  needs 32GB+ and silently doesn't activate below that, so local inference
  runs on Ollama's Metal/llama.cpp backend. Don't design around an assumption
  of fast local parallelism — running multiple concurrent local sessions on
  qwen2.5-coder simultaneously is likely to hit the same memory contention
  already documented for this machine.
- **Known proxy behavior to build on, not around.** The tool-call proxy
  already handles: buffered SSE rewriting (bare-JSON and `<tool_call>` XML
  formats), a tool-name alias table for hallucinated names
  (`write_file` → `write`, etc.), and per-request tool-offering logs
  (`[ollama-proxy] tools offered (...)`). Any orchestrator-level routing
  should sit in front of or alongside this proxy, not duplicate its parsing
  logic.
- **Zen free-tier is genuinely rate-limited.** Treat "token full" / quota
  exhaustion on Zen as an expected, regularly-occurring condition to design
  for, not an edge case.

## Phase 1 — Interview (required before any code)

Resolve each of these with the user, one at a time, in dependency order.
State your own recommended answer for each and ask for confirmation or a
correction — don't just open-question them cold.

1. **How are concurrent sessions actually spawned?** Options to weigh:
   real separate `opencode` CLI subprocesses (one per session, each with its
   own working directory/config — closer to Munder Difflin's `node-pty`
   model), vs. OpenCode's own built-in `task` subagent tool run from a single
   parent session, vs. multiple `opencode serve` instances on different
   ports coordinated externally. These have very different implementation
   costs and process-management burdens — this is the highest-leverage
   question to settle first.
2. **Where does shared/coordination state live?** Munder Difflin uses a
   local git repo of plain files (per-agent outbox/inbox, single-committer
   design to avoid `index.lock` corruption). Decide: same file-mailbox
   pattern, or something lighter (SQLite, a JSON state file, in-memory if
   the orchestrator is a single long-lived process)?
3. **What's the tag taxonomy?** Fixed enum (test/feature/refactor/docs/...)
   or open-ended free text the router pattern-matches on? Who maintains the
   routing policy per tag — a config file, or hardcoded logic?
4. **Concurrency safety on shared files.** If two sessions touch the same
   file or overlapping code, how is that prevented or resolved — per-session
   git worktrees (Munder Difflin's approach), a lock/claim mechanism, or
   scoping tags so parallel subtasks are guaranteed non-overlapping by
   design (e.g. only decompose across independent files/directories)?
5. **What exactly triggers "token full" detection?** Does the orchestrator
   parse Zen's rate-limit error response directly, track usage against a
   known quota proactively, or rely on request failures/timeouts as the
   signal? This determines whether failover is reactive (after a failed
   call) or proactive (before sending).
6. **Approval gate.** Munder Difflin escalates spend/destructive/scope
   changes to a human queue. Does this orchestrator need an equivalent, or
   is OpenCode's own existing permission system (ask/allow/deny per tool)
   sufficient here since each session is still a real OpenCode instance?
7. **Where does this live in the repo?** Proposed default: a new
   `open-code/orchestrator/` directory, sibling to `tools/`. Confirm or
   redirect.

Do not proceed to Phase 2 until all seven are resolved.

## Phase 2 — Plan and build

Once the interview is resolved, use `todowrite` to build an ordered task
list from the agreed answers and execute it step by step, per the
`plan-and-grill` skill's normal Phase 2 behavior — small verifiable steps,
one at a time, stating what changed after each.

## Definition of done

- A task with an explicit tag routes to the correct backend without manual
  intervention.
- An untagged task gets auto-classified and routed the same way.
- Forcing a manual model switch mid-task overrides the router's choice.
- Simulating a Zen quota/network failure causes automatic failover to local
  (or a clear, logged reason why it didn't).
- Two tagged subtasks can run concurrently without corrupting each other's
  file edits.