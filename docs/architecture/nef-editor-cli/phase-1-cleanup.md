---
type: concept
title: NEF Photo Editor CLI — Phase 1 Cleanup Plan
status: draft
date: 2026-10-04
revision: 1
part_of: ./roadmap.md
---

# Phase 1 Cleanup Plan

Phase 1 is built and verified. This plan closes the gaps the journal and a code review surfaced —
no new features, no new components. Every item below traces to a specific gap.

## Goal

Make Phase 1 the smallest version of itself that is safe to run on the operator's 209 photographs
without surveillance. Today the tool works, but two failures would be loud and slow: a missing
HE\* decoder produces 209 identical errors, and a per-photo container spawn makes the full run
~7 min slower than necessary.

## Items

### 1.1 — Wire `probe_decoder()` into `run()`

**Gap:** `pipeline.probe_decoder()` exists but is never called. A machine without HE\* support
would produce 209 identical `RuntimeError` rows in SQLite before failing.

**Change:** `run()` probes the first discovered `.nef` once before the loop. If the probe fails,
return a `RunResult` with `failed = len(files)` and a single `errors` entry: `HE* decode unavailable on this machine; see ADR-0006`. Do not iterate.

**Contract:** `--dry-run` skips the probe (no subprocess). The probe uses the first file, not a
synthetic one — a synthetic file would test `sips` itself, not HE\* support.

**Test:** `test_run_fails_loud_when_probe_fails` — monkeypatch `probe_decoder` to return `False`,
assert `result.failed == len(files)` and `result.errors[0]` mentions `ADR-0006`.

### 1.2 — Long-lived darktable container for the run

**Gap:** `render()` spawns `docker run --rm` per photo. Container startup is ~1 s; render is ~7 s.
For 56 night renders that is ~56 s of pure overhead, plus Docker daemon pressure.

**Change:** `run()` starts one container with `docker run --rm -i --entrypoint sh nef-editor-darktable:1`
kept alive on stdin, and `render()` writes one `darktable-cli` command per line to its stdin. The
container reads commands until `run()` closes stdin, then exits.

**Contract:** `render()` is still a pure function `decode_jpeg -> corrected_jpeg` from the caller's
view. The container handle is held in `run()`, not `render()`. If the container exits unexpectedly,
subsequent `render()` calls raise and the batch records the failure per existing behaviour.

**Test:** `test_render_uses_long_lived_container` — assert `subprocess.Popen` is called once for
the whole run, not once per photo. Mock the container's stdout to simulate darktable-cli output.

**Risk:** `docker run -i` reading commands from stdin is unusual. If it proves fragile, fall back
to `docker compose run` per batch. The phase plan records the decision either way.

### 1.3 — Cache darktable version per run

**Gap:** `_tool_versions()` does `docker run --rm --entrypoint darktable-cli nef-editor-darktable:1
--version` per render. For 56 renders that is 56 version queries.

**Change:** Compute `_tool_versions()` **once per `run()`**, before the loop. Pass the result into
`process_one()` as a parameter.

**Contract:** Tool versions are a property of the run, not of the photograph. A mid-run upgrade
is not a workflow this tool supports.

**Test:** `test_tool_versions_queried_once_per_run` — assert `subprocess.run` for `--version` is
called exactly once regardless of file count.

### 1.4 — `tests/test_integration.py`

**Gap:** `test_pipeline.py` line 7 references `tests/test_integration.py` as exercising the real
binaries. The file does not exist. AC #13 ("darktable-cli applies `--core` and changes the output
hash") is only tested with a mocked subprocess.

**Change:** Add `tests/test_integration.py` that:
- Skips with `pytest.skip` when `sips`, `docker`, or the `nef-editor-darktable:1` image are missing.
- Renders a single fixture JPEG through darktable-cli with two different `--core` strings.
- Asserts the two outputs differ in SHA-256 (closes AC #13).
- Stamps the category with `write_category` and reads it back (closes AC #10 against the real
  pipeline, not just the mocked one).

**Fixture:** the 1 × 1 base64 JPEG already in `test_pipeline.py` is too small for darktable's
parser. Use a real 1024 × 768 JPEG checked in under `tests/fixtures/integration.jpg` — ~50 KB.

**Contract:** integration tests never run in CI without Docker. They are the operator's local
verification, not a gate.

### 1.5 — `make verify` target

**Gap:** Plan risk mitigation names a `make verify` target. There is no `Makefile` in `nef-editor/`.

**Change:** Add `nef-editor/Makefile` with three targets:

```make
verify: unit integration

unit:
	.venv/bin/python -m pytest tests/ -q --ignore=tests/test_integration.py

integration:
	.venv/bin/python -m pytest tests/test_integration.py -q

full-run:
	.venv/bin/python -m nef_editor.cli $(PHOTOS) --out $(OUT) --recursive
```

**Contract:** `make verify` exits non-zero if any unit test fails or any integration test fails
without a skip. `make full-run` is a convenience wrapper, not a gate.

### 1.6 — `README.md` in `nef-editor/`

**Gap:** No operator-facing documentation. A new machine would have only `docs/architecture/` to
read, which is the blueprint, not the runbook.

**Change:** Add `nef-editor/README.md` with:
- One-paragraph description.
- Prerequisites: macOS with `sips`, Docker with `nef-editor-darktable:1` built.
- `make verify` and `make full-run` commands.
- Link to `docs/architecture/nef-editor-cli/plan.md` for the design.
- The HE\* caveat: macOS-only, undocumented by Apple, fail-loud probe at startup.

**Contract:** README is a howto. It does not duplicate the plan; it points to it.

### 1.7 — Delete superseded `docs/nef-editor-cli-plan.md`

**Gap:** Kept for provenance per the journal. `index.md` already registers it under "Research
records (superseded, kept for provenance)". The file itself is stale; revision 3 of the plan
supersedes it.

**Change:** Delete the file. Update `docs/index.md` to remove the link, with a one-line note:
"Draft plan deleted 2026-10-04; see git history for provenance."

**Contract:** Git history is the provenance record. A dead file in the tree is noise.

### 1.8 — Fix stale `docker/docker-compose.yml` comment

**Gap:** Lines 3-4 of `docker-compose.yml` reference "the Adobe DNG Converter step". ADR-0005 was
superseded by ADR-0006 the same day. The comment is wrong about the architecture.

**Change:** Replace the comment block. The compose file's only job is to mount source and output
for the darktable renderer; the host stage (`sips`) is not part of this compose file.

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | `run()` probes HE\* support once and fails loudly if missing | Unit test, mock `probe_decoder` |
| 2 | `docker run` is called once per `run()`, not per photo | Unit test, count `subprocess.Popen` calls |
| 3 | `_tool_versions()` is called once per `run()` regardless of file count | Unit test |
| 4 | `tests/test_integration.py` exists, skips without Docker, and verifies AC #13 | Manual: `make integration` on a Docker machine |
| 5 | `make verify` runs both suites and exits non-zero on any failure | Shell command |
| 6 | `README.md` exists and links to the plan | File exists |
| 7 | `docs/nef-editor-cli-plan.md` is deleted and `docs/index.md` notes its removal | `git log -- docs/nef-editor-cli-plan.md` |
| 8 | `docker-compose.yml` comment no longer mentions Adobe DNG | Grep `docker/docker-compose.yml` for "Adobe" |
| 9 | Full 209-file run completes in under 25 min measured | Manual run with `time` |
| 10 | All 66 existing tests still pass | `make unit` |

## Out of scope

| Item | Why |
|---|---|
| Preset parameter tuning | Phase 2 |
| Preview-based classification | Phase 3 |
| CIRAWFilter escape hatch | Built only if `sips` is withdrawn |
| Run history table | `database.md` is explicit: not now |
| Cross-platform support | macOS-only by design |

## Risks

| Risk | Mitigation |
|---|---|
| Long-lived container via stdin is fragile | Fall back to `docker compose run` per batch; record decision in `decisions.md` |
| Integration test fixture bloats the repo | 1024 × 768 JPEG at ~50 KB is acceptable; larger fixtures live outside the tree |
| `make verify` runs integration tests by default | Default `verify` runs unit only; `make integration` is separate. Document in README |

## Estimate

| Item | Effort |
|---|---|
| 1.1 probe wiring | 30 min |
| 1.2 long-lived container | 2 h |
| 1.3 version caching | 15 min |
| 1.4 integration tests | 1 h |
| 1.5 Makefile | 15 min |
| 1.6 README | 30 min |
| 1.7 delete draft | 5 min |
| 1.8 docker-compose comment | 5 min |
| **Total** | **~4.5 h** |

Plus the 209-file run: ~25 min wall clock, not development time.
