---
type: concept
title: NEF Photo Editor CLI — Draft Plan
status: superseded
date: 2026-10-02
superseded_by: ./architecture/nef-editor-cli/plan.md
---

# NEF Photo Editor CLI — Draft Plan

> **Superseded on 2026-10-02** by the [Implementation Plan](./architecture/nef-editor-cli/plan.md).
> All four Open Questions below are resolved; the decisions are recorded in the plan and in
> ADR-0001 and ADR-0002. This file is kept as the research record only — do not implement from it.

Status: **superseded.** See the implementation plan for the current blueprint.

## Goal

A Python CLI that takes a folder of Nikon `.nef` files, classifies each photo, applies a
category-appropriate automatic correction, and exports the result. Records everything in a
lightweight SQLite database. Non-destructive: original `.nef` is never modified.

## Why this is not "build a photo editor"

Research concluded that `darktable-cli` already performs the entire image pipeline:

    NEF decode -> auto-exposure -> color -> preset -> export -> XMP sidecar

So the deliverable is a **thin orchestrator**, not an image-processing engine. Roughly six
steps, no image math of our own. This follows the ponytail principle: prefer an existing
dependency over new code.

## Pipeline

1. Scan folder for `.nef` (recursive flag optional)
2. `exiftool` reads `Exif.Nikon3.PictureControl`, `NikonPc.*`, ISO, shutter, aperture, focal
3. Classify photo into a category
4. Select preset = category x sub-style -> darktable style
5. `darktable-cli` exports `.jpg` + `.xmp` sidecar
6. SQLite records the result

## OSS toolchain

| Tool | Role | Decision |
|---|---|---|
| darktable-cli | Full RAW develop engine, `--style` presets, XMP sidecars | **Primary engine** |
| rawtherapee-cli | Same job, 32-bit float, `.pp3` profiles | Rejected — redundant with darktable |
| rawpy (LibRaw 0.22.2) | NEF -> numpy | Only if we ever render ourselves |
| exiftool | Metadata read/write, Picture Control detection | Use |
| OpenCV | `xphoto.GrayworldWB`, face detection | Use |
| ImageMagick | Format ops | Probably unnecessary |
| lensfun | Lens profiles | Deferred |
| rawpy.enhance | Cross-batch hot/dead pixel repair | Deferred |

Running both darktable and rawtherapee is rejected: same job, two renders, wasted time.

## Categories and sub-styles

Categories: `portrait`, `landscape`, `macro`, `night`.

Each category has sub-styles: `vivid`, `monochrome`, `neutral` (and possibly `grey` as
distinct from `monochrome` — needs clarification).

## Classification signals (v1, no model download)

| Category | Signal | Cost |
|---|---|---|
| night | ISO >= 3200 AND shutter >= 1/30 | free (EXIF) |
| macro | focal <= 60mm AND f/4-f/8 AND min-focus metadata present | free (EXIF) |
| portrait | OpenCV face detection (YuNet) hits > 0 | ~5ms |
| landscape | fallback + wide focal + f/8-f/11 | free (EXIF) |

CLIP zero-shot classification is deferred behind an optional `--smart` flag. It would catch
semantics EXIF cannot ("a person on a beach" -> portrait vs landscape), but costs a ~400MB
model download plus torch. Add later if needed; dependency is hard to remove once baked in.

## Nikon Picture Control — known limitation

Nikon does **not** publish the math behind Picture Control, and nobody has reverse-engineered
it. We can **detect** which Picture Control a NEF was shot with (`Exif.Nikon3.PictureControl`,
`NikonPc.Name` / `NikonPc.Base` / `NikonPc.Adjust`), but we **cannot reproduce** what NX Studio
renders for it.

Consequence: templates are honest approximations, never pixel-identical to NX Studio. This must
be documented, not hidden.

## Database

SQLite (Python stdlib, zero dependencies). Records at minimum:

- source path, file hash or mtime for idempotency
- detected category + sub-style + why (the signals that fired)
- detected Picture Control
- applied preset name
- output path, output hash
- processing timestamp, tool versions

Idempotency matters: re-running the CLI on the same folder must not reprocess unchanged files.

## Open Questions (block the design)

1. **The main fork** — is depending on an external GPL binary (`darktable-cli`) acceptable?
   - Yes -> ~500 lines of orchestration, fastest path, best quality.
   - No, pure Python -> rawpy + numpy pipeline, 3-5x the work, worse demosaic and tone.
2. Is `grey` distinct from `monochrome`, or the same thing under two names?
3. Does the CLI modify the original `.nef`, or always write sidecar + separate output?
   (NX Studio has both modes: "Sidecar File" and "Original File".)
4. Output formats: `.jpg` only, or also 16-bit TIFF / PNG?

## Sources

- darktable-cli manpage (Debian/Ubuntu), docs.darktable.org 4.6
- rawtherapee-cli manpage, rawtherapee 5.x
- rawpy / LibRaw 0.22.2 release notes
- Nikon NX Studio product page and online help (Picture Controls Tool, NEF RAW Processing)
- Exiv2 Nikon MakerNote tag tables
- OpenCV xphoto module docs (GrayworldWB, LearningBasedWB)
- exiftool file-type support tables (NEF r/w)
- PIXLS.US thread on reverse-engineering Nikon Z-series lens correction metadata
- 2026 community preset research (Presetpedia, freepresets.com, Presetpro, Luttie)
