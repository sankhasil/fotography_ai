---
type: concept
title: NEF Photo Editor CLI — Implementation Plan
status: draft
date: 2026-10-02
revision: 3
supersedes: ../../nef-editor-cli-plan.md
---

# NEF Photo Editor CLI — Implementation Plan

Status: **revised after verification.** Revision 3 exists because measurement falsified most of
revision 1, and a wider search then falsified revision 2's premise. Every claim below traces to [`verification.md`](./verification.md).

## The finding that shaped everything

The operator's 209 `.nef` files are **NIKON Z 9 `High Efficiency*` (HE\*)** — Nikon's proprietary
compression, which **no open-source decoder can read**. Verified against LibRaw 0.22.1 and
darktable-cli 4.2.1, 5.0.1 and 5.6.1; all four refuse the files.

Revision 1 assumed a thin orchestrator around `darktable-cli`. Revision 2 assumed a proprietary Adobe
converter in front of it. **Revision 3 uses the fact that macOS ImageIO decodes HE\* natively** —
verified at full 45.7 MP resolution, with no licence gate and no third-party software. See
[ADR-0006](../../adr/0006-macos-imageio-decodes-he-star.md) and
[`he-decoder-research.md`](./he-decoder-research.md).

## Goal

Take a folder of Nikon `.nef` files, classify each photograph, apply a category-appropriate automatic
correction, and export a `.jpg` into a separate folder grouped by category, with the category written
into the image's EXIF. The originals are never modified.

## Pipeline

```
scan .nef files
  -> read EXIF            pure Python TIFF parser
  -> classify             ISO-based; category overrides
  -> decode HE* -> JPEG   sips / macOS ImageIO   (HOST, native)
  -> render               darktable-cli --core   (DOCKER)
  -> write category EXIF  pure Python
  -> record               SQLite
```

### Stage boundary

| Stage | Where | Why there |
|---|---|---|
| HE\* → JPEG | **Host (macOS)** | ImageIO decodes HE\* natively. Linux containers have no such decoder, and no open-source one exists |
| JPEG → corrected JPEG | **Docker** | darktable is well-tested in Linux; containerising pins 5.6.1. Verified working |

Stage one uses an **undocumented** macOS capability. It must probe for it at startup and fail loudly —
see [ADR-0006](../../adr/0006-macos-imageio-decodes-he-star.md).

### 1. Scan

Discover `.nef` files. `--recursive` descends. Files already processed and unchanged are skipped
before any expensive step.

### 2. Read EXIF — no external dependency

ISO, shutter, aperture and focal length are all in the **standard** EXIF IFD. A ~40-line pure-Python
TIFF parser reads them for 209/209 files.

**Contract:** metadata reading performs no subprocess call and imports no third-party package.

`ponytail:` `exiftool` and `rawpy` were both dropped. exiftool was only ever justified by Picture
Control, which we do not use. rawpy cannot read these files at all. Reintroduce either only against a
measured need.

### 3. Classify — deliberately smaller than revision 1

Measured against the real corpus:

| Category | How it is decided in v1 |
|---|---|
| `night` | **Automatic.** ISO ≥ 3200 → 56 of 209 files. |
| `landscape` | **Operator-assigned.** `--category landscape` |
| `portrait` | **Operator-assigned.** `--category portrait` |
| `macro` | **Operator-assigned.** `--category macro` |

**Only `night` is detected.** This is a real reduction in scope and the most likely thing to
disappoint. It is forced by evidence, not preference:

- The landscape rule (f/8–f/11) fires **0 times** — the 24-200mm f/4-6.3 never stops past f/6.3.
- The macro rule (focal ≤ 60 mm) means *wide*, not *close-up* — it is not measuring macro at all.
- The night rule's shutter test is **vacuous**: every shutter in the corpus is faster than 1/800 s.
- Portrait via face detection is **infeasible**: the largest preview embedded in the NEF is 384 × 256.

Classification is a pure function over a metadata dictionary, returning category, sub-style and the
ordered signals that fired. It never fails a run — unreadable files are recorded `unclassified`.

**v2 path, proven feasible but not built:** the NEF contains an uncompressed 384 × 256 RGB preview
that pure Python can extract without darktable. Colour statistics over that thumbnail could give a
coarse portrait/landscape split. It is not in v1 because it would ship a classifier nobody can
validate — we have no ground-truth labels for these photographs.

### 4. Select the correction

`correction = f(category, sub_style)` — a lookup into our own parameter table, translated into a
`darktable-cli --core` string.

Sub-style is **never detected**. It is an operator choice, defaulting to `neutral`.

Presets are **`--core` parameter sets, not darktable style files.** `--style` requires styles
imported into darktable's library database; dropping `.dtstyle` files into `styles/` does not work,
and seeding `librsqlite` headlessly is fragile. `--core` was verified to change output with no library
present. See [ADR-0003](../../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md) and
[`presets.md`](./presets.md).

### 5. Decode and render

```sh
# host — native HE* decode
sips -s format jpeg <source>/<name>.NEF --out <work_dir>/<name>.jpg

# docker — correction
darktable-cli <work_dir>/<name>.jpg <export_dir>/<category> --core "<params>"
```

Stage one runs on the host because ImageIO's HE\* decoder exists only on macOS. Stage two runs in
Docker where darktable 5.6.1 is pinned.

Output goes to `<export_dir>/<category>/` — **a separate sibling folder**, grouped by category.
Originals are never touched. Intermediates are deleted after a successful render.

**Trade-off, stated plainly:** stage one yields an 8-bit *rendered* JPEG, not raw data. Highlight
recovery and white-balance re-grading are therefore unavailable — they need raw. The v1 presets are
contrast, saturation, sharpening and noise reduction, all of which work on a decoded JPEG. If a preset
later needs latitude, `CIRAWFilter` replaces `sips` and the change is confined to stage one.

### 6. Write the category into the EXIF

Each exported JPEG carries its category in:

| Field | Value |
|---|---|
| `EXIF:ImageDescription` (270) | `nef-editor: <category>` |
| `EXIF:UserComment` (37510) | `<category>` |

**Contract:** the category is readable from the exported file with no reference to the database.

`ponytail:` written with `piexif` rather than by re-invoking exiftool. exiftool was deleted from the
dependency list; reintroducing a binary to write two fields would undo that.

### 7. Record

SQLite via the standard library. See [`database.md`](./database.md).

## Components

Three, plus a thin entrypoint. Same limit as revision 1.

| Component | Responsibility |
|---|---|
| `exif` | Pure-Python TIFF/EXIF reader. Also writes `ImageDescription` / `UserComment` on output. |
| `classify` | Pure functions: metadata in, category + sub-style + reasons out. |
| `store` | SQLite schema, idempotency lookup, record writes. |

Rendering is two subprocess calls at the orchestration layer — no engine abstraction, no base class.

## CLI surface

One command.

```
nef-editor <folder> [options]

  --out <dir>            Export root. Default: <folder>_exported
  --category <name>      portrait | landscape | macro | night
  --sub-style <name>     vivid | neutral | grey | monochrome. Default: neutral.
  --recursive            Descend into subfolders.
  --dry-run              Classify and report; convert nothing, write nothing.
  --force                Reprocess even when the idempotency key is unchanged.
  --db <path>            Database location. Default: <out>/.nef-editor/state.db
  --keep-intermediates   Do not delete the stage-one decodes.
```

`--category` exists because automatic classification will be wrong, and a human must be able to
correct it without editing configuration.

**Contract:** unknown flags and invalid enum values fail fast with a non-zero exit code naming the
accepted values.

## Dependencies

| Dependency | Role | Status |
|---|---|---|
| Python ≥ 3.11 stdlib | EXIF parsing, SQLite, CLI | Required |
| `piexif` | Write two EXIF fields into output JPEGs | Required — ~50 KB, pure Python |
| `darktable-cli` 5.6.1 | Render engine | Required — **Docker**, pinned |
| macOS ImageIO (`sips`) | HE\* decode | Required — **host**, ships with macOS |
| rawpy / LibRaw | — | **Rejected** — cannot read HE\* |
| exiftool | — | **Rejected** — pure Python covers all four signals |
| opencv-python / YuNet | — | **Rejected** — 384×256 preview is unusable |
| insightface + torch | — | **Rejected** — 2 GB for one infeasible signal |

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | ISO ≥ 3200 classifies as `night`, with the ISO value recorded in `reasons` | Unit test, no binaries |
| 2 | ISO < 3200 does **not** auto-classify as anything | Unit test |
| 3 | Classification returns non-empty reasons for every file, including failures | Unit test over empty/partial metadata |
| 4 | EXIF parsing returns ISO, shutter, aperture, focal for a Z 9 HE\* NEF | Integration test against a real fixture |
| 5 | Re-running over an unchanged folder processes nothing | Integration test, zero subprocess calls |
| 6 | `--dry-run` writes no image and no database row | Integration test |
| 7 | `--force` reprocesses an unchanged file | Integration test |
| 8 | Output lands in `<out>/<category>/`, never beside the original | Integration test |
| 9 | The source `.nef` is byte-identical after a run | Integration test comparing hashes |
| 10 | Each exported JPEG has `ImageDescription = "nef-editor: <category>"` | Integration test reading the output back |
| 11 | `--category` overrides detection; `--sub-style` sets the style | Unit test |
| 12 | An invalid enum exits non-zero naming accepted values | Unit test |
| 13 | darktable-cli applies `--core` and changes the output hash | Integration test against the pinned image |
| 14 | An unrenderable file is recorded with null output, and the batch continues | Integration test |

Criteria 1–3 and 11–12 need no binaries and no fixtures.

## Complexity Tracking

### Gate: Simplicity — passed

Two components became three (`exif` split out to own JPEG writing), still within the limit of three.
Non-goals are explicit. One documented exception below.

### Gate: Anti-abstraction — passed, one documented exception

No engine interface. The two render stages are two subprocess calls in the orchestration layer.
`--core` strings are data, not a strategy pattern.

**Exception:** the host/container stage split is real deployment complexity that revision 1 did not
have. Justification: macOS ImageIO's HE\* decoder exists only on macOS, and no open-source decoder
exists for Linux. The split is forced by the platform, not chosen. It is two documented commands, not
a distributed system.

### Gate: Testability — passed

Fourteen criteria, each with a stated verification method. Eight need no binaries.

## Risks

| Risk | Mitigation |
|---|---|
| macOS ImageIO's HE\* support is undocumented by Apple | Probe for it at startup and fail loudly. See ADR-0006 |
| Stage one yields 8-bit rendered JPEG — no raw latitude | v1 presets do not need it. `CIRAWFilter` is the escape hatch |
| 5.7 % shadow clipping in the decoded output | Undiagnosed. Compare against NX Studio before trusting the tone |
| Host/container split means the pipeline needs both macOS and Docker | Both are documented prerequisites; a `make verify` target runs both |
| `night`-only automatic classification limits the tool's value | Named explicitly rather than hidden behind a classifier that cannot work |
| HE\* support relies on an undocumented macOS capability that Apple could withdraw | Probe at startup and fail loudly; setting the camera to lossless removes the dependency entirely |

## References

- [`verification.md`](./verification.md) — measured evidence
- [`presets.md`](./presets.md) — the 16 corrections
- [`database.md`](./database.md) — schema and idempotency
- [ADR-0001](../../adr/0001-darktable-cli-as-render-engine.md) — superseded
- [ADR-0003](../../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md)
- [ADR-0004](../../adr/0004-read-exif-in-pure-python.md)
- [ADR-0005](../../adr/0005-he-requires-a-host-side-converter.md) — superseded
- [ADR-0006](../../adr/0006-macos-imageio-decodes-he-star.md)
- darktable-cli 5.6.1 `--help`; rawpy 0.27.1; exiftool 13.55
- [darktable #20841](https://github.com/darktable-org/darktable/issues/20841) — Nikon HE unsupported
- [LibRaw #668](https://github.com/LibRaw/LibRaw/issues/668) — Z8/Z9 NEF decode failures
- Nikon NX Studio download centre — system requirements