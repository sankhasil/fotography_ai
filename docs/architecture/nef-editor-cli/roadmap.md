---
type: concept
title: NEF Photo Editor CLI — Roadmap (Phases 1-4, revised after research)
status: draft
date: 2026-10-04
revision: 2
part_of: ./plan.md
supersedes_revision: 1
---

# NEF Photo Editor CLI — Roadmap (Phases 1-4)

> **Revision 2** — research on 2026-10-04 falsified ADR-0003 (`--core` is silently
> ignored) and confirmed CIRAWFilter as the 16-bit decode path. The phase ordering
> changed. See [`research-synthesis.md`](./research-synthesis.md) for the evidence.

Phase 1 is built (66 tests, end-to-end verified on 3 night renders) but its preset
system is **non-functional** — the `--core` strings in `presets.py` are silently
ignored. This roadmap orders the fix and the remaining work into four phases.

## Phase ordering

```
Phase 1          Phase 2          Phase 3              Phase 4
cleanup    →     decode +         workflow engine  →   preview
(XMP fix)        metadata         + XMP sidecars       classifier
                 (CIRAWFilter)    + JSON recipe        (SceneCaptureType)
                                  + tuning
```

Each phase is **independently shippable**. Phase 1 cleanup keeps the tool working
while fixing the broken preset path. Phase 2 gives us raw latitude. Phase 3 builds
the real preset system. Phase 4 expands auto-detection.

## Phase 1 — close gaps + fix the broken preset path

**Detailed plan:** [`phase-1-cleanup.md`](./phase-1-cleanup.md) (revision 2 pending)

| Item | Why |
|---|---|
| Wire `probe_decoder()` into `run()` | Missing HE\* support → 209 identical errors |
| Long-lived darktable container | Per-photo spawn is ~7 s/photo overhead |
| Cache darktable version per run | `_tool_versions()` spawns docker per render |
| `tests/test_integration.py` | Referenced but missing; must verify XMP sidecar application (NOT `--core`) |
| `make verify` target | Plan risk mitigation names one |
| `README.md` | Operator-facing docs |
| Delete superseded `docs/nef-editor-cli-plan.md` | Provenance is in git |
| Fix stale `docker-compose.yml` comment | References Adobe DNG (ADR-0005 superseded) |
| **Supersede ADR-0003** | `--core` strings are silently ignored; move to XMP sidecars |
| **Fix `presets.py`** | Replace `--core` string builder with XMP sidecar selector |

**Acceptance:** `make verify` passes; integration test proves an XMP sidecar changes
the output (not `--core` non-determinism).

## Phase 2 — decode migration + metadata expansion

**Detailed plan:** [`phase-2-decode-metadata.md`](./phase-2-decode-metadata.md)

| Item | Why |
|---|---|
| CIRAWFilter smoke test | Confirm HE\* support before committing |
| `decode()` migrates from `sips` to CIRAWFilter | 16-bit linear TIFF preserves raw latitude |
| `pyobjc-framework-Quartz` dependency | Python bridge to Core Image |
| Expand EXIF reader: ~20 new tags | SceneCaptureType, ExposureProgram, ExposureBiasValue, LensModel |
| `SceneCaptureType` in classification | Camera's own scene classification — strongest free signal |
| `ExposureBiasValue` in night detection | EV compensation strengthens the night signal beyond ISO alone |
| `LensModel`/`LensInfo` for lensfun | darktable's `lens` iop auto-applies from EXIF; we just need to enable it in the XMP |
| Preview histogram for QC | Computed from 384×256 preview; flags blown highlights / crushed shadows |

**Acceptance:** decode produces 16-bit linear TIFF; `SceneCaptureType` reads for all
209 files; night detection uses ISO + ExposureBiasValue.

## Phase 3 — workflow engine + XMP sidecar presets + JSON recipe

**Detailed plan:** [`phase-3-workflow-engine.md`](./phase-3-workflow-engine.md)

This is the phase inspired by the operator's pro photo editor prompt. It builds the
real preset system: XMP sidecars authored in darktable GUI, a JSON recipe layer, and
the baseline + genre + QC workflow.

| Item | Why |
|---|---|
| Author 20 XMP sidecars in darktable GUI | 5 categories × 4 sub-styles; one `.xmp` per preset |
| `presets/` directory in `nef-editor/` | Ships the sidecars; CLI selects by category + sub-style |
| `pipeline.render()` uses XMP sidecar | `darktable-cli <input> <xmp> <output>` — the real path |
| JSON recipe layer | `metadata + preview → JSON recipe → XMP selection + darktable apply` |
| Recipe stored in SQLite `correction` column | Replaces the `--core` string; human-reviewable |
| Baseline workflow in every sidecar | Lens correction, highlight recovery, WB, vibrance before saturation |
| Genre-specific workflow per category | Portrait: skin tone lock, eye enhancement; Landscape: sky/foreground masks; Architecture: perspective; Product: neutral WB + edge sharpening |
| QC guardrail checks | Preview histogram: blown highlights, crushed shadows → flag in recipe |
| `compare` subcommand | Side-by-side grid for tuning |
| ISO-driven night NR | darktable's `denoiseprofile` scales with ISO |

**Acceptance:** 20 XMP sidecars shipped; each produces a visible correction vs
uncorrected; JSON recipe recorded for every processed photo.

## Phase 4 — preview classifier + expanded auto-detection

**Detailed plan:** [`phase-4-preview-classifier.md`](./phase-4-preview-classifier.md) (revision 2 pending)

| Item | Why |
|---|---|
| Extract 384×256 preview from NEF | Pure Python; SubIFD3 |
| Preview feature vector | Luminance, saturation, skin-tone ratio, blue-green ratio, edge density |
| Portrait/landscape classifier | Threshold-based on features + SceneCaptureType |
| Architecture/street classifier | Edge density + focal length + low saturation (low confidence) |
| `--category auto` | Uses preview classifier when not night |
| `SceneCaptureType` as primary signal | Camera's own classification — strongest free signal |
| `ExposureProgram` as secondary | Portrait/Landscape/Macro mode hints |
| `product/food` stays operator-assigned | Infeasible from metadata alone |

**Acceptance:** `--category auto` matches operator labels on night, portrait, and
landscape at an agreed rate. Architecture/street and product/food remain
operator-assigned.

## What the roadmap does NOT include

| Out of scope | Reason |
|---|---|
| Cross-platform support | macOS-only; CIRAWFilter and HE\* decode are macOS-only |
| A GUI | The plan is a CLI tool |
| Run history in SQLite | `database.md` is explicit: not now |
| CLIP zero-shot classification | 400 MB model; deferred behind `--smart` |
| Adobe DNG Converter | Ruled out by verification |
| Product/food auto-detection | Infeasible without depth or CNN |
| Hand-crafting XMP params blobs | Fragile; GUI authoring is the reliable path |

## HE\* fallback

If macOS ImageIO's HE\* support is withdrawn, CIRAWFilter **is** the fallback — it
is the upgrade path we're already building in Phase 2. If CIRAWFilter also loses HE\*
support, the camera's lossless compression setting removes the dependency entirely.

## Constitutional gates (Brahma)

### Gate: Simplicity — passed

- Phase 1 adds 0 components; fixes the broken preset path
- Phase 2 migrates 1 function (`decode`) and expands 1 module (`exif`)
- Phase 3 adds 1 subcommand (`compare`) and ships data files (`.xmp`); no new Python modules
- Phase 4 adds 1 module (`preview`); total 4 components (within plan's ≤3+CLI)

### Gate: Anti-abstraction — passed

- XMP sidecars are data files, not a strategy pattern
- CIRAWFilter is one function call via pyobjc, not a decoder abstraction
- JSON recipe is a plain dict, not a framework

### Gate: Testability — passed

| Phase | Without binaries? |
|---|---|
| 1 | Probe wiring: yes. Integration: needs Docker. XMP application: needs Docker. |
| 2 | EXIF expansion: yes (synthetic TIFF). CIRAWFilter: needs macOS + NEF. |
| 3 | Recipe generation: yes. Sidecar selection: yes. Sidecar authoring: GUI. |
| 4 | Preview extraction: yes (synthetic). Classifier: yes (pure functions). |

## Handoff

Blueprint complete. Phase 1 cleanup is the next build target — it fixes the broken
preset path while keeping the tool working. Phases 2-4 are planned in detail and
ready when Phase 1 ships.
