---
type: reference
title: Architecture Decision Records
---

# Architecture Decision Records

One file per decision, named `NNNN-kebab-title.md` (zero-padded, monotonically increasing).

## Required frontmatter
- `type: decision`
- `title:`
- `status:` — `proposed` | `accepted` | `deprecated` | `superseded`
- `date:` — `YYYY-MM-DD`

## Body sections (Nygard format)
1. Context
2. Decision
3. Consequences
4. Alternatives considered

## Records

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](./0001-darktable-cli-as-render-engine.md) | darktable-cli is the render engine; rawpy is a narrow fallback | **superseded** | 2026-10-02 |
| [0002](./0002-nef-editor-cli-gets-its-own-venv.md) | The NEF editor CLI gets its own venv, not dupescope-backend's | accepted | 2026-10-02 |
| [0003](./0003-presets-are-core-parameter-sets-not-darktable-styles.md) | Presets are `--core` parameter sets, not darktable style files | accepted | 2026-10-02 |
| [0004](./0004-read-exif-in-pure-python.md) | Read EXIF in pure Python; no exiftool, no LibRaw | accepted | 2026-10-02 |
| [0005](./0005-he-requires-a-host-side-converter.md) | HE\* needs a host-side converter; the container renders only | **superseded** | 2026-10-02 |
| [0006](./0006-macos-imageio-decodes-he-star.md) | macOS ImageIO decodes HE\*; no Adobe dependency | accepted | 2026-10-02 |

Two records were superseded by measurement. ADR-0001 after verification against the operator's real
photographs falsified its rawpy fallback and its assumption that darktable could read the files.
ADR-0005 the same day, when a wider search found macOS ImageIO decodes HE\* natively and removed the
Adobe dependency it had introduced.
