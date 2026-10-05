---
type: concept
title: NEF Photo Editor CLI — Phase 3 Workflow Engine + XMP Sidecar Presets
status: draft
date: 2026-10-04
revision: 1
part_of: ./roadmap.md
---

# Phase 3 — Workflow Engine + XMP Sidecar Presets + JSON Recipe

> This is the phase inspired by the operator's pro photo editor prompt. It builds
> the real preset system: XMP sidecars authored in darktable GUI, a JSON recipe
> layer, and the baseline + genre + QC workflow. `--core` strings are gone.

## Goal

Replace the broken `--core` string preset system with **XMP sidecar presets** authored
in darktable's GUI and shipped as data files. Introduce a **JSON recipe layer** between
classification and rendering: the CLI reads metadata + preview, emits a recipe, selects
the matching XMP sidecar, and applies it via `darktable-cli <input> <xmp> <output>`.

The 20 presets (5 categories × 4 sub-styles) implement the workflow from the operator's
prompt: universal baseline (lens, highlights, WB, vibrance) → genre-specific (skin
tone, sky mask, perspective, edge sharpen) → QC guardrails (halo, plastic skin,
blown highlights).

## Why XMP sidecars, not `--core` strings

ADR-0003 is falsified (see [`research-synthesis.md`](./research-synthesis.md)). The
control test on 2026-10-04 proved `--core "darktable.<module>:<param>=<value>"` is
silently ignored. `darktable-cli` accepts an XMP sidecar as its second positional
argument — this is the **only** headless mechanism for applying edits with masks,
module parameters, and module order.

XMP params are binary C-struct blobs. **Hand-crafting is fragile.** The reliable path
is: author each preset in darktable GUI on a representative NEF → save the sidecar →
ship the `.xmp` file with the CLI.

## The 20 presets

5 categories × 4 sub-styles = 20 XMP sidecars.

### Categories (5)

| Category | Auto-detect? | Signal |
|---|---|---|
| `night` | Yes | ISO ≥ 3200 or ExposureBiasValue ≥ 1.0 EV |
| `portrait` | Yes (Phase 4) | SceneCaptureType=2 or skin-tone in preview |
| `landscape` | Yes (Phase 4, coarse) | SceneCaptureType=1 or blue+green dominance |
| `architecture` | No | Operator-assigned. Low-confidence auto-detect in Phase 4 |
| `product` | No | Operator-assigned. Infeasible from metadata alone |

### Sub-styles (4)

| Sub-style | Intent | Darktable implementation |
|---|---|---|
| `neutral` | Honest rendering | Baseline only, no creative departure |
| `vivid` | Saturated, contrast-forward | `colorbalancergb` global vibrance +10 to +15, global saturation ≤ +5 |
| `grey` | Desaturated, retaining chroma | `colorbalancergb` global saturation -25 to -35 (never cross to B&W) |
| `monochrome` | True B&W | `monochrome` iop applied last, overrides all saturation |

### File layout

```
nef-editor/
  presets/
    nef-night-neutral.xmp
    nef-night-vivid.xmp
    nef-night-grey.xmp
    nef-night-monochrome.xmp
    nef-portrait-neutral.xmp
    ...
    nef-product-monochrome.xmp
```

One `.xmp` file per preset. 20 files total. Each is ~5-15 KB of XML.

## Item 3.1 — Author the 20 XMP sidecars in darktable GUI

**This is operator work, not code.** For each of the 20 presets:

1. Open a representative NEF in darktable GUI (use the Phase 2 fixture corpus)
2. Apply the module stack for that category + sub-style (see §"Module stacks" below)
3. Save the sidecar: `File → Write sidecar files` or right-click → "Write sidecar"
4. Rename to `nef-<category>-<sub-style>.xmp`
5. Commit to `nef-editor/presets/`

**Contract:** each sidecar is authored once on a representative NEF and must apply
cleanly to other NEFs. Masks use **parametric** or **ellipse/gradient** shapes (not
hand-drawn paths) to stay portable across images.

### Module stacks per category

**Baseline (in every sidecar):**

| # | iop | GUI name | Key parameters | Mask |
|---|---|---|---|---|
| 1 | `lens` | lens correction | method=Lensfun, corrections=all | none |
| 2 | `highlights` | highlight reconstruction | method=inpaint opposed | none |
| 3 | `temperature` | white balance | setting=as shot | none |
| 4 | `exposure` | exposure | exposure=0.0 EV (baseline) | none |
| 5 | `filmicrgb` | filmic rgb | default scene-referred curve | none |
| 6 | `colorbalancergb` | color balance rgb | global vibrance=+12 | none |

**Portrait delta (on top of baseline):**

| # | iop | Key parameters | Mask |
|---|---|---|---|
| 7 | `diffuse` | skin smoothing, amount=-15 | parametric: hue=skin-tone range |
| 8 | `exposure` (instance 2) | exposure=+0.20 EV | drawn: ellipse on eyes |
| 9 | `bilat` | clarity=+15, contrast=+8 | drawn: ellipse on eyes (same) |
| 10 | `colorzones` | teeth: yellow L=+10, S=-20 | drawn: path on teeth |
| 11 | `exposure` (instance 3) | exposure=-0.30 EV | drawn: ellipse on background, inverted |

**Landscape delta:**

| # | iop | Key parameters | Mask |
|---|---|---|---|
| 7 | `hazeremoval` | dehaze=+8 | drawn: linear gradient on sky |
| 8 | `toneequal` | shadows +0.3 EV, highlights -0.3 EV | drawn: linear gradient on foreground |
| 9 | `colorbalancergb` (instance 2) | cool blue/cyan in shadows | drawn: linear gradient on sky |

**Architecture delta:**

| # | iop | Key parameters | Mask |
|---|---|---|---|
| 7 | `ashift` | vertical keystoning=auto | none |
| 8 | `bilat` | clarity=+15, contrast=+10 | none |
| 9 | `colorzones` | reduce non-subject saturation -35 | parametric: by hue |

**Night delta:**

| # | iop | Key parameters | Mask |
|---|---|---|---|
| 7 | `denoiseprofile` | ISO-driven NR (see §3.5) | none |
| 8 | `toneequal` | shadows +0.4 EV | none |
| 9 | `bilat` | clarity=+8 (restrained for night) | none |

**Product delta:**

| # | iop | Key parameters | Mask |
|---|---|---|---|
| 7 | `temperature` (instance 2) | strict neutral WB | none |
| 8 | `sharpen` | amount=0.5, radius=0.8, mask=70 (edge mask) | none |
| 9 | `colorzones` | boost orange/red luminance +12 | parametric: by hue |

**Sub-style delta (applied last, except monochrome):**

| Sub-style | iop | Parameters |
|---|---|---|
| `vivid` | `colorbalancergb` | global vibrance=+25, global saturation=+5 |
| `grey` | `colorbalancergb` | global saturation=-30 (retain chroma) |
| `monochrome` | `monochrome` | mix=1.0 (applied LAST, overrides saturation) |

## Item 3.2 — `pipeline.render()` uses XMP sidecar

**Change:** `render()` selects the XMP sidecar by category + sub-style and passes it
as the second positional argument to darktable-cli.

```python
PRESETS_DIR = Path(__file__).parent.parent / "presets"

def render(decoded: Path, out_dir: Path, category: Category, sub_style: SubStyle) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = out_dir / f"{decoded.stem}.jpg"
    written.unlink(missing_ok=True)

    xmp = PRESETS_DIR / f"nef-{category.value}-{sub_style.value}.xmp"
    if not xmp.exists():
        raise FileNotFoundError(f"preset sidecar missing: {xmp.name}")

    result = subprocess.run([
        "docker", "run", "--rm",
        "-v", f"{decoded.parent}:/in:ro",
        "-v", f"{out_dir}:/out",
        "-v", f"{xmp}:/preset.xmp:ro",
        "--entrypoint", "darktable-cli", DARKTABLE_IMAGE,
        "/in/" + decoded.name, "/preset.xmp", "/out",
        "--out-ext", "jpeg",
    ], capture_output=True, text=True, check=False)
    ...
```

**Contract:** `render()` no longer takes a `correction` string. It takes category +
sub-style and resolves the sidecar. The sidecar is mounted read-only into the container.

## Item 3.3 — JSON recipe layer

**Change:** introduce a `recipe.py` module that builds a JSON recipe from
classification + metadata + histogram. The recipe is stored in SQLite's `correction`
column (renamed conceptually to `recipe` but the column name stays for compatibility).

```python
@dataclass(frozen=True, slots=True)
class Recipe:
    schema_version: int = 1
    category: Category
    sub_style: SubStyle
    preset_file: str            # "nef-night-vivid.xmp"
    signals: dict               # the metadata that drove the decision
    qc: dict                    # histogram guardrail results
    decode: dict                # decode stage used (CIRAWFilter, 16-bit linear)

    def to_json(self) -> str: ...
    @staticmethod
    def from_json(s: str) -> "Recipe": ...
```

Example recipe:
```json
{
  "schema_version": 1,
  "category": "night",
  "sub_style": "vivid",
  "preset_file": "nef-night-vivid.xmp",
  "signals": {
    "iso": 6400,
    "exposure_bias": 1.3,
    "scene_capture_type": 3,
    "reasons": ["night: ISO 6400 >= 3200", "night: exposure_bias 1.3 >= 1.0"]
  },
  "qc": {
    "blown_highlights": 0,
    "crushed_shadows": 142,
    "mean_luminance": 0.12
  },
  "decode": {
    "engine": "CIRAWFilter",
    "format": "RGBAh",
    "color_space": "linearSRGB",
    "highlight_recovery": true
  }
}
```

**Contract:** the recipe is human-reviewable. The operator can read it and understand
why a photo was classified and which preset was selected. The `preset_file` field
traces directly to the XMP sidecar applied.

## Item 3.4 — `compare` subcommand for tuning

**Change:** `nef-editor compare <photo> --category <name> [--sub-style <name>]` produces
a side-by-side grid JPEG showing the 4 sub-styles for one category.

```
+----------+----------+----------+----------+----------+
| original | neutral  | vivid    | grey     | monochrome |
+----------+----------+----------+----------+----------+
```

The "original" cell is the CIRAWFilter-decoded TIFF with no XMP applied. The other
four are the same TIFF rendered through each sub-style's XMP sidecar.

**Implementation:** uses Pillow to compose the grid. Reuses `decode()` and `render()`.

**Contract:** `compare` writes one file, no SQLite, no idempotency. It is a tuning
tool, not a batch tool.

## Item 3.5 — ISO-driven night noise reduction

**Change:** the `nef-night-*.xmp` sidecars use darktable's `denoiseprofile` module,
which is ISO-aware. The sidecar sets the module to "auto" mode, which scales NR with
the photograph's actual ISO.

**Why not per-ISO sidecars:** `denoiseprofile` in auto mode reads the EXIF ISO and
scales automatically. No per-ISO sidecar needed. If auto mode proves insufficient,
the recipe layer generates a per-photo XMP with the ISO-specific NR parameter — but
this is a later enhancement, not Phase 3.

## Item 3.6 — Supersede ADR-0003

**Change:** write `docs/adr/0008-presets-are-xmp-sidecars.md` (Nygard format):

- Context: `--core` strings are silently ignored; control test on 2026-10-04
- Decision: presets are XMP sidecar files, authored in darktable GUI, selected by the CLI
- Consequences: 20 `.xmp` files ship with the CLI; params are not hand-editable in Python; masks are portable
- Alternatives: `--core` strings (falsified), `--style` (needs library DB), hand-crafted XMP (fragile)

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | 20 `.xmp` sidecars exist under `nef-editor/presets/` | File count |
| 2 | `render()` applies an XMP sidecar and the output differs from no-sidecar | Integration test, SHA comparison |
| 3 | The output of `nef-portrait-neutral.xmp` differs from `nef-landscape-neutral.xmp` | Integration test, different SHAs |
| 4 | JSON recipe is recorded for every processed photo | SQLite query, `correction` column is valid JSON |
| 5 | Recipe contains category, sub_style, preset_file, signals, qc | JSON schema check |
| 6 | `compare` subcommand writes a 5-cell grid | Unit test with mocked stages |
| 7 | Night NR scales with ISO (visible difference between ISO 3200 and 25600 renders) | Manual comparison |
| 8 | ADR-0008 exists and supersedes ADR-0003 | File exists, ADR-0003 marked superseded |
| 9 | All existing tests pass (updated for XMP path) | `make unit` |

## Dependencies

| Dependency | Role | Status |
|---|---|---|
| Pillow | Grid composition for `compare` | **New** (scoped to `compare` only) |

## Risks

| Risk | Mitigation |
|---|---|
| XMP sidecars are not portable across NEFs | Use parametric/ellipse masks, not hand-drawn paths |
| darktable GUI version mismatch (5.6 vs future) | Pin the Docker image; author on the same version |
| 20 sidecars is a lot of GUI work | Author one category first (night), validate, then batch |
| `denoiseprofile` auto mode is insufficient | Recipe layer generates per-photo XMP with ISO-specific NR |
| Mask shapes misalign on different aspect ratios | darktable stores shapes in normalized coordinates; verify |

## Estimate

| Item | Effort |
|---|---|
| 3.1 author 20 XMP sidecars | Operator's GUI time (~1-2 h per category × 5 = 5-10 h) |
| 3.2 render() migration | 2 h |
| 3.3 JSON recipe | 3 h |
| 3.4 compare subcommand | 3 h |
| 3.5 ISO-driven NR | 1 h (configuration, not code) |
| 3.6 ADR-0008 | 1 h |
| **Total dev** | **~10 h** plus operator GUI time |
