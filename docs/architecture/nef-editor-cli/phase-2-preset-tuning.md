---
type: concept
title: NEF Photo Editor CLI — Phase 2 Preset Tuning Plan
status: draft
date: 2026-10-04
revision: 1
part_of: ./roadmap.md
---

# Phase 2 Preset Tuning Plan

The 16 preset names are fixed by [`presets.md`](./presets.md). Their `--core` parameter magnitudes
in `nef_editor/presets.py` are provisional — defensible starting values, not a tuned result.
Tuning is **visual iteration against real photographs**: pick a representative photo, render it
several ways, choose, record. This phase builds the workflow that loop requires, not the tuned
values themselves.

## Goal

A reproducible tuning loop where:
1. The operator picks one photograph per category.
2. Runs `nef-editor compare <photo>` and sees the candidate renderings side by side.
3. Chooses a parameter set, updates `presets.py`, commits.
4. Repeats until all 16 presets have the operator's sign-off.

When the loop closes, `presets.md` records the final `--core` values per cell and the fixture
corpus is committed, so a future re-tune starts from "what did we ship?" not "what was in the
codebase?".

## Items

### 2.1 — `nef-editor compare` subcommand

**Need:** today the operator must run `nef-editor` four times per photograph (uncorrected, neutral,
vivid, grey, monochrome) and eyeball the results. That is error-prone and slow.

**Change:** add a `compare` subcommand to `cli.py` that, for one source `.nef`, produces a single
grid image:

```
+----------+----------+----------+----------+----------+
| original | neutral  | vivid    | grey     | monochrome |
+----------+----------+----------+----------+----------+
```

The "original" cell is the `sips`-decoded JPEG with no `--core` applied. The other four are the
same JPEG rendered through darktable-cli with the category's preset at each sub-style. The category
is taken from `--category` (since `compare` is for tuning, not classification).

**Implementation:**
- `cli.py` parses `compare <photo> --category <name> [--out <path>]`.
- Reuses `pipeline.decode` and `pipeline.render` — no new image code.
- Composes the grid with `PIL` (Pillow) — already a Python ecosystem staple, but **new dependency**.
  See "Dependencies" below.
- Default output: `./compare-<basename>-<category>.jpg` in CWD.

**Contract:** `compare` writes one file. It does not write to SQLite, does not mutate the
preset table, and does not run idempotency checks.

**Test:** `test_compare_writes_one_grid_image` — mock `decode` and `render` to return known
fixtures, assert the grid is written and is `5 × 1` cells. No PIL dependency in the test.

### 2.2 — Sample fixture corpus

**Need:** tuning needs representative photographs, not synthetic bytes.

**Change:** commit four `.nef` files under `nef-editor/tests/fixtures/`:
- `fixture-portrait.nef`
- `fixture-landscape.nef`
- `fixture-macro.nef`
- `fixture-night.nef`

One per category, chosen by the operator from the 209 corpus. Small subset is deliberate — these
are references, not a benchmark.

**Contract:** fixtures are real NEFs the operator vouches for. They are not committed if the
operator does not have redistribution rights. If the operator cannot commit them, they live in
`~/Pictures/nef-editor-fixtures/` and the runbook references that path.

**Risk:** NEFs are 30-35 MB each; four fixtures is ~130 MB in the repo. Acceptable for a personal
tool; would not be acceptable for a public package.

### 2.3 — `presets.md` parameter table

**Need:** `presets.md` today fixes the names and structure, deliberately leaving values to
iteration. After tuning, the values are no longer provisional. They must be recorded where the
contract lives, not only in code.

**Change:** extend `presets.md` with one section per category, listing the final `--core` string
per sub-style. The code in `presets.py` remains the source of truth at runtime; the doc is the
record of why those values, and what was tried before them.

**Contract:** a value in `presets.py` that disagrees with `presets.md` is a defect. The doc's
"Authoring the presets" section stays — it describes the loop, not the values.

### 2.4 — Tuning runbook

**Need:** the loop is human-in-loop. It must be documented so it is reproducible six months from
now.

**Change:** add `docs/architecture/nef-editor-cli/tuning-runbook.md` (OKF `type: howto`) with:

```
1. Pick a fixture from tests/fixtures/ (or your own photo).
2. Run: nef-editor compare <photo> --category <name> --out /tmp/grid.jpg
3. Open /tmp/grid.jpg. Compare the four sub-styles to the original.
4. If none are right, edit presets.py and re-run. Commit only when satisfied.
5. Once a category is tuned, repeat for the other three.
6. Update presets.md with the final values.
```

Plus a section on ISO-driven `night` noise reduction (the one parameter that must scale with the
photograph's ISO, per `presets.md` line 107).

### 2.5 — ISO-driven `night` noise reduction

**Need:** `presets.md` notes that `night` NR must scale with the photo's ISO. ISO 3200 and ISO 25600
need different NR; a fixed value is wrong at both ends. The current `presets.py` has a fixed
`shadows=0.400`.

**Change:** `build_correction(category=NIGHT, sub_style=...)` accepts the photograph's ISO and
scales the `darktable.denois` or equivalent parameter. The scaling function is small and named
in `presets.py`. The relationship is documented in `presets.md`.

**Contract:** for ISO below the night threshold, the function is not called. For ISO above, the
NR parameter is a monotonic function of ISO — more ISO, more NR. The exact curve is a tuning
decision, recorded in `presets.md`.

**Test:** `test_night_nr_scales_with_iso` — assert that `build_correction(NIGHT, NEUTRAL, iso=25600)`
produces a stronger NR parameter than `iso=3200`. No binaries.

## Dependencies

| Dependency | Role | Status |
|---|---|---|
| Pillow (PIL) | Compose the 5-cell grid for `compare` | **New**. ~5 MB. The only image manipulation the project does itself. |

Pillow is the **only** new dependency. It is added because the alternative — composing a grid
with `sips` and shell scripting — is more code than the dependency costs. Revisit if a no-deps
path becomes obvious.

`ponytail:` adding PIL for one subcommand is the kind of speculative dependency the rules warn
against. Justification: the grid is the *entire output* of `compare`, and writing a JPEG grid
composer in pure Python is several hundred lines of byte-format code that already exists in PIL.
The dependency is scoped to the `compare` subcommand — `presets.py`, `pipeline.py`, and
`classify.py` do not import it.

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | `nef-editor compare <photo> --category <name>` writes a 5-cell grid JPEG | Unit test with mocked stages |
| 2 | The grid's "original" cell has no `--core` applied; the other four do | Unit test, assert `render` is called 4 times with non-empty corrections |
| 3 | `compare` does not write to SQLite | Unit test, assert no `Store` is opened |
| 4 | Four fixtures exist under `tests/fixtures/` or the runbook names their on-disk path | Manual check |
| 5 | `presets.md` records the final `--core` values for all 16 cells | Manual review |
| 6 | `presets.py` and `presets.md` agree on every value | Unit test that loads `presets.md` and parses the values, comparing to `build_correction` output |
| 7 | `night` NR scales monotonically with ISO above the threshold | Unit test |
| 8 | `tuning-runbook.md` exists and is linked from `presets.md` | File exists |
| 9 | All 16 presets have the operator's "this is an improvement over the original" sign-off | Manual, recorded in `decisions.md` |

## Out of scope

| Item | Why |
|---|---|
| Auto-tuning via objective metrics | Tuning is a human judgment about aesthetics, not an optimization |
| More sub-styles | `presets.md` fixes the four; new styles need an ADR |
| A web UI | The CLI is the tool |
| Per-photograph preset selection | Sub-style is the operator's choice by design |

## Risks

| Risk | Mitigation |
|---|---|
| Pillow adds maintenance weight | Confined to `compare`; one subcommand. If it breaks, the main pipeline does not |
| Tuning takes longer than estimated | It is human-in-loop; the plan provides the loop, not the time |
| Fixtures bloat the repo | One-time 130 MB cost; `git LFS` is overkill for a personal tool |
| `night` NR scaling curve is wrong | Recorded in `presets.md`; revisited on the first high-ISO batch |

## Estimate

| Item | Effort |
|---|---|
| 2.1 `compare` subcommand | 3 h |
| 2.2 fixture corpus | 30 min (operator picks) |
| 2.3 `presets.md` parameter table | 1 h (post-tuning) |
| 2.4 tuning runbook | 1 h |
| 2.5 ISO-driven night NR | 2 h |
| **Tuning itself** | **operator's time, not development time** |
| **Total dev** | **~7.5 h** |

Tuning is open-ended. The plan does not estimate it; the runbook describes it.
