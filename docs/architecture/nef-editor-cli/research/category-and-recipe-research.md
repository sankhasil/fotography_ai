---
type: reference
title: Category Detection and JSON Recipe Format Research
status: verified
date: 2026-10-04
---

# Category Detection and JSON Recipe Format Research

Research questions from the operator working on the Nikon Z 9 NEF editor CLI. Two
parts: (A) which of the 5 merged categories can actually be auto-detected from
metadata + 384×256 preview, and (B) what the JSON recipe layer should look like,
given the constraints in [ADR-0003](../../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md)
and [ADR-0004](../../adr/0004-read-exif-in-pure-python.md).

This file is research, not a plan. Decisions derived from it should land in ADRs.

## Scope and constraints, restated

- Camera: Nikon Z 9, NIKKOR Z 24-200mm f/4-6.3 VR (one lens, max aperture f/6.3).
- NEF container: HE\* compressed. macOS ImageIO decodes it (see
  [`he-decoder-research.md`](./he-decoder-research.md)); `sips` produces an 8-bit JPEG.
- Metadata available in pure Python (per ADR-0004): ISO, shutter, aperture, focal
  length — all from the standard EXIF IFD. No MakerNote. No Picture Control.
- Preview available: 384×256 uncompressed RGB raster in SubIFD3 (per Phase 3 plan).
- No new dependencies. Phase 3 forbids numpy, Pillow, opencv, torch, CLIP — pure
  Python stdlib only.
- Render engine: `darktable-cli` invoked with `--core "<module>:<params>"`. The
  library DB is not used (ADR-0003). `--style` is rejected.

## Part A — Category detection

### Feasibility summary for the 5 merged categories

| Category | Detection signal | Confidence | Notes |
|---|---|---|---|
| `night` | ISO ≥ 3200 (EXIF) | **high** | Already shipped, 56/209 in the corpus |
| `portrait` | Skin-tone blob in preview HSV | **medium** | Phase 3 plan; biased to one skin tone until validation set is diverse |
| `landscape` | Blue + green dominance, low saturation variance | **medium-low** | Coarse. A dog in a field reads "landscape"; a blue building reads "landscape" |
| `architecture/street` | Focal length band + edge density + colour palette | **low** | Detectable as "not portrait, not landscape, not night" but not separable from landscape on a 24mm wide lens |
| `product/food` | None reliable in pure Python from preview alone | **infeasible** | Indistinguishable from `macro` without depth, subject isolation, or a CNN |

The honest summary: **3 of 5 categories are detectable** (`night`, `portrait`,
`landscape` coarse). `architecture/street` is a "best guess" path. `product/food`
cannot be auto-detected under the project's constraints and must stay
operator-assigned, exactly as `macro` does today (`plan.md` §3, out-of-scope).

### Architecture/Street — signals, algorithm, confidence

**Focal length is a weak signal here.** The operator's lens is 24-200mm.

- "Architecture often wide (24-50mm on full frame)" — true, but on a 24-200mm
  lens, 24mm is also where *landscape* lives. The focal-length band 24-50mm
  overlaps landscape completely. Reference: no published professional raw editor
  distinguishes architecture from landscape by focal length alone. Lightroom's
  "Auto Settings" (Adobe Sensei, `crs:AutoTimestamp` / `crs:Auto2.0` mode) does
  not expose the feature list; Capture One's "Auto Adjust" is exposure/WB only
  ([Capture One user guide, "Auto Adjust"](https://help.phaseone.com/))
  — neither markets scene-category detection.
- "Street often 35-85mm" — also true for the genre, but 35-85mm on this lens is
  the same band as portrait and close landscape. Focal length separates wide
  from long, not architecture from anything else.

**Edge density is computable in pure Python and is a real signal.**

Architecture has many straight lines; landscape has horizons; portraits have
few edges. A cheap pure-Python edge-density proxy that needs no numpy:

1. Convert the 384×256 RGB raster to a 128×86 luminance grid by averaging
   3×3 blocks (downsample to drop noise and compute cost).
2. Compute horizontal and vertical gradients with a 3-tap finite difference
   (Sobel is unnecessary; `g_x = L[i+1,j] - L[i-1,j]`, same for `g_y`).
3. Count pixels where `|g_x| + |g_y|` exceeds a fixed threshold.
4. Architecture: high count, with a *bimodal* gradient distribution (many
   strong verticals and many strong horizontals). Landscape: high count but
   dominated by a single horizontal band. Portrait: low count.

This is ~40 lines of pure Python on a 128×86 grid — 11 000 pixels, well under
the Phase 3 performance budget. It does **not** require Hough transforms, and
Hough would be overkill: a 384×256 preview is too coarse for vanishing-point
detection anyway. We are *not* trying to detect converging verticals; we are
estimating the *ratio of strong vertical gradients to strong horizontal
gradients*, which is a much cheaper statistic that distinguishes a building
facade (vertical-dominated) from a horizon (horizontal-dominated).

**Colour palette is a weak disambiguator but a weak signal is still a signal.**

- Architecture (concrete, glass, steel): low saturation, neutral hue. Mean
  saturation low. Hue histogram concentrated in the blue-grey band.
- Street: more varied, but typically still urban — concrete + clothing + sky.
- Landscape: high green/blue dominance (already the Phase 3 landscape signal).
- The disambiguator: **architecture has low saturation AND low green dominance
  AND high edge density**. Landscape has high green/blue dominance AND lower
  edge density.

**Aperture is useless here.** The lens tops out at f/6.3, so the
"f/8+ for deep DOF" rule (per `presets.md` revision 1, which was dropped) fires
zero times. Architecture often shot at f/8-f/11 is a real-world pattern, but it
is unobservable with this lens.

**What other tools do.** Lightroom's Auto Settings and Capture One's Auto
Adjust are exposure/contrast/WB-only — they do not perform scene classification.
darktable has an `auto-apply` presets system keyed on **camera model + ISO +
aperture + focal length + EC** ranges, not on scene category
(see `src/common/exif.cc` `_exif_decode_xmp_data`, the
`Xmp.darktable.auto_presets_applied` tag, and the
`auto-presets` matching code in `src/libs/`). No professional tool we can find
auto-detects architecture vs landscape. The closest industrial-grade approach
is **Places365** (MIT CSAIL), a 365-category scene classifier — see References.
Places365 contains explicit categories for `building_facade`, `skyscraper`,
`street`, `alley`, `arch`, `bridge`, `plaza`, `promenade`, `shopfront`, etc.
But Places365 needs a CNN (ResNet50 ≈ 100 MB, or AlexNet ≈ 240 MB) and the
project explicitly forbids CNN dependencies.

**Recommended detection algorithm** (pure Python, ~60 lines total):

```text
extract_preview()
features = {
    mean_luminance,
    mean_saturation,
    skin_tone_ratio,        # already in Phase 3
    blue_green_ratio,       # already in Phase 3
    edge_density,           # NEW: fraction of high-gradient pixels at 128x86
    vertical_horizontal_ratio,  # NEW: |g_y|>t count / |g_x|>t count
    hue_concentration,      # NEW: fraction of pixels in the grey-blue band
}

if ISO >= 3200:                                     category = night
elif skin_tone_ratio >= 0.45:                       category = portrait
elif blue_green_ratio >= 0.55 and edge_density < T:  category = landscape
elif edge_density >= T and vertical_horizontal_ratio in [0.7, 1.4]
     and mean_saturation < S_max:                   category = architecture_street
else:                                               category = unsure
```

The thresholds `T`, `S_max` are provisional and need the Phase 3.4 validation
set. **Honest prediction:** the architecture/street branch will fire
correctly on ~50-65% of true architecture/street photographs in the operator's
corpus, will misclassify dense urban landscape as architecture, and will
misclassify sparse modern architecture as landscape. This is *better than
nothing* but it is **not a category you can ship without operator override**.
The `--category architecture-street` flag must remain the documented primary
path; `auto` is a hint, not a verdict.

**Confidence: low.** Not infeasible — the signals exist and are computable —
but the false-positive rate against landscape is high enough that the
operator should treat the classifier's `architecture_street` verdict as a
*suggestion*, never as ground truth. ADR-0007 (planned for Phase 3) should be
extended to cover this branch with the same "ship only if validation
accuracy is acceptable" gate that applies to `portrait`/`landscape`.

### Product/Food — signals, algorithm, confidence

**The honest assessment up front:** product/food is not distinguishable from
macro in pure Python from a 384×256 preview. The project should not attempt
auto-detection for this category. The same reason `plan.md` §3 dropped macro
auto-detection applies here, more strongly.

The signals usually cited:

- **Focal length:** product/food often short macro (40-100mm). But the existing
  macro rule already conflated wide with close-up (`plan.md` §3:
  *"focal ≤ 60 mm means 'wide', not 'close-up' — it is not measuring macro at
  all"*). With the 24-200mm lens, focal length 50-100mm covers portrait,
  close landscape, and product/food indifferently.
- **Aperture:** product "often f/8-f/11", food "often f/2.8-f/4". The lens
  stops at f/6.3. The product range is unobservable. The food range is
  partially observable (f/4-f/6.3), but at those apertures portrait and
  close landscape also live.
- **Colour:** food warm (orange/red/brown); product brand-specific. Both are
  distinguishable from landscape's green/blue, but indistinguishable from a
  warm portrait or a close animal shot. The `warm_cool_balance` feature
  already in Phase 3 is the same signal.
- **Background uniformity:** product often has an isolated background. This
  *is* measurable: compute the variance of the border ring of the preview
  (outer 16 pixels). Product: low border variance. Portrait: low border
  variance (bokeh). Food: variable. Macro: variable. The signal exists but
  it is shared with portrait, which has it for a different reason (shallow
  DOF), and we cannot distinguish the reason from a 2D thumbnail.
- **Subject isolation without depth data:** impossible. Subject distance is
  not in the EXIF (we don't read MakerNote, per ADR-0004). The 2D preview has
  no depth. There is no cheap pure-Python signal that distinguishes "small
  object far from background" from "person standing in front of wall".

**Places365 evidence.** The Places365 categories that map to product/food
are *scene* categories, not subject categories: `restaurant`, `dining_room`,
`dining_hall`, `restaurant_kitchen`, `food_court`, `bakery/shop`,
`coffee_shop`, `pizzeria`, `sushi_bar`, `fastfood_restaurant`,
`ice_cream_parlor`, `delicatessen`, `butchers_shop`, `market/indoor`,
`market/outdoor`, `supermarket`, `shopfront`, `clothing_store`,
`jewelry_shop`, `toyshop`, `pet_shop`, `gift_shop`, `shoe_shop`,
`florist_shop/indoor`, `hardware_store`, `candy_store`, `fabric_store`,
`general_store/indoor`, `general_store/outdoor`, `department_store`,
`shopping_mall/indoor`, `bazaar/indoor`, `bazaar/outdoor`. All are
*environment* categories — they detect "this photo was taken in a
restaurant", not "this photo is of a hamburger". They require a CNN. And
they detect the environment, not the subject the photographer was
focusing on. A headshot of a friend at a restaurant would be classified
`restaurant`, not `portrait` — which is the opposite of what the
operator wants.

**Recommended detection algorithm:** none. Treat `product_food` like
`macro`: operator-assigned only. Phase 3's `--category auto` should
return `unsure` for any photograph that is not `night`, `portrait`, or
`landscape`, with the feature vector preserved in `reasons`. The
operator picks `--category product-food` manually.

**Confidence: infeasible.** Not "low" — *infeasible*. Under the project's
no-CNN, no-depth, no-MakerNote constraints, there is no signal that
separates product/food from macro + warm-portrait + close-landscape.
Adding it would ship a classifier that is wrong more often than right.

### Honest assessment — what is detectable, what is not

| Detectable (ship) | Not reliably detectable (operator-assigned) |
|---|---|
| `night` (ISO) | `product_food` |
| `portrait` (skin tone, with bias caveat) | `macro` (already operator-assigned) |
| `landscape` (coarse, blue+green) | sub-style (already operator-assigned) |
| `architecture_street` (low confidence, override-able) | — |

**Implication for the merged category list.** The 5×4 = 20 preset matrix is
correct as a *target catalogue*, but `auto` detection should only ever return
4 of the 5 categories: `night`, `portrait`, `landscape`, `architecture_street`,
plus `unsure`. `product_food` is a `--category <name>`-only entry, like
`macro` today. ADR-0007 should document this explicitly so a future
contributor does not assume the classifier covers the whole matrix.

## Part B — JSON recipe format

### Survey of professional raw editor recipe formats

We need to know how the existing tools structure an "edit recipe" before
designing our own. Three formats are widely deployed.

#### 1. darktable XMP sidecar (`.nef.xmp` or `<basename>.<extension>.xmp`)

Source: `src/common/exif.cc` in `darktable-org/darktable` (master branch,
2026-10-04), confirmed against the user manual
([`docs.darktable.org/usermanual/5.6/en/overview/sidecar-files/sidecar/`](https://docs.darktable.org/usermanual/5.6/en/overview/sidecar-files/sidecar/)).

**Container:** standard Adobe XMP RDF (`<x:xmpmeta>` → `<rdf:RDF>`). darktable
uses its own namespace prefix `darktable:` for its processing state.

**Key tags** (verbatim from `dt_xmp_keys[]` in `src/common/exif.cc`):

```
Xmp.darktable.history                  # XmpSeq, one entry per operation in the history stack
Xmp.darktable.history_modversion       # per-entry: the IOP code version that wrote the params
Xmp.darktable.history_enabled          # per-entry: enabled flag (0/1)
Xmp.darktable.history_end              # index of the last visible entry
Xmp.darktable.iop_order_version        # the IOP order schema version
Xmp.darktable.iop_order_list           # the IOP order list (which module runs in which order)
Xmp.darktable.history_operation        # per-entry: module name, e.g. "exposure", "filmicrgb"
Xmp.darktable.history_params           # per-entry: BINARY BLOB, hex/base64-encoded
Xmp.darktable.blendop_params           # per-entry: BINARY BLOB for blending/mask params
Xmp.darktable.blendop_version          # per-entry: blendop struct version
Xmp.darktable.multi_priority           # per-entry: instance number for multi-instance modules
Xmp.darktable.multi_name               # per-entry: user-given instance name
Xmp.darktable.multi_name_hand_edited   # per-entry: flag
Xmp.darktable.iop_order                # per-entry: ordering within the pipe
Xmp.darktable.xmp_version              # XMP schema version (currently 5)
Xmp.darktable.raw_params               # raw parameters blob
Xmp.darktable.auto_presets_applied     # flag: have auto presets been applied on import?
Xmp.darktable.mask_id, mask_type, mask_name, masks_history,
Xmp.darktable.mask_num, mask_points,   # mask definitions (drawn + parametric)
Xmp.darktable.mask_version, mask, mask_nb, mask_src
Xmp.darktable.history_basic_hash, history_auto_hash, history_current_hash
Xmp.darktable.import_timestamp, change_timestamp, export_timestamp, print_timestamp
Xmp.darktable.version_name
Xmp.darktable.harmony_guide_type, harmony_guide_rotation, harmony_guide_width
```

**The critical finding.** The `history_params[N]` entries are **binary-blob
hex-encoded serialisations of the operation's C struct**, versioned by
`history_modversion[N]`. From `src/common/exif.cc` (around line 3933):

```c
current_entry->blendop_params =
    dt_exif_xmp_decode(blendop_params_iter->child_value(),
                       strlen(blendop_params_iter->child_value()),
                       &current_entry->blendop_params_len);
```

`dt_exif_xmp_decode` is the binary-unpacker. Each IOP module owns the layout of
its `params` blob; the layout is tied to the C struct definition in
`src/iop/<module>.c` and changes between `modversion` numbers. **The XMP
sidecar is not a portable, human-readable recipe. It is a serialised
in-memory struct that only darktable can read, and only for the matching
modversion.**

darktable-cli can *consume* an XMP sidecar via the optional second positional
argument:

```
darktable-cli <input> [<xmp file>] <output> [--core ...]
```

(per the user manual, [`darktable-cli` page](https://docs.darktable.org/usermanual/5.6/en/special-topics/program-invocation/darktable-cli/)).
If no XMP is given, darktable looks for one beside the input. This *is* a
headless path — it does not require the library DB.

**The XMP-sidecar route is therefore feasible.** But producing one from our
JSON recipe would require us to emit, for every module we touch, a binary
`params` blob in the exact C-struct layout darktable expects for the
installed `modversion` — including correct endianness, padding, and version
byte. That is a substantial reverse-engineering effort per module, brittle
to darktable version bumps, and far harder than the alternative.

#### 2. Adobe Lightroom / Camera Raw XMP (`.xmp`)

Source: Adobe XMP Specification Part 7 — Camera Raw Schema (`crs:` prefix).
Adobe ships the spec at
[`helpx.adobe.com/xmp`](https://helpx.adobe.com/xmp/kb/xmp-developer-photoshop-cs6-documentation.html)
behind a 403 on direct fetch; the schema is widely documented in the
`exiftool` tag dictionary and in the open-source `exiv2` source
(`src/tags.cpp` registers `Xmp.crs.*`).

**Key tags (typical Lightroom 13.x XMP):**

```
crs:ProcessVersion            # e.g. "11.0", "15.0" — which ACR algorithm generation
crs:Version                   # the recipe schema version
crs:Temperature, crs:Tint      # white balance
crs:Exposure2012              # exposure in EV (PV2012 process)
crs:Contrast2012
crs:Highlights2012, crs:Shadows2012
crs:Whites2012, crs:Blacks2012
crs:Texture, crs:Clarity, crs:Dehaze, crs:Vibrance, crs:Saturation
crs:ConvertToGrayscale        # B&W conversion flag
crs:ToneCurvePV2012            # tone curve (array of (x, y) points)
crs:ToneCurvePV2012Red, Green, Blue  # per-channel curves
crs:ParametricShadows, ...Highlights, ...Lights, ...Darks  # parametric curve
crs:HSLAdjustment/*            # HSL panel
crs:ColorNoiseReduction, crs:LuminanceNoiseReduction, crs:LuminanceSmoothing
crs:SharpenRadius, crs:SharpenDetail, crs:SharpenEdgeMasking
crs:PostCropVignetteAmount, ...Style, ...Midpoint, ...Roundness, ...Feather
crs:CameraProfile              # camera profile name
crs:ToneCurveName, crs:CameraProfileDigest
crs:AlreadyApplied             # CRITICAL flag
```

**Recipe state.** Lightroom's recipe is *human-readable key/value pairs*
with versioned keys (`Exposure2012` vs the older `Exposure`), and **no binary
blobs**. Tone curves are arrays of numbers. This is the closest existing
format to what we want, but it is owned by Adobe, keyed to the ACR algorithm
versions, and *not* the structure darktable-cli consumes.

**Masking.** Lightroom stores masks under `crs:MaskGroup/*`, an XmpBag of mask
definitions, each with `crs:MaskValue` (the mask's effect), `crs:MaskType`
("Brush"/"Radial"/"Linear"/"Color"/"Luminance"/"Depth"), and per-type
parameters. The format is documented but licensed-adjacent — it describes
Adobe's internal pipeline.

#### 3. RawTherapee `.pp3`

Source: `rtengine/procparams.cc` and `rtengine/procparams.h` in
`Beep6581/RawTherapee` (dev branch). The `.pp3` file sits next to the image
(`<basename>.pp3`).

**Container:** plain-text INI-style. `[Section]\nKey=Value\n`. No XML, no
binary blobs, no RDF. The writer in `procparams.cc` uses a
`KeyStore`-of-sections approach; each section is a struct field in
`ProcParams` (`rtengine/procparams.h`, ~150 fields). Sample sections observed
in `procparams.cc` via `DEFINE_KEY`:

```
[Exposure], [Highlight Recovery], [Shadows & Highlights],
[White Balance], [Channel Mixer], [RGB Curves], [Luminance Curve],
[Tone Curve], [HSV Equalizer], [RGB Equalizer], [Lab Curve],
[Sharpening], [Edge Sharpening], [PostResizeSharpening],
[Noise Reduction], [Impulse Denoising], [Wavelet], [Directional Pyramid],
[Directional Contrast], [Vibrance], [Color Management],
[Meta], [Crop], [Coarse], [Common], [Orientation], [Distortion],
[Perspective], [Vignetting], [Gradient], [ColorToning], [FilmSimulation],
[SoftLight], [Dehaze], [HDR], [Bayer], [X-Trans], [Pixelshift], [RAW],
[Retinex], [PrShrThresholding], [Spot], [Metadata], [Properties], [Version]
```

The format is fully human-readable, trivial to diff in git, and not tied to
binary struct layouts. **This is the closest existing analogue to what we
want**, with two caveats: (a) it is RawTherapee-specific, (b) the section
list is large (RT exposes ~150 parameters) and the project explicitly limits
its surface to the small set named in `presets.md`.

#### 4. Capture One session files

Capture One stores edits in a session-bundled SQLite database (`*.cosessiondb`
or `*.cocatalogdb`) plus per-image sidecar data in the same SQLite schema. The
schema is not documented by Capture One and changes between major versions.
Third-party tooling (`exiftool`) reads only the rendered preview's EXIF from
these files, not the edit recipe. **No neutral interchange format exists for
Capture One.** This is the only major raw editor with no public recipe format
and is not a useful reference for our JSON design.

#### 5. Neutral / interchangeable raw editing recipe formats

There is no widely-adopted neutral format. Two notable efforts:

- **OpenRAW** (DNG-style sidecar proposal, 2005-2008) — abandoned. The
  OpenRAW working group's deliverable was a metadata survey, not a recipe
  interchange format.
- **Adobe DNG's `DefaultUserCrop` and opcode list** — DNG can carry an
  embedded recipe (crop, opcodes) but no editor writes its full edit
  history into DNG.

In practice, every raw editor that exports an edit recipe uses its own
format. The most reusable design pattern is the RawTherapee `.pp3` approach
— plain-text, sectioned, version-tagged, no binary blobs.

### Proposed JSON schema for the NEF editor CLI

Given the constraints — pure Python, no darktable-struct reverse-engineering,
human-reviewable, SQLite-stored — a small JSON document with versioned sections
is the right shape. It is not a darktable XMP and it does not try to be.

**Design rules:**

1. Every value is a primitive (string, number, bool) or a list of primitives.
   No nested blobs, no binary hex.
2. The schema has a `version` field. Schema changes bump the version and the
   CLI accepts old versions (one backward-compat step at minimum).
3. The schema mirrors `--core`'s `module:key=value` shape directly. Every
   field in `correction.modules` maps 1:1 to one `--core` argument.
4. The schema records what *was applied*, including the QC guardrail results
   and the decode stage. It is not a preset definition — presets are authored
   separately in `presets.md` and produce one of these JSONs at runtime.
5. The JSON is stored verbatim in the SQLite `correction` column (which
   already exists per [`database.md`](./database.md)). The existing TEXT
   column needs no schema change.

**Example:**

```json
{
  "schema_version": 1,
  "source": {
    "file": "DSC_5128.NEF",
    "mtime": 1762057200.0,
    "size": 26214400
  },
  "classification": {
    "category": "landscape",
    "sub_style": "neutral",
    "confidence": 0.72,
    "reasons": [
      "iso=320 (lt 3200, not night)",
      "blue_green_ratio=0.61 (ge 0.55)",
      "edge_density=0.18 (lt 0.30 threshold)"
    ],
    "classifier_version": 1,
    "classifier_features": {
      "mean_luminance": 118.4,
      "mean_saturation": 0.31,
      "skin_tone_ratio": 0.02,
      "blue_green_ratio": 0.61,
      "warm_cool_balance": 207.5,
      "edge_density": 0.18,
      "vertical_horizontal_ratio": 0.42,
      "hue_concentration": 0.55
    }
  },
  "decode": {
    "engine": "sips",
    "engine_version": "macos-26.6.2",
    "output": "8-bit JPEG",
    "intermediate_path": "/tmp/nef-editor/DSC_5128.jpg"
  },
  "correction": {
    "modules": [
      {"module": "darktable.exposure",      "params": {"exposure": 0.15}},
      {"module": "darktable.whitebalance",  "params": {"temperature": 5400, "tint": 1.0}},
      {"module": "darktable.shadhi",        "params": {"shadows": 0.10, "highlights": -0.20}},
      {"module": "darktable.localcontrast", "params": {"amount": 0.30, "coarseness": 1}},
      {"module": "darktable.sharpen",       "params": {"amount": 0.50, "radius": 0.8}},
      {"module": "darktable.chroma",        "params": {"saturation": 1.05}}
    ],
    "composed_core_string": "darktable.exposure:exposure=0.15;darktable.whitebalance:temperature=5400,tint=1.0;..."
  },
  "masks": [],
  "qc": {
    "highlight_clipping_pct": 0.0,
    "shadow_clipping_pct": 5.71,
    "halo_check": "pass",
    "measured_at": "2026-10-04T12:00:00Z"
  },
  "tools": {
    "imageio": "macos-26.6.2",
    "darktable": "5.6.1",
    "python": "3.11.9",
    "nef_editor": "0.3.0"
  },
  "rendered_at": "2026-10-04T12:00:42Z",
  "output_path": "out/landscape/DSC_5128.jpg",
  "output_hash": "554d9a0fcab4303e..."
}
```

**Field-by-field notes:**

| Field | Purpose | Notes |
|---|---|---|
| `schema_version` | Bump on breaking changes | Start at 1 |
| `source` | Idempotency key cross-reference | Mirrors `photos.source_mtime`/`source_size` |
| `classification` | What the classifier decided, why, and with what confidence | `classifier_features` preserves the preview feature vector so a future validation run can re-evaluate without re-decoding |
| `decode` | The stage-one path used | `sips` 8-bit today; `CIRAWFilter` 16-bit when built |
| `correction.modules` | The ordered list of `--core` arguments | One module per element; one `--core` string composed from the list |
| `correction.composed_core_string` | The exact string passed to darktable | Reproducible; audit trail |
| `masks` | Reserved for future headless masking | Empty array today; darktable's drawn-mask params are binary blobs in XMP, so a future addition needs its own JSON shape, decided then |
| `qc` | Guardrail results | Drives whether `--force` re-runs are blocked |
| `tools` | Version pin | Mirrors `photos.tool_versions` |
| `output_path`, `output_hash` | Render artefact reference | Mirrors `photos.output_*` columns |

**Why `correction.modules` is a list, not a single string.** A list lets the
preset author (in `presets.md`) compose base + category-delta + sub-style-delta
as list concatenation, then the CLI flattens to one `--core` string at the
boundary. ADR-0003 already verified that multiple modules must go in *one*
`--core` flag, semicolon-separated — the list is the in-memory form, the
string is the wire form.

**Why `masks` is empty.** darktable's drawn-mask and parametric-mask params
live in `blendop_params`, which is a binary blob in the XMP (see §1 above).
Emitting one from JSON requires reverse-engineering the `dt_develop_blend_params_t`
struct layout, which is brittle to darktable version bumps. Phase 3's
presets are global corrections only; per-region masking is deferred behind
the same evidence gate as Phase 2's tuning work. The empty array is the
honest scope marker.

### Translation path — JSON → `--core`, not JSON → XMP

Both paths are technically feasible. The recommendation is **JSON → `--core`
string**, for five reasons.

**Path A (recommended): JSON → `--core` string at runtime**

```python
core_str = ";".join(
    f"{m['module']}:" + ",".join(f"{k}={v}" for k, v in m["params"].items())
    for m in recipe["correction"]["modules"]
)
subprocess.run(["darktable-cli", input_jpg, output_jpg, "--core", core_str, ...])
```

- The `--core` form was verified working in ADR-0003 against darktable-cli 5.6.1.
- The `--core` parameters are **human-readable key=value pairs** — they match
  the JSON shape directly. No binary blobs, no struct layout, no
  `modversion`-dependent decoding.
- The recipe and the wire format are the same shape. The composition
  (`composed_core_string`) is the audit artefact; the structured
  `correction.modules` is the human-review artefact. Both are stored.
- No file-system side effects. The CLI does not write a `.xmp` next to the
  input JPEG, which the operator might import into darktable later and
  confuse with a hand-edited edit.
- Survives darktable upgrades. The `--core` parameter names are stable
  across darktable 4.x → 5.x (verified by reading the module docs in the
  user manual index above); the binary `params` blob layout is not.

**Path B (rejected): JSON → XMP sidecar → darktable**

```
nef-editor writes <basename>.jpg.xmp containing Xmp.darktable.history_* tags
darktable-cli input.jpg output.jpg    # picks up the .xmp automatically
```

- Requires producing binary `params` blobs for every module we touch.
- Each blob must match the `history_modversion` of the installed darktable.
- The blob layouts are defined in darktable's `src/iop/<module>.c` `init()`
  functions and change without notice.
- The XMP would be picked up by darktable GUI later as "edit history
  already applied" — a confusing UX.
- One benefit only: it would let the operator open the JPEG in darktable GUI
  and see the edit stack. That benefit is real but small, and the JSON recipe
  already preserves the equivalent information in a human-readable form.

**Path C (rejected): JSON → darktable `.dtstyle` → `--style`**

Already rejected by ADR-0003. `--style` resolves against the library
database, which we deliberately do not seed. No change.

### Migration ladder

The JSON recipe is forward-compatible with a future XMP route if one is
ever needed:

1. Today: JSON → `--core` (Path A). Stored in `photos.correction`.
2. Future, if a real need appears: add a `to_xmp_sidecar(recipe)` writer
   that emits a darktable-compatible XMP. Requires per-module blob
   emitters, gated by a measured need — e.g. an operator workflow that
   benefits from GUI-visible edit history.
3. The JSON shape does not need to change for step 2 to be added. The
   `correction.modules` list is the source of truth; the XMP writer
   consumes it the same way the `--core` composer does.

This matches the Ponytail principle in `AGENTS.md`: write the smallest
correct solution now, document the upgrade path, do not pre-build the
abstraction.

## Conclusions

1. **Feasibility:** `night` high, `portrait` medium, `landscape` medium-low,
   `architecture_street` low (override-able), `product_food` infeasible. The
   5-category matrix is correct as a *catalogue*; `auto` detection covers 4
   of 5.
2. **Recipe format:** a small, versioned JSON document with sectioned
   primitive values. RawTherapee's `.pp3` is the closest analogue; Adobe's
   `crs:` XMP is the closest *structured* analogue; darktable's XMP is a
   binary-blob carrier that we should not reproduce.
3. **Translation path:** JSON → `--core` string at runtime. The XMP
   sidecar route is technically possible but reverse-engineers binary
   struct layouts for no current benefit. Defer behind an evidence gate.
4. **SQLite impact:** none. The existing `photos.correction` TEXT column
   stores the JSON verbatim. No schema migration.

## References

### Primary sources — recipe formats

- darktable XMP source code: <https://github.com/darktable-org/darktable/blob/master/src/common/exif.cc> — `dt_xmp_keys[]` (lines ~448-467), `_exif_decode_xmp_data` (line ~635), `dt_exif_xmp_decode` (binary-blob decoder, line ~3936)
- darktable sidecar manual: <https://docs.darktable.org/usermanual/5.6/en/overview/sidecar-files/sidecar/>
- darktable-cli manual: <https://docs.darktable.org/usermanual/5.6/en/special-topics/program-invocation/darktable-cli/>
- RawTherapee procparams source: <https://github.com/Beep6581/RawTherapee/blob/dev/rtengine/procparams.cc> and `procparams.h`
- Adobe XMP Specification (landing): <https://helpx.adobe.com/xmp/kb/xmp-developer-photoshop-cs6-documentation.html>
- Adobe Camera Raw schema (`crs:` namespace) — registered in `exiv2` at `src/tags.cpp` and documented in the XMP spec Part 7
- exiv2 source: <https://github.com/Exiv2/exiv2> — `Xmp.crs.*` and `Xmp.darktable.*` registration

### Primary sources — scene classification

- MIT Places Database: <http://places.csail.mit.edu/> — 205 categories, 2.5M labelled images
- Places365 categories list: <https://raw.githubusercontent.com/CSAILVision/places365/master/categories_places365.txt> — 365 scene categories including `building_facade`, `skyscraper`, `street`, `alley`, `plaza`, `dining_room`, `restaurant`, `food_court`, `shopfront`, etc.
- Places-CNN paper: B. Zhou, A. Lapedriza, J. Xiao, A. Torralba, A. Oliva. "Learning Deep Features for Scene Recognition using Places Database." NIPS 2014. <http://places.csail.mit.edu/places_NIPS14.pdf>
- Places2 PAMI extension: <http://places2.csail.mit.edu/PAMI_places.pdf>

### Project-internal references

- [`plan.md`](./plan.md) — implementation plan, revision 3
- [`presets.md`](./presets.md) — 16-preset matrix (will become 20)
- [`phase-3-preview-classifier.md`](./phase-3-preview-classifier.md) — preview classifier plan, the base this research extends
- [`database.md`](./database.md) — SQLite schema, `correction` column already stores text
- [`he-decoder-research.md`](./he-decoder-research.md) — example research document; this file follows its structure
- [ADR-0001](../../adr/0001-darktable-cli-as-render-engine.md) — superseded render-engine decision
- [ADR-0003](../../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md) — `--core` not `--style`
- [ADR-0004](../../adr/0004-read-exif-in-pure-python.md) — no exiftool, no LibRaw, no MakerNote
- [ADR-0006](../../adr/0006-macos-imageio-decodes-he-star.md) — `sips` decodes HE\*

### Conventions and method

- OKF reference for this repo's docs: `AGENTS.md` §"Knowledge & Documentation (OKF)"
- Ponytail principle for smallest-correct-solution: `AGENTS.md` §"The Ponytail Principle"
