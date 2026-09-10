# DupeScope UI/Backend Enhancement — Large-Library + AI Culling Plan

> Target: handle photo libraries of **thousands of files** without the UI erroring or
> the backend running out of memory, with AI culling **always on**, socket-based
> job notifications, and a **scheduled job queue** with a memory guard.
>
> Doc format: one task per row. Owner column steers who implements:
> - **QWEN** — safe for a local Qwen2.5 coding subagent (boilerplate, isolated, mechanical).
> - **AGENT** — needs architectural judgment, review, or touches load-bearing code.
> - **BOTH** — Qwen scaffolds, main agent reviews & wires it together.

---

## Agreed decisions (from 2026-09-07 design session)

| # | Decision | Value |
|---|----------|-------|
| D1 | Memory guard | **Backlog (running + queued) ≥ 100 photos ⇒ reject new jobs with HTTP 503 "Queue full"**. Backlog = total photos across running + queued jobs. Drains as jobs complete. |
| D2 | Job execution | **Single FIFO worker** — one job runs at a time. Safest for ML memory (torch/CLIP loaded once). |
| D3 | AI culling | **HybridScorer decides (keep/delete), Ollama LLM adds a human-readable `reason`** per photo. |
| D4 | Large results table | **Use `react-window`** virtualization. |
| D5 | Notifications | **WebSocket event bus** at `WS /ws` (client subscribes to a `job_id`). Replaces HTTP polling. Fallback to polling if WS unavailable. |
| D6 | Scan size model | **One job = one whole folder** (cull ALL photos). Drop per-scan `offset/limit` pagination UI; the queue + 100-photo guard is the concurrency control. |
| D7 | `photos` global dict | **Remove**; replace with job-scoped metadata in `JobStore`, pruned when the job finishes. |
| D8 | ScanStage rescan bug | `ScanStage` currently **overwrites `ctx.images` with a full re-scan**, defeating pagination and doubling filesystem walks. Fix: reuse preloaded `ctx.images`. |

---

## Backend tasks

| ID | Task | Owner | Notes | Status |
|----|------|-------|-------|--------|
| B1 | Fix `ScanStage.run` to use preloaded `ctx.images` when present (skip `scan_images` re-walk). | **AGENT** | Kills the extra full-tree scan per job (D8). | ✅ done |
| B2 | Remove global `photos` dict; move photo metadata into job-scoped storage (JobStore or per-job dict pruned after `archived`/`reverted`/`error`). Update `mark-delete`, `delete`, `ArchiveStage`. | **AGENT** | Memory (D7). | ✅ done — `job_photos` job-scoped, pruned in `_cleanup_job` |
| B3 | `JobQueue` manager in `server.py` (or `dupescope/jobs.py`): FIFO list, single worker thread, backlog guard `DUPESCOPE_MAX_QUEUE_PHOTOS` (default 100), reject new with 503. Persist queue positions via `JobStore`. | **AGENT** | D1/D2. | ✅ done — FIFO queue + `_queue_worker_loop`, guard verified 503 |
| B4 | WebSocket event bus `WS /ws` + `subscribe {type, job_id}`; broadcast `queued`, `scanning`, `photo_done {index,total}`, `processing`, `ai_culling`, `processed`, `archiving`, `archived`, `error`. | **AGENT** | D5. | ✅ done — plus subscribe status snapshot on join |
| B5 | LLM reason stage: after `HybridScorer` decides, call Ollama (`OLLAMA_URL`, model `DUPESCOPE_OLLAMA_MODEL` default `llava`, optionally `qwen2.5-vl`) for a short keep/delete reason. Sequential, timeout, skip on failure. Emit `photo_done`. | **AGENT** | D3. | ✅ done — `LLMReasonStage` + `dupescope/llm.py` best-effort |
| B6 | `GET /jobs/list` endpoint → all jobs from `JobStore.list_jobs()` (status, folder, created_at, photo counts). | **QWEN** | Jobs list is pure read; `list_jobs()` already exists. | ✅ done — returns `{jobs, count}` |
| B7 | `GET /jobs/{job_id}/files?page=&limit=` → paged file rows (keep/delete, scores, `reason`), so the UI can window without loading 10k paths. | **QWEN** | Depends on report row shape from B5. | ✅ done — `{rows,total,page,limit}`, keep/search filters, limit≤200. `/jobs/{id}` no longer ships `details`. |
| B8 | BDD `tests/queue.feature` + `tests/test_queue.py`: submit accepted; >100-photo backlog ⇒ 503; queue drains; `GET /jobs/list` shape. Update `server.feature` for removed `offset/limit` and added endpoints. | **QWEN** | Mechanical Gherkin, following existing style. | ✅ done — queue.feature + test_queue.py (submit, 503, /jobs/list, WS snapshot, cancel scenario). |
| B9 | Config: read `DUPESCOPE_MAX_QUEUE_PHOTOS`, `DUPESCOPE_OLLAMA_URL`, `DUPESCOPE_OLLAMA_MODEL` from env with defaults. | **QWEN** | | ✅ done — defaults 100 / `http://localhost:11434` / `llava` |
| B10 | Report schema: per-file entries `{path, keep, reason, scores}` in `reportData`; summary counts stay (`exactGroups`, `similarGroups`, aiKeep/aiDelete derived). | **BOTH** | B5 changes producer; B7 consumes it. | ✅ done — `details` is canonical per-file truth; LLM reasons merged over hybrid; B7 serves it. |

---

## UI tasks

| ID | Task | Owner | Notes |
|----|------|-------|-------|
| U1 | AI culling **default ON** in `ScannerPanel`; label → "AI culling (Hybrid + LLM reasons)". | **QWEN** | |
| U2 | `useJobSocket` hook: connect `ws://localhost:5000/ws`, subscribe to job, apply status/progress/reason updates; degrade to 800ms polling on error. Wire into `App`/`ScannerPanel`. | **AGENT** | D5. | ✅ done — `src/useJobSocket.js`; ScannerPanel socket-first, poll fallback, `photo_done` progress, single terminal GET. |
| U3 | Queue panel: running + queued jobs, per-job status, progress, cancel queued job (needs `POST /jobs/{id}/cancel` on backend — add if missing, queued-only). | **BOTH** | | ✅ done — `QueuePanel.jsx` (3s refresh, status badge, cancel) + `POST /jobs/{id}/cancel` (queued-only, 409 otherwise). |
| U4 | Virtualize results table with `react-window` (`FixedSizeList`, compact fixed row height). Thousands of rows without DOM blowup. | **QWEN** | Add `react-window` dep. | ✅ done |
| U5 | Paged file fetch: when `allFiles.length` large, fetch rows via `GET /jobs/{id}/files` instead of shipping in job object. | **BOTH** | Depends on B7. | ✅ done — ResultsPanel always sources rows via B7 (server-side keep/search/paging + Load more); columns remapped to Overall/Quality/Aesth/Faces. |
| U6 | Progress bar: `PipelineBar` accepts optional `progress {done,total}`; render `done/total` + percent from `photo_done` events. | **QWEN** | Component-only; wiring via U2. |
| U7 | 503 "Queue full (≥100 photos)" banner in `ScannerPanel` on submit rejection. | **QWEN** | Client reads `error` from 503. |
| U8 | Remove Batch Size & Page controls from `ScannerPanel` (drop offset/limit); whole-folder job only. | **QWEN** | D6. |

---

## QWEN Batch 1 — queue for local subagent (self-contained, no blocker)

Run in one subagent pass. Criteria: **UI `npm run lint` and `npm run build` pass**, **backend `pytest -q` passes**.

| Task | Files to touch | Acceptance |
|------|----------------|-----------|
| U1 | `dupescope-ui/src/components/ScannerPanel.jsx` | `runAi` default `true`; checkbox label "AI culling (Hybrid + LLM reasons)". |
| U8 | `dupescope-ui/src/components/ScannerPanel.jsx` | Remove `LIMITS`, limit/offset state, Batch Size & Page UI block. |
| U6 | `dupescope-ui/src/components/UI.jsx` | `PipelineBar` gains optional `progress={{done,total}}`; shows "123 / 4,567 (3%)" when set. No regressions when unset. |
| U7 | `dupescope-ui/src/components/ScannerPanel.jsx` | On submit failure, if HTTP 503 show "Queue full — ≥100 photos scheduled. Try again later." |
| U4 | `dupescope-ui/package.json`, `dupescope-ui/src/components/ResultsPanel.jsx` | `npm i react-window`; table body rendered via `FixedSizeList` (fixed row height ≈ 37px); header stays sticky; per-row layout unchanged. |
| B6 | `dupescope-backend/server.py`, `dupescope-backend/dupescope/models/schemas.py`, `dupescope-backend/tests/` | `GET /jobs/list` returns `{jobs: [...], count}` from `JobStore.list_jobs()`; BDD scenario + step defs added; existing suite still green. |

---

## Phases

- **Phase 1 (AGENT, load-bearing):** B1–B5 — queue, guard, WS bus, LLM reasons, job-scoped memory. Do NOT let QWEN touch this yet. ✅ **DONE — verified via smoke script (15 checks) + pytest 17 passed.**
- **Phase 2 (subagent):** QWEN Batch 1 above (U1,U6,U7,U8,U4,B6). ✅ **DONE — UI lint/build pass, pytest green.**
- **Phase 3 (collaborative):** B7/B8/B9/B10 + U2/U3/U5 — wire WS into UI, queue panel, paged rows, env config. ✅ **DONE — backend 22 passed, UI lint (no new errors)/build pass, B7 contract smoke 9/9.**
- **Phase 4:** verification sweep — backend pytest, UI build, manual smoke with a large folder.

## Verification

- Backend: `.venv/bin/python -m pytest tests/ -q` all green.
- UI: `npm run lint` no new errors; `npm run build` succeeds.
- Manual: submit a scan; confirm WS updates arrive without polling; confirm results table scrolls smoothly with >1k files; confirm 2nd job while backlog ≥100 photos → 503 banner.