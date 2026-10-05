---
type: reference
title: NEF Editor Plan Verification — 2026-10-04
status: verified
date: 2026-10-04
---

# NEF Editor Plan Verification Matrix

Verified against two real corpora:
- **FotoDump**: 196 top-level NEFs (Nikon Z 9, HE\*, 24-200mm f/4-6.3)
- **Travemunde Strand Dracen**: 161 NEFs (same body/lens, **new corpus not in prior research**)

## Verification summary

| # | Claim in the plan | Verdict | Evidence |
|---|---|---|---|
| 1 | `--core` strings apply presets | **FALSE** | Control test: 2 runs with no `--core` already differ in SHA. `--core` is silently ignored. ADR-0003 falsified. |
| 2 | `--conf` can set module parameters | **FALSE** | `--conf plugins/darkroom/exposure/exposure=2.0` produces identical output size. Only export-format keys work (`quality=30` → 296 KB). |
| 3 | CIRAWFilter decodes HE\* | **TRUE** | Both corpora: `CIRAWFilter.initWithImageURL_` returns non-nil, `nativeSize=8256×5504`, highlight recovery supported. |
| 4 | CIRAWFilter outputs 16-bit linear TIFF | **TRUE** | 346.7 MB TIFF, 8256×5504, decoded in 3.42 s. |
| 5 | darktable reads CIRAWFilter TIFF | **TRUE** | `darktable-cli` rendered the 16-bit TIFF to a 13.6 MB JPEG. |
| 6 | `SceneCaptureType` aids classification | **FALSE** | 370/370 files = `Standard`. Useless on this operator's corpus. |
| 7 | `ExposureProgram` aids classification | **FALSE** | 370/370 files = `Shutter speed priority AE`. Useless. |
| 8 | `ExposureBiasValue` aids night detection | **FALSE** | 0/370 files have EV ≥ 1.0. The operator never pushes exposure. |
| 9 | SubIFD 3 is a 384×256 **RGB** preview | **FALSE** | SubIFD 3 is **grayscale** (spp=1, photometric=1, 98 KB). The plan assumed RGB. |
| 10 | SubIFD 0 has a color JPEG preview | **TRUE** (new finding) | 8256×5504 RGB JPEG, 4.3 MB, in all 357 files. This is the full-res rendered preview. |
| 11 | SubIFD 2 has a medium color JPEG | **TRUE** (new finding) | 1620×1080 RGB JPEG, 861 KB, in all 357 files. Better for classification than the grayscale SubIFD 3. |
| 12 | `sips` decodes HE\* on both corpora | **TRUE** | FotoDump: 8256×5504 JPEG. Travemunde: 8256×5504, 9.8 MB. |
| 13 | EXIF reader works on both corpora | **TRUE** | 0/357 files have missing ISO. All 4 signals read. |
| 14 | 66 unit tests pass | **TRUE** | 66/66 in 8.20 s. |
| 15 | `--conf write_sidecar_files=always` generates sidecars via CLI | **FALSE** | No XMP produced. Sidecar authoring requires darktable GUI. |
| 16 | pyobjc-framework-Quartz is in the venv | **FALSE** (now fixed) | Was missing; installed during this verification. Must be added to `requirements.txt`. |

## Classification breakdown (real data)

| Corpus | Files | night (ISO ≥ 3200) | unclassified | night % |
|---|---|---|---|---|
| FotoDump | 196 | 55 | 141 | 28% |
| Travemunde | 161 | 5 | 156 | 3% |
| **Total** | **357** | **60** | **297** | **17%** |

Travemunde is a **daytime beach corpus** — 45 of 161 files (28%) are shot at 24mm
(wide angle), consistent with landscape photography. 97% are unclassified by the
current `night`-only detector.

## Failure matrix — what's broken and what to do

| # | Component | Status | Fix needed | Phase |
|---|---|---|---|---|
| F1 | `presets.py` — `--core` strings | **BROKEN** | Replace with XMP sidecar selection. Author 20 sidecars in darktable GUI. | Phase 1→3 |
| F2 | `pipeline.render()` — passes `--core` | **BROKEN** | Change to `darktable-cli <input> <xmp> <output>` (second positional arg). | Phase 1→3 |
| F3 | `pipeline.decode()` — uses `sips` (8-bit) | **WORKING but limited** | Migrate to CIRAWFilter (16-bit linear). `pyobjc-framework-Quartz` must be added to `requirements.txt`. | Phase 2 |
| F4 | Classification — `night` only | **WORKING but incomplete** | 83% of files are unclassified. Need preview-based portrait/landscape detection. Use SubIFD 2 (1620×1080 color JPEG) instead of SubIFD 3 (grayscale). | Phase 4 |
| F5 | Phase 2 plan — `SceneCaptureType` classification | **USELESS** | Drop from plan. Camera always writes `Standard`. | Phase 2 revision |
| F6 | Phase 2 plan — `ExposureProgram` classification | **USELESS** | Drop from plan. Camera always writes `Shutter speed priority AE`. | Phase 2 revision |
| F7 | Phase 2 plan — `ExposureBiasValue` night detection | **USELESS** | Drop from plan. Operator never pushes exposure. | Phase 2 revision |
| F8 | Phase 3/4 plan — SubIFD 3 "RGB" preview | **WRONG** | SubIFD 3 is grayscale. Use SubIFD 2 (1620×1080 color JPEG) for classification. Needs Pillow to decode JPEG. | Phase 4 revision |
| F9 | `probe_decoder()` — not wired into `run()` | **BROKEN** | Wire it. Missing HE\* → 357 identical errors. | Phase 1 |
| F10 | `_tool_versions()` — spawns docker per render | **SLOW** | Cache once per run. | Phase 1 |
| F11 | `tests/test_integration.py` — referenced but missing | **MISSING** | Create. Must verify XMP sidecar application, not `--core`. | Phase 1 |
| F12 | `docker-compose.yml` — stale Adobe DNG comment | **STALE** | Fix comment. | Phase 1 |
| F13 | `docs/nef-editor-cli-plan.md` — superseded draft | **STALE** | Delete; provenance is in git. | Phase 1 |
| F14 | No `Makefile` | **MISSING** | Add `make verify`, `make unit`, `make integration`. | Phase 1 |
| F15 | No `README.md` in `nef-editor/` | **MISSING** | Add operator docs. | Phase 1 |
| F16 | No XMP sidecar presets authored | **MISSING** | Author 20 `.xmp` files in darktable GUI (5 categories × 4 sub-styles). | Phase 3 |

## What works (keep these)

| # | Component | Status | Notes |
|---|---|---|---|
| W1 | Pure-Python EXIF reader | ✅ | 357/357 files, 0 missing ISO |
| W2 | `night` classification (ISO ≥ 3200) | ✅ | 60 night files across both corpora |
| W3 | SQLite store + idempotency | ✅ | mtime + size, upsert |
| W4 | CLI argument parsing | ✅ | All flags working |
| W5 | Docker image `nef-editor-darktable:1` | ✅ | darktable 5.6.1, fedora:44 |
| W6 | `sips` HE\* decode | ✅ | Both corpora, full resolution |
| W7 | CIRAWFilter HE\* decode | ✅ | Both corpora, 16-bit, 3.4 s/file |
| W8 | darktable reads CIRAWFilter TIFF | ✅ | 13.6 MB JPEG output |
| W9 | SubIFD 0 color JPEG in NEF | ✅ | 8256×5504, all 357 files — no `sips` needed for preview |
| W10 | SubIFD 2 color JPEG in NEF | ✅ | 1620×1080, all 357 files — ideal for classification |
| W11 | 66 unit tests | ✅ | 8.20 s |

## Revised plan priorities

| Priority | Item | Why |
|---|---|---|
| **P0** | Fix `presets.py` + `render()` to use XMP sidecars | Current presets have zero effect on output |
| **P0** | Wire `probe_decoder()` into `run()` | Missing HE\* = 357 identical errors |
| **P1** | Add `pyobjc-framework-Quartz` to `requirements.txt` | Installed but not committed |
| **P1** | Migrate `decode()` from `sips` to CIRAWFilter | Raw latitude for highlight/shadow/WB |
| **P1** | Add `tests/test_integration.py` | Verify XMP sidecar actually changes output |
| **P2** | Drop `SceneCaptureType`/`ExposureProgram`/`ExposureBiasValue` from Phase 2 plan | Verified useless on this corpus |
| **P2** | Fix Phase 4 plan: use SubIFD 2 (color JPEG), not SubIFD 3 (grayscale) | SubIFD 3 is grayscale, not RGB |
| **P2** | Author 20 XMP sidecar presets in darktable GUI | The real preset system |
| **P3** | Build preview classifier using SubIFD 2 (1620×1080 color) | 83% of files are unclassified |

## ISO distribution (both corpora)

### FotoDump

| ISO range | Count | Classification |
|---|---|---|
| 200-900 | 82 | unclassified |
| 1000-2200 | 51 | unclassified |
| 2500-3100 | 8 | unclassified |
| 3200-5000 | 21 | **night** |
| 6400-12800 | 3 | **night** |
| 25600 | 31 | **night** |

### Travemunde Strand Dracen

| ISO range | Count | Classification |
|---|---|---|
| 500-900 | 63 | unclassified |
| 1000-2200 | 71 | unclassified |
| 2500-3100 | 22 | unclassified |
| 3200-4500 | 5 | **night** |

## Focal length distribution (Travemunde)

| Focal | Count | Likely category |
|---|---|---|
| 24mm | 45 (28%) | landscape / architecture (wide) |
| 44-73mm | 12 | portrait / street |
| 86-200mm | 14 | portrait / detail |
| unclassified | 90 | needs preview analysis |

This is a **landscape-heavy corpus** that the current `night`-only classifier
completely misses. 156 of 161 files (97%) would need `--category landscape` to
get a preset applied.
