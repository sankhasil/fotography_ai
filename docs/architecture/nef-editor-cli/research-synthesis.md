---
type: reference
title: NEF Editor Research Synthesis — 2026-10-04 Findings
status: verified
date: 2026-10-04
---

# NEF Editor Research Synthesis — 2026-10-04

Four research agents investigated: CIRAWFilter (16-bit decode), darktable-cli modules,
Nikon NEF metadata, and category detection + JSON recipe format. A control test
verified the most critical finding. This file synthesises all four into the evidence
base for the revised roadmap.

## The finding that changes everything

**ADR-0003 is falsified.** The `--core "darktable.<module>:<param>=<value>"` syntax
in `presets.py` is silently ignored by darktable-cli 5.6.1. Verified by control test:

| Run | `--core` | SHA-256 (first 12 chars) | File size |
|---|---|---|---|
| 1 | none | `33e67a07e5e3` | 1,933,533 |
| 2 | none (control) | `716180935dc3` | 1,933,533 |
| 3 | `darktable.exposure:exposure=2.0;...` | `50fcbbedb739` | 1,933,533 |

Runs 1 and 2 differ — JPEG export is non-deterministic (timestamps, dither). The
identical file sizes across all three runs confirm no parameter was applied. The SHA
difference in ADR-0003's "verification" was this non-determinism, not `--core` parsing.

**What works:** `--conf plugins/imageio/format/jpeg/quality=30` → 296 KB;
`quality=100` → 3.5 MB. `--conf` is the real `--core` mechanism — for export settings
only, not module parameters.

## The four findings, summarised

### 1. `--core` → XMP sidecars (the pivot)

`darktable-cli <input> <xmp_sidecar> <output>` accepts an XMP sidecar carrying the full
history stack: modules, parameters, masks, module order. This is the **only** headless
mechanism for applying edits with masks.

Params are binary C-struct blobs. **Hand-crafting is fragile.** The reliable path:
author each preset in darktable GUI → save the `.xmp` sidecar → ship it with the CLI.

See [`research/darktable-modules-research.md`](./research/darktable-modules-research.md).

### 2. CIRAWFilter → 16-bit linear decode

`CIRAWFilter` (Core Image, macOS 12+) decodes NEF to 16-bit linear TIFF via
`pyobjc-framework-Quartz`. Exposes highlight recovery, shadow lift, white balance,
NR, lens correction. HE\* support is **assumed** (shared decoder with `sips`) —
needs a 1-line smoke test:

```python
import Quartz
f = Quartz.CIRAWFilter.alloc().initWithImageURL_(
    Quartz.NSURL.fileURLWithPath_("DSC_5128.NEF"))
print("OK" if f else "FAIL")
```

See [`research/cirawfilter-research.md`](./research/cirawfilter-research.md).

### 3. ~20 more EXIF tags in pure Python

The standard ExifIFD carries signals we're not reading yet — all reachable with
~20 lines added to the existing parser:

| Tag | Number | Signal |
|---|---|---|
| `SceneCaptureType` | 0xa306 | Camera's scene classification (Standard/Landscape/Portrait/Night) |
| `ExposureProgram` | 0x8822 | Manual/Aperture-priority/Portrait/Landscape/Sports/Macro |
| `ExposureBiasValue` | 0x9204 | EV compensation — stronger night signal than ISO alone |
| `LightSource` | 0x9208 | WB preset (Daylight/Cloudy/Auto/Tungsten) |
| `MeteringMode` | 0x9207 | Spot metering → portrait tell |
| `Flash` | 0x9209 | Fired/fill flash — portrait signal |
| `SubjectArea` | 0x9214 | Bounding box for primary subject |
| `FocalLengthIn35mmFilm` | 0xa305 | 35mm-equivalent focal |
| `LensModel`/`LensInfo` | 0xa434/0xa432 | Lens identity → lensfun lookup |
| `Saturation`/`Contrast`/`Sharpness` | 0xa309/0xa308/0xa30a | Camera "look" setting |

No MakerNote needed. See [`research/nef-metadata-research.md`](./research/nef-metadata-research.md).

### 4. Category detection — honest feasibility

| Category | Confidence | How |
|---|---|---|
| `night` | **high** | ISO ≥ 3200 + ExposureBiasValue. Already shipped. |
| `portrait` | **medium** | Skin-tone blob in 384×256 preview HSV. Phase 3. |
| `landscape` | **medium-low** | Blue+green dominance + low edge density. Coarse. |
| `architecture/street` | **low** | Edge density + focal length + low saturation. Overlaps landscape. |
| `product/food` | **infeasible** | No signal separates it from macro without depth or CNN. |

**3 of 5 detectable.** Product/food stays operator-assigned, like macro today.

See [`research/category-and-recipe-research.md`](./research/category-and-recipe-research.md).

## Architecture changes forced by these findings

| Was | Now | Why |
|---|---|---|
| `sips` 8-bit JPEG decode | `CIRAWFilter` 16-bit linear TIFF | Raw latitude for highlight/shadow/WB |
| `--core` string presets | XMP sidecar presets | `--core` silently ignored; XMP is the real path |
| Hand-tuned `--core` params | GUI-authored XMP sidecars shipped with CLI | Params are binary blobs; GUI authoring is reliable |
| 4 EXIF signals | ~24 EXIF signals | SceneCaptureType, ExposureProgram, ExposureBiasValue, etc. |
| 4 categories | 5 categories (night + portrait + landscape + architecture + product) | 3 auto-detectable, 2 operator-assigned |
| `presets.py` builds `--core` strings | `presets/` directory ships `.xmp` sidecars | One sidecar per category × sub-style = 20 files |

## What this means for the roadmap

The [roadmap](./roadmap.md) written earlier today needs revision. The phase ordering
changes:

- **Phase 1 cleanup** stays — probe wiring, long-lived container, integration tests,
  Makefile, README are still needed. But the integration test must verify XMP sidecar
  application, not `--core` strings.
- **Phase 2 (preset tuning)** is **absorbed into a new workflow engine phase** —
  because presets are now XMP sidecars authored in darktable GUI, not `--core` strings
  tuned in Python. The `compare` subcommand still applies; the tuning loop changes.
- **New: decode stage migration** — `sips` → `CIRAWFilter`. This is a prerequisite for
  the workflow engine because 16-bit linear input is what the new presets expect.
- **Phase 3 (preview classifier)** stays but benefits from the expanded EXIF reading
  (SceneCaptureType is a stronger signal than preview statistics alone).

The revised roadmap and the new workflow engine phase plan follow.
