---
type: concept
title: Project Documentation
version: 0.1.0
---

# Project Documentation

OKF bundle for the fotography_ai project. Concepts, howtos, ADRs, architecture, session journal. For humans and agents.

## Entries

### Architecture
- [Architecture](./architecture/index.md) — implementation plans, one folder per feature

### Howtos
- _none yet_

### Concepts
- [NEF Photo Editor CLI — Implementation Plan](./architecture/nef-editor-cli/plan.md) — revision 3, revised after verification
- [NEF Photo Editor CLI — Roadmap (Phases 1-4, revised)](./architecture/nef-editor-cli/roadmap.md) — revised after research falsified ADR-0003
- [NEF Photo Editor CLI — Phase 1 Cleanup Plan](./architecture/nef-editor-cli/phase-1-cleanup.md) — close open gaps in Phase 1
- [NEF Photo Editor CLI — Phase 2 Decode + Metadata](./architecture/nef-editor-cli/phase-2-decode-metadata.md) — CIRAWFilter 16-bit decode + expanded EXIF
- [NEF Photo Editor CLI — Phase 3 Workflow Engine](./architecture/nef-editor-cli/phase-3-workflow-engine.md) — XMP sidecar presets + JSON recipe
- [NEF Photo Editor CLI — Phase 3 Preview Classifier Plan](./architecture/nef-editor-cli/phase-3-preview-classifier.md) — `--category auto` via 384×256 preview
- [NEF Photo Editor CLI — Research Synthesis](./architecture/nef-editor-cli/research-synthesis.md) — 2026-10-04 findings that revised the roadmap
- [NEF Photo Editor CLI — Verification Findings](./architecture/nef-editor-cli/verification.md) — measured evidence; the plan's foundation
- [Nikon HE\* Decoder — Landscape and Findings](./architecture/nef-editor-cli/he-decoder-research.md) — every route tried, and why macOS ImageIO won
- [NEF Photo Editor CLI — Preset Matrix](./architecture/nef-editor-cli/presets.md) — the 16 corrections as `--core` parameter sets
- [NEF Photo Editor CLI — Database Schema](./architecture/nef-editor-cli/database.md) — one table, idempotency, failure recording

### Reference
- [Session Journal](./journal/index.md)
- [Architecture Decision Records](./adr/index.md)
- [Architecture Diagrams](./diagrams/index.md)

### Decisions
- [0001 — darktable-cli is the render engine](./adr/0001-darktable-cli-as-render-engine.md) — **superseded**
- [0002 — The NEF editor CLI gets its own venv](./adr/0002-nef-editor-cli-gets-its-own-venv.md) — accepted 2026-10-02
- [0003 — Presets are `--core` parameter sets](./adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md) — accepted 2026-10-02
- [0004 — Read EXIF in pure Python](./adr/0004-read-exif-in-pure-python.md) — accepted 2026-10-02
- [0005 — HE\* needs a host-side converter](./adr/0005-he-requires-a-host-side-converter.md) — **superseded**
- [0006 — macOS ImageIO decodes HE\*](./adr/0006-macos-imageio-decodes-he-star.md) — accepted 2026-10-02

### Research records
- The draft plan was deleted 2026-10-04; see git history for provenance.
