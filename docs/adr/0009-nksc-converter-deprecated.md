---
type: decision
title: NKSC Converter Deprecated — XMP to NX Studio Translation Too Lossy
status: deprecated
date: 2026-10-04
---

# ADR-0009: NKSC Converter Deprecated

## Context

The NKSC converter (`nef_editor/nksc.py`) was built to translate darktable XMP sidecars
into NX Studio `.nksc` sidecar files. The goal was to let the operator use the CLI's
classification + darktable presets and then open the same photos in NX Studio with the
edits applied.

## Decision

**Deprecate the NKSC converter.** The operator tested the generated `.nksc` files in
NX Studio and reported the results were worse than no sidecar at all.

## Consequences

- `nef_editor/nksc.py` is kept in the codebase for reference but should not be used.
- The `convert-nksc` CLI subcommand remains but is documented as deprecated.
- No `.nksc` files should be generated going forward.
- The XMP sidecar workflow (darktable) remains the primary path.

## Why it failed

The mapping between darktable modules and NX Studio filters is too lossy:

| darktable module | NX Studio filter | Problem |
|---|---|---|
| `exposure` | `nikon::ExposureSettings` | EV values don't map to NX Studio's Gain |
| `colorbalancergb` | `nikon::ExposureSettings` | Vibrance/saturation don't map to NX Studio's SaturationAdjustment |
| `toneequal` / `sigmoid` | (none) | Scene-referred tone modules have no NX Studio equivalent |
| `bilat` (clarity) | `nikon::ColorBalance` | Local contrast ≠ global contrast |
| `highlights` | `nikon::ActiveDLighting` | Highlight reconstruction ≠ D-Lighting |
| `lens` | `nikon::Distortion` | Lensfun profile ≠ Nikon's auto distortion |

A partial translation misleads the operator: the photo looks different from what darktable
would produce, and the operator cannot tell which adjustments were applied and which were lost.

## Alternatives considered

1. **Full fidelity translation** — would require reverse-engineering NX Studio's binary
   parameter blobs (Picture Control ExportData, WhiteBalance Data). Not feasible without
   Nikon's SDK documentation.

2. **Export JPEG from darktable, open JPEG in NX Studio** — works but loses raw latitude.
   The operator wanted to keep editing in NX Studio with raw data.

3. **Drop NX Studio, use darktable only** — the operator's preferred manual tool is
   NX Studio. Forcing darktable is not acceptable.

4. **Revisit later** — if Nikon publishes a public sidecar API, a proper converter
   could be built. Until then, the operator opens NEFs in NX Studio without sidecars
   and applies Picture Controls manually.

## Related

- [`research/darktable-modules-research.md`](../architecture/nef-editor-cli/research/darktable-modules-research.md)
  — confirmed `--core` is broken, XMP sidecars are the path
- [`nef_editor/nksc.py`](../../nef-editor/nef_editor/nksc.py) — the deprecated converter
