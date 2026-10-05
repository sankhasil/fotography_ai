---
type: concept
title: NEF Photo Editor CLI — Phase 3 Preview Classifier Plan
status: draft
date: 2026-10-04
revision: 1
part_of: ./roadmap.md
---

# Phase 3 Preview Classifier Plan

> **Revised 2026-10-04**: SubIFD 3 is grayscale (1 sample/pixel), NOT RGB.
> Classification now uses SubIFD 2 (1620x1080 color JPEG, 861 KB) instead.
> Pillow is needed to decode the JPEG — already a Phase 3 dependency.
> Verified on 357 NEFs across two corpora: all have SubIFD 2 color JPEG.

`plan.md` §3 names a v2 path: the NEF contains a 1620 × 1080 color JPEG preview (SubIFD 2) that
Pillow can decode without darktable. Colour statistics over that preview could give a coarse
portrait/landscape split. This phase builds it.

**Why now:** Phase 2 tunes the 16 presets. The classifier only decides *which* preset to apply;
it does not change what the presets are. Building Phase 3 before Phase 2 would mean classifying
into untuned presets. Building it after means classifying into presets the operator has signed off
on. Order matters.

## Goal

Add `--category auto` to the CLI. When set, the classifier uses the 1620 × 1080 color preview's colour
statistics to choose between `portrait` and `landscape` for photographs that are not `night`.
`night` remains ISO-based. The operator's `--category <name>` still wins; `auto` is a third option,
not a replacement.

## What the preview can and cannot tell us

The 1620 × 1080 preview is a rendered color JPEG, not raw data. It has already been tone-mapped
by the camera. What it preserves:

| Signal | Why it is there |
|---|---|
| Mean luminance | Bright scene vs dark scene |
| Saturation distribution | Saturated colours (portrait/skin) vs muted (landscape) |
| Colour histogram | Skin-tone cluster (portrait) vs blue/green dominance (landscape) |
| Aspect ratio | 3:2 either way — not useful on a Z 9 |

What it cannot tell us:

| Signal | Why it is gone |
|---|---|
| Subject distance | No depth data in a 2D thumbnail |
| Face presence | YuNet feasibility at 1620 × 1080 needs re-verification (see `verification.md`, tested 384 × 256) |
| True scene type | A dog in a field reads as "landscape" by colour stats |

The classifier is **honest about its limits**: it produces `portrait` or `landscape` with a
confidence score, and a third class `unsure` when the score is below threshold. `unsure` falls back
to the existing `UNCLASSIFIED` path — no preset, recorded with reasons.

## Items

### 3.1 — Extract the 1620 × 1080 color JPEG preview from the NEF

**Need:** the preview exists in the file (`verification.md` §"Face detection — infeasible from NEF").
Today nothing reads it. `exif.py` reads metadata; this is image data.

**Change:** add `nef_editor/preview.py` with `extract_preview(path: Path) -> bytes` returning the
1620 × 1080 RGB raster decoded from the SubIFD 2 JPEG. The JPEG is a compressed preview already
rendered by the camera — decode it with Pillow (already a Phase 3 dependency for the `compare`
subcommand) to get RGB pixel data.

The extraction walks SubIFDs (tag 0x014a), reads SubIFD 2's StripOffsets/StripByteCounts (or
JPEGInterchangeFormat/JPEGInterchangeFormatLength), extracts the JPEG bytes, and decodes with
Pillow. The TIFF parser in `exif.py` already walks IFDs; `preview.py` reuses that walker.

**Contract:** `extract_preview` never raises. A malformed file returns an empty `bytes`. The
caller treats empty bytes as "no preview available" and the classifier falls back to
`UNCLASSIFIED`.

**Test:** `test_extract_preview_returns_1620x1080_for_synthetic_tiff` — construct a minimal TIFF in
memory with one SubIFD 2 JPEG strip of known dimensions, assert `extract_preview` returns the right
decoded bytes. No fixture file needed.

### 3.2 — Preview feature vector

**Need:** the classifier needs a fixed-size numerical description of the preview, not the raw
raster.

**Change:** add `features(preview: bytes, width: int, height: int) -> PreviewFeatures` in
`preview.py`. `PreviewFeatures` is a frozen dataclass with a small, fixed set of fields:

```python
@dataclass(frozen=True, slots=True)
class PreviewFeatures:
    mean_luminance: float
    mean_saturation: float
    skin_tone_ratio: float       # fraction of pixels in the skin-tone blob
    blue_green_ratio: float      # blue+green pixels / total, landscape signal
    warm_cool_balance: float     # mean hue angle in degrees, 0-360
    edge_density: float          # fraction of edge pixels, architecture/street signal
```

Six features. Five are derived from the 1620 × 1080 color raster with arithmetic (no numpy); edge
density uses Pillow's edge filter (Pillow is the JPEG decode dependency). The skin-tone test is a
fixed HSV range, documented in `preview.py`. The blue-green test is a fixed saturation/luminance
gate.

**Contract:** features are deterministic. The same preview always yields the same vector. The
classifier downstream is also deterministic — no randomness anywhere in the path.

**Test:** `test_features_for_a_solid_color_preview` — feed a synthetic 1620 × 1080 raster of solid
blue, assert `blue_green_ratio == 1.0`, `skin_tone_ratio == 0.0`, `edge_density == 0.0`,
`mean_saturation` matches.

### 3.3 — Portrait/landscape classifier

**Need:** turn the feature vector into a category, with confidence.

**Change:** add `classify_preview(features: PreviewFeatures) -> PreviewClassification` in
`preview.py`:

```python
@dataclass(frozen=True, slots=True)
class PreviewClassification:
    category: Literal["portrait", "landscape", "unsure"]
    confidence: float            # 0.0 to 1.0
    reasons: tuple[str, ...]
```

Threshold-based, not a model. Initial thresholds are **provisional**, recorded in `preview.py`
with `ponytail:` comments, and tuned against the operator's labels (item 3.4). The classifier is
~30 lines of `if` statements over the six features.

**Contract:** `unsure` is a first-class output. A photograph that scores below the `unsure`
threshold falls back to `UNCLASSIFIED` and is recorded with the feature values in `reasons` so the
operator can see why.

**Test:** `test_classify_preview_returns_portrait_for_skin_dominant` — synthetic features with
`skin_tone_ratio=0.6`, assert `category == "portrait"`. Same pattern for landscape and unsure.

### 3.4 — Classifier validation set

**Need:** the classifier is threshold-based. Thresholds need a ground truth to tune against.

**Change:** the operator labels a subset of the 209 corpus. The labels live in
`nef-editor/tests/fixtures/labels.json`:

```json
{
  "DSC_5128.NEF": "portrait",
  "DSC_5129.NEF": "landscape",
  "DSC_5130.NEF": "night",
  ...
}
```

A test runs the classifier over every labelled file and reports accuracy per class. The test is
marked `@pytest.mark.labelset` and is **not** part of `make verify` — it is the operator's
validation, not a gate.

**Contract:** the labels are the operator's judgment. They are not committed if the operator does
not want to label 100+ files; a 20-file subset is enough to set thresholds. The accuracy target is
**stated in this plan after the first validation run**, not before. There is no a priori target —
the classifier either reaches a useful rate or it does not, and if it does not, the plan documents
that and the operator keeps `--category` as the path.

**Test:** `test_classifier_accuracy_on_labelled_set` — runs the classifier, asserts accuracy is at
or above the recorded target. Skipped if `labels.json` does not exist.

### 3.5 — Wire `--category auto` into the CLI

**Need:** expose the classifier without breaking existing behaviour.

**Change:** extend `cli.py` so `--category` accepts `auto` in addition to the four category names.
When `auto` is set, `pipeline.process_one` calls the preview classifier after the existing
`night` detection. Order:

```
1. existing: if ISO >= 3200, category = NIGHT
2. new:      else if --category auto, extract preview, classify_preview
3. existing: else if --category <name>, category = <name>
4. existing: else, category = UNCLASSIFIED
```

`auto` is a fifth value of `--category`, not a separate flag. `auto` means "use the classifier"; an
explicit category still wins over `auto` because it is a different value of the same flag.

**Contract:** `auto` never produces `UNCLASSIFIED` silently — if the classifier returns `unsure`,
the photograph is recorded `UNCLASSIFIED` with the feature vector in `reasons`, same as today.

**Test:** `test_auto_uses_preview_when_not_night` — mock `extract_preview` and `classify_preview`,
assert the recorded category is what the mock returned. `test_auto_does_not_override_night` — high
ISO still classifies `night` even with `--category auto`.

### 3.6 — ADR for the classifier decision

**Need:** shipping a classifier is harder to reverse than not shipping one. Once `--category auto`
exists, removing it breaks operator workflows.

**Change:** write `docs/adr/0007-preview-based-classifier.md` (Nygard format) before
implementation. Decision: extract the 1620 × 1080 color JPEG from SubIFD 2, derive six features, threshold-classify
into `portrait` / `landscape` / `unsure`. Alternatives considered: CLIP zero-shot (400 MB model),
YuNet face detection (infeasible at 384 × 256; re-verify at 1620 × 1080), no classifier (Phase 1 status quo).

The ADR is written **before** the code, not after. If the validation set in 3.4 shows the
classifier is unusable, the ADR is marked `deprecated` and the code is not written.

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | `extract_preview` returns 1620 × 1080 color JPEG bytes from SubIFD 2 for a synthetic TIFF | Unit test, no fixture |
| 2 | `features` returns a deterministic `PreviewFeatures` for a given raster | Unit test, solid-colour cases |
| 3 | `classify_preview` returns `portrait`, `landscape`, or `unsure` with confidence and reasons | Unit test per branch |
| 4 | `--category auto` is accepted by the CLI and reaches the preview path | Unit test with mocked preview |
| 5 | `--category auto` does not override `night` detection | Unit test, high ISO + auto |
| 6 | `--category auto` with `unsure` falls back to `UNCLASSIFIED` with feature vector in reasons | Unit test |
| 7 | An explicit `--category <name>` still wins over `auto` (because it is a different value of the same flag) | Unit test |
| 8 | Accuracy on the labelled subset is recorded in `phase-3-preview-classifier.md` after validation | Manual, then doc update |
| 9 | ADR-0007 exists and is linked from `docs/adr/index.md` | File exists |
| 10 | All 66 + new tests pass | `make unit` |

## Dependencies

| Dependency | Role | Status |
|---|---|---|
| Pillow | Decode SubIFD 2 JPEG preview; edge-density filter | Already installed (Phase 2) |

Pillow (added in Phase 2) is now used in Phase 3 to decode the 1620 × 1080 color JPEG from SubIFD 2
and to compute edge density via its filter kernel. No new install is needed. The remaining features
(luminance, saturation, hue, skin-tone ratio, blue-green ratio) are computed with arithmetic over
the decoded raster, not image operations.

## Out of scope

| Item | Why |
|---|---|
| `macro` auto-detection | The macro rule conflated wide with close-up; preview stats cannot tell close-up from wide. Stays operator-assigned |
| CLIP zero-shot | 400 MB model, deferred behind `--smart` per `plan.md` |
| Per-photograph sub-style inference | Sub-style is aesthetic intent, not a scene property. `presets.md` is explicit |
| A confidence calibration curve | Threshold-based, not probabilistic. The "confidence" field is informational, not a probability |

## Risks

| Risk | Mitigation |
|---|---|
| Classifier accuracy is too low to ship | ADR-0007 marked `deprecated`; `--category auto` not released; status quo holds |
| Skin-tone test is biased to one skin tone | Documented in `preview.py`; revisited when the validation set is diverse |
| 1620 × 1080 SubIFD 2 JPEG is gone on a future Z body | `extract_preview` returns empty bytes; classifier falls back to `UNCLASSIFIED` |
| SubIFD location changes between bodies | The TIFF walker already handles arbitrary IFD locations; tested with synthetic TIFF |
| Feature vector grows over time | Frozen dataclass; new features require a schema change and a re-validation pass |

## Estimate

| Item | Effort |
|---|---|
| 3.1 preview extraction | 4 h |
| 3.2 feature vector | 3 h |
| 3.3 classifier | 2 h |
| 3.4 validation set | operator's labelling time + 1 h test |
| 3.5 CLI wiring | 2 h |
| 3.6 ADR-0007 | 1 h |
| **Total dev** | **~13 h** plus operator labelling |

Labelling time is not estimated. A 20-file subset is the minimum; more labels improve threshold
confidence.
