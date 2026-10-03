---
type: reference
title: Architecture
---

# Architecture

Implementation plans. One folder per feature. Each plan is the source of truth for its feature: code
serves the plan, never the reverse.

A plan folder holds:

| File | Contents |
|---|---|
| `plan.md` | Goals, pipeline, components, CLI surface, acceptance criteria, gates. Stays high-level and readable. |
| Supporting files | Schemas, contracts, matrices. Detail that would drown `plan.md` lives beside it. |

Decisions that are hard to reverse become ADRs under [`../adr/`](../adr/index.md). Diagrams are
Structurizr DSL under [`../diagrams/`](../diagrams/index.md).

## Features

### NEF Photo Editor CLI

| File | Type | Purpose |
|---|---|---|
| [Implementation Plan](./nef-editor-cli/plan.md) | concept | Goals, pipeline, components, acceptance criteria, constitutional gates |
| [Verification Findings](./nef-editor-cli/verification.md) | reference | Measured evidence: what was tested, what passed, what failed |
| [HE\* Decoder Landscape](./nef-editor-cli/he-decoder-research.md) | reference | Every route to decoding HE\*, and why macOS ImageIO won |
| [Preset Matrix](./nef-editor-cli/presets.md) | reference | The 16 corrections, their composition, and the authoring boundary |
| [Database Schema](./nef-editor-cli/database.md) | reference | The one table, the idempotency key, and failure recording |

Revision 3. Status: revised after verification. The HE\* decode stage is solved — macOS ImageIO,
verified at full resolution.

Read [`verification.md`](./nef-editor-cli/verification.md) first — it is the evidence base, and where
it disagrees with the plan, it wins.

Related: [ADR-0001](../adr/0001-darktable-cli-as-render-engine.md) (superseded),
[ADR-0002](../adr/0002-nef-editor-cli-gets-its-own-venv.md),
[ADR-0003](../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md),
[ADR-0004](../adr/0004-read-exif-in-pure-python.md),
[ADR-0005](../adr/0005-he-requires-a-host-side-converter.md) (superseded),
[ADR-0006](../adr/0006-macos-imageio-decodes-he-star.md).

Superseded research record: [NEF Photo Editor CLI — Draft Plan](../nef-editor-cli-plan.md).