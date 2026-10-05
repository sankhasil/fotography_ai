---
type: concept
title: NEF Photo Editor CLI — Phase 2 Decode Migration + Metadata Expansion
status: draft
date: 2026-10-04
revision: 1
part_of: ./roadmap.md
---

# Phase 2 — Decode Migration + Metadata Expansion

> **Revised 2026-10-04**: Items 2.5 and 2.6 are verified useless against the
> operator's real corpora (357 NEFs). SceneCaptureType is always `Standard`,
> ExposureBiasValue is never >= 1.0 EV. Both are dropped from classification.
> The CIRAWFilter smoke test (Item 2.1) PASSED on both corpora.

> Research on 2026-10-04 confirmed CIRAWFilter as the 16-bit decode path and found
> ~20 more EXIF tags readable in pure Python. This phase builds both. See
> [`research/cirawfilter-research.md`](./research/cirawfilter-research.md) and
> [`research/nef-metadata-research.md`](./research/nef-metadata-research.md).

## Goal

Migrate the decode stage from `sips` (8-bit rendered JPEG) to CIRAWFilter (16-bit
linear TIFF), preserving raw latitude for highlight recovery, shadow lift, and
white-balance re-grading. Expand the EXIF reader from 4 signals to ~24, adding the
camera's own scene classification and lens identity.

## Item 2.1 — CIRAWFilter smoke test

**Before any code:** confirm CIRAWFilter opens a Z 9 HE\* file.

```python
import Quartz
f = Quartz.CIRAWFilter.alloc().initWithImageURL_(
    Quartz.NSURL.fileURLWithPath_("DSC_5128.NEF"))
print("OK", f.nativeSize()) if f else print("FAIL")
```

If `FAIL`: fall back to `sips` 8-bit for Phase 2; CIRAWFilter becomes Phase 3's
escape hatch instead of Phase 2's decode path. Document in an ADR.

If `OK`: proceed. Pin `pyobjc-framework-Quartz` as a dependency.

**Contract:** the smoke test is run once, manually, and the result recorded in
`decisions.md` before any code is written.

## Item 2.2 — `decode()` migrates to CIRAWFilter

**Change:** `pipeline.decode()` calls CIRAWFilter via pyobjc instead of `sips`.

```python
import Quartz
from Foundation import NSURL
from CoreGraphics import CGColorSpaceCreateWithName, kCGColorSpaceLinearSRGB

def decode(src: Path, dest: Path) -> Path:
    f = Quartz.CIRAWFilter.alloc().initWithImageURL_(
        NSURL.fileURLWithPath_(str(src)))
    if f is None:
        raise RuntimeError(f"CIRAWFilter cannot decode {src.name}")
    # Highlight recovery on by default — the reason we moved from sips
    f.setHighlightRecoveryEnabled_(True)
    f.setBoostAmount_(0.0)  # defeat Apple's default tone curve for linear output
    img = f.outputImage()
    ctx = Quartz.CIContext.context()
    cs = CGColorSpaceCreateWithName(kCGColorSpaceLinearSRGB)
    ctx.writeTIFFRepresentation_of_to_format_colorSpace_options_(
        img, NSURL.fileURLWithPath_(str(dest)),
        Quartz.CIFormat.RGBAh, cs, None)
    return dest
```

**Contract:** output is 16-bit half-float linear TIFF (`RGBAh`), ~200-400 MB per
file. The downstream `render()` stage (darktable) reads this TIFF instead of an 8-bit
JPEG.

**Risk:** `boostAmount=0` may not fully defeat the tone curve. The smoke test must
verify the output mean is ~0.1-0.3 (linear), not ~0.37 (tone-mapped).

**Test:** `test_decode_produces_16bit_tiff` — mock `Quartz.CIRAWFilter` to return a
known CIImage, assert `writeTIFFRepresentation` is called with `RGBAh` and
`linearSRGB`. No real NEF needed.

## Item 2.3 — `pyobjc-framework-Quartz` dependency

**Change:** add `pyobjc-framework-Quartz` to `requirements.txt`. ~30 MB wheel.
macOS-only — the project is already macOS-only for the decode stage.

**Contract:** the dependency is imported only in `pipeline.py` (or a new
`decode.py` module). `classify.py`, `presets.py`, `store.py` do not import it.

## Item 2.4 — Expand EXIF reader

**Change:** `exif.py` reads ~20 more tags from the standard ExifIFD. The existing
`_read_ifd` walker already handles the structure; this adds tag constants and
extraction logic.

New tags:

| Tag | Number | Type | Field in `Metadata` |
|---|---|---|---|
| `SceneCaptureType` | 0xa306 | SHORT | `scene_capture_type: int \| None` |
| `ExposureProgram` | 0x8822 | SHORT | `exposure_program: int \| None` |
| `ExposureBiasValue` | 0x9204 | SRATIONAL | `exposure_bias: float \| None` |
| `LightSource` | 0x9208 | SHORT | `light_source: int \| None` |
| `MeteringMode` | 0x9207 | SHORT | `metering_mode: int \| None` |
| `Flash` | 0x9209 | SHORT | `flash: int \| None` |
| `FocalLengthIn35mmFilm` | 0xa305 | SHORT | `focal_35mm: int \| None` |
| `LensModel` | 0xa434 | ASCII | `lens_model: str \| None` |
| `LensInfo` | 0xa432 | RATIONAL[4] | `lens_info: tuple \| None` |
| `Saturation` | 0xa309 | SHORT | `saturation_setting: int \| None` |
| `Contrast` | 0xa308 | SHORT | `contrast_setting: int \| None` |

`SceneCaptureType` values: 0=Standard, 1=Landscape, 2=Portrait, 3=Night scene.
`ExposureProgram` values: 0=Not defined, 1=Manual, 2=Normal, 3=Aperture priority,
4=Shutter priority, 5=Creative, 6=Action, 7=Portrait, 8=Landscape, 9=Macro.

**Verified 2026-10-04**: `SceneCaptureType` is `Standard` (0) and `ExposureProgram`
is `Shutter speed priority AE` (4) for all 370 files in the operator's two corpora.
Both are useless for classification but still worth reading for the record/DB.

**Contract:** all new fields are optional in `Metadata`. A malformed file yields
`None` for any subset. The existing 4 signals still read for 209/209 files.

**Test:** `test_read_scene_capture_type` — synthetic TIFF with a `SceneCaptureType=2`
entry, assert `metadata.scene_capture_type == 2`. Same pattern for each new tag.

## Item 2.5 — `SceneCaptureType` in classification

**VERIFIED USELESS 2026-10-04**: 370/370 files in the operator's two corpora
(FotoDump + Travemunde) write `SceneCaptureType = Standard`. The camera never
writes Portrait, Landscape, or Night scene. This tag is dropped from the plan.
Do not implement classification based on it.

## Item 2.6 — `ExposureBiasValue` in night detection

**VERIFIED USELESS 2026-10-04**: 0/370 files have ExposureBiasValue >= 1.0 EV.
The operator never pushes exposure compensation. This tag is dropped from the
night detection enhancement. Night detection stays ISO-only (>= 3200), which
is already shipped and working.

## Item 2.7 — Preview histogram for QC

**Change:** `exif.py` (or a new `preview.py`) extracts the 384×256 preview and
computes a histogram. The histogram is stored in the `Metadata` or a new
`PreviewData` dataclass.

```python
@dataclass(frozen=True, slots=True)
class Histogram:
    blown_highlights: int    # pixels at 255 in any channel
    crushed_shadows: int     # pixels at 0 in all channels
    mean_luminance: float
    mean_r: float
    mean_g: float
    mean_b: float
```

**Contract:** the histogram is for QC triage, not fine-grained decisions. If
`blown_highlights > threshold`, the recipe records a warning. darktable's own
highlight recovery (in the XMP sidecar) handles the actual fix.

**Test:** `test_histogram_from_solid_color_preview` — synthetic 384×256 solid
gray, assert `mean_luminance == 128`, `blown_highlights == 0`.

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | CIRAWFilter smoke test passes on a real Z 9 HE\* NEF | Manual, recorded in `decisions.md` |
| 2 | `decode()` produces a 16-bit linear TIFF | Integration test, `sips -g pixelDepth` on output |
| 3 | Output mean luminance is ~0.1-0.3 (linear, not tone-mapped) | Manual, `sips -g meanLuminance` or Python check |
| 4 | `LensModel` reads for all 209 files | Manual |
| 5 | Night detection uses ISO (already shipped, unchanged) | Existing unit test |
| 6 | Preview histogram computes from 384×256 preview | Unit test with synthetic TIFF |
| 7 | All 66 existing tests still pass | `make unit` |

## Dependencies

| Dependency | Role | Status |
|---|---|---|
| `pyobjc-framework-Quartz` | CIRAWFilter bridge | **New** — ~30 MB, macOS-only |

## Risks

| Risk | Mitigation |
|---|---|
| CIRAWFilter doesn't handle HE\* | Smoke test first; fall back to `sips` 8-bit if needed |
| `boostAmount=0` doesn't fully defeat tone curve | Verify mean luminance; pass `linearSRGB` explicitly |
| `downloadResources` needed for Z 9 | Warm cache once while online; fail with useful error if offline |
| `SceneCaptureType` is always 0 (Standard) | Verify against 209 corpus; if useless, rely on Phase 4 preview |
| 16-bit TIFF is 200-400 MB per file | Intermediates deleted after render (existing behaviour) |

## Estimate

| Item | Effort |
|---|---|
| 2.1 smoke test | 30 min |
| 2.2 decode migration | 3 h |
| 2.3 dependency | 15 min |
| 2.4 EXIF expansion | 3 h |
| 2.5 SceneCaptureType in classify | 1 h |
| 2.6 ExposureBiasValue in night | 1 h |
| 2.7 preview histogram | 2 h |
| **Total** | **~10.5 h** |
