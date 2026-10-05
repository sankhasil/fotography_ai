# NEF Photo Editor CLI

Classify Nikon Z 9 NEF photographs and write XMP sidecars next to them so
darktable's GUI loads the matching preset automatically. Originals are never
modified — the NEF stays as the master with full raw latitude.

## Prerequisites

- **macOS** (for CIRAWFilter HE\* decode; the main sidecar path needs no decode)
- **Python 3.11+** in a virtualenv at `.venv/`
- **darktable** (GUI, for authoring preset sidecars and for manual editing)
- Docker is **optional** — only needed for JPEG preview export, not for sidecar writing

### Install Python dependencies

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

## Usage

```sh
# Dry run — classify and report, write nothing
.venv/bin/python -m nef_editor.cli ~/Pictures/MyPhotos --dry-run

# Full run — classify, write XMP sidecars next to NEFs
.venv/bin/python -m nef_editor.cli ~/Pictures/MyPhotos --recursive

# Assign a category manually (only 'night' is auto-detected)
.venv/bin/python -m nef_editor.cli ~/Pictures/MyPhotos --category landscape

# Choose a sub-style
.venv/bin/python -m nef_editor.cli ~/Pictures/MyPhotos --category portrait --sub-style vivid
```

After a run, open any NEF in darktable GUI — the sidecar is auto-loaded and
the preset is applied. Continue editing manually from there.

## Categories

Only `night` (ISO >= 3200) is auto-detected. All other categories are
operator-assigned with `--category`:

- `night` — auto-detected (ISO >= 3200)
- `portrait` — operator-assigned
- `landscape` — operator-assigned
- `macro` — operator-assigned

Sub-styles: `neutral` (default), `vivid`, `grey`, `monochrome`.

## Presets

Presets are XMP sidecar files in `presets/`, authored in darktable's GUI.
See `presets/README.md` for authoring instructions. Until sidecars are
authored, the CLI classifies and records but writes no sidecars.

## Architecture

See `docs/architecture/nef-editor-cli/plan.md` for the full design,
including ADRs and verification evidence.
