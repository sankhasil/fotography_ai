---
type: reference
title: darktable-cli Module Research — Mapping a Professional Workflow to --core
status: unverified
date: 2026-10-04
---

# darktable-cli Module Research — Mapping a Professional Workflow to `--core`

> **STATUS: UNVERIFIED — REQUIRES OPERATOR CONFIRMATION.**
> This document's headline finding contradicts an existing accepted ADR. It must be
> empirically re-verified before any code is changed. See §1 and §11.

## 1. Headline finding

**The full professional workflow CANNOT be expressed via `--core` — and the
`--core` syntax this project currently relies on almost certainly does nothing.**

Two independent lines of evidence:

1. **No `--core` module-parameter syntax exists in darktable 5.6.**
   The darktable-cli man page lists `--core <darktable options>` as a passthrough to
   the darktable core, and the darktable core accepts only flags like `--conf
   <key>=<value>`, `--configdir`, `--library`, `-d`, etc. There is no documented
   `darktable.<module>:<param>=<value>` syntax. The darktablerc configuration file
   (which `--conf` writes to) uses `plugins/darkroom/<module>/<key>` paths, not the
   `darktable.<module>:<param>` form.

2. **Source code confirms `--core` is a pure passthrough.**
   `src/cli/main.c` (verified against `master` branch, identical pattern in 5.6)
   shows that when `--core` is encountered the CLI parser breaks out, and every
   subsequent argument is copied verbatim into a new argv passed to `dt_init()`:
   ```c
   else if(!strcmp(arg[k], "--core"))
   {
     // everything from here on should be passed to the core
     k++;
     break;
   }
   ...
   m_arg[m_argc++] = "darktable-cli";
   m_arg[m_argc++] = "--library";
   m_arg[m_argc++] = library ? library : ":memory:";
   m_arg[m_argc++] = "--conf";
   m_arg[m_argc++] = "write_sidecar_files=never";
   for(; k < argc; k++) m_arg[m_argc++] = arg[k];
   ```
   A bare string like `darktable.exposure:exposure=0.5` does not begin with `-`, so
   the darktable core's option parser has no match for it. The darktable binary
   documentation states that positionals are treated as input files. Either it is
   silently ignored (matching the `warning: unknown option` behaviour darktable-cli
   prints for its own unknown flags) or it is treated as a positional file
   argument that does not exist. **In neither case is any module parameter
   applied to the export.**

### Implication for the existing project

`nef_editor/presets.py` builds strings of the form
`darktable.exposure:exposure=0.000;darktable.contrast:contrast=1.020` and passes
them via `--core`. **These strings almost certainly have no effect on the
rendered image.** The SHA256 difference observed in `verification.md` and
recorded as evidence in ADR-0003 is most likely caused by **non-determinism in
the JPEG export** (EXIF `DateTimeOriginal` set to the export time, dither noise,
or XMP blob timestamps embedded in the JPEG) — not by the `--core` string being
parsed and applied.

The ADR-0003 "verification" is a **false positive**. The test needed is:

```
darktable-cli /in.jpg /out/first          # no --core, run 1
darktable-cli /in.jpg /out/second         # no --core, run 2
sha256sum /out/first /out/second         # control: must be EQUAL
darktable-cli /in.jpg /out/third --core "darktable.exposure:exposure=0.5"
sha256sum /out/first /out/third          # if first==second, this difference is real
```

If `first` and `second` already differ, the `--core` SHA difference proves
nothing. **Run this control before any further work.** See §11.

### What `--core` is actually for

`--core` exists so that darktable-cli can expose the darktable core's runtime
flags — `--conf <key>=<value>` to override darktablerc entries, `--configdir`,
`--cachedir`, `--disable-opencl`, `-d` debug channels, `-t` thread counts, and
the export-format config keys documented in the darktable-cli man page
(`--conf plugins/imageio/format/jpeg/quality=90`). It is **not** a module-
parameter injection system.

## 2. Complete `--core` module list — there is none

There is no "module list" for `--core` because `--core` is not a module system.
The closest thing to a "list" is the darktablerc key namespace, which uses the
pattern `plugins/darkroom/<iop_module_name>/<key>`. Even then, those keys set
**defaults for new images** — they do not apply edits to a specific image on
export.

For reference, the **GUI processing modules** available in darktable 5.6
(taken from docs.darktable.org's module-reference section) are below. The
"iop name" column is the internal module identifier (used in sidecar XMP,
`darktablerc` keys, and `src/iop/` filenames); this is the closest thing to a
"module string" that darktable exposes.

### Active processing modules (alphabetical)

| iop name | GUI name | Notes |
|---|---|---|
| agx | AgX | display-referred tonemapping |
| ashift | (n/a — handled by `rotate-perspective`) | — |
| atrous | contrast equalizer | wavelet contrast |
| basecurve | base curve | |
| bilat | local contrast | clarity/dehaze-like |
| bloom | bloom | |
| blurs | blurs | |
| censorize | censorize | |
| channelmixerrgb | color calibration | modern white balance / channel mixer |
| chroma | chromatic aberrations | |
| colorbalance | color balance | deprecated-ish; display-referred |
| colorbalancergb | color balance rgb | **vibrance and saturation live here** |
| colorcontrast | color contrast | |
| colorcorrection | color correction | |
| colormapping | color mapping | |
| colorreconstruct | color reconstruction | highlight recovery |
| colorzones | color zones | HSL-style selective color |
| colorize | colorize | |
| colortransfer | color mapping (alt) | |
| composite | composite | |
| crop | crop | |
| demosaic | demosaic | |
| denoiseprofile | denoise (profiled) | ISO-aware NR |
| diffuse | diffuse or sharpen | wavelet sharpen/blur |
| dither | dither or posterize | |
| equalizer | color equalizer | wavelet color |
| exposure | exposure | |
| filmicrgb | filmic rgb | scene-referred tone curve |
| globaltonemap | (deprecated) global tonemap | |
| grain | grain | |
| hazeremoval | haze removal | dehaze |
| highlights | highlight reconstruction | |
| highpass | highpass | |
| hotpixels | hot pixels | |
| lens | lens correction | Lensfun + embedded |
| levels | (deprecated) levels | |
| liquify | liquify | |
| lowlight | lowlight vision | |
| lowpass | lowpass | |
| lut3d | LUT 3D | |
| monochrome | monochrome | B&W conversion |
| negadoctor | negadoctor | |
| nlmeans | (raw denoise; module is `rawdenoise`) | |
| orientation | orientation | |
| rawdenoise | raw denoise | |
| rawoverexposed | (utility, not iop) | |
| rawprepare | (internal — raw black/white point) | |
| relight | (deprecated) fill light | |
| retouch | retouch | |
| rgbcurve | rgb curve | |
| rgblevels | rgb levels | |
| rgb primaries | rgb primaries | |
| rotate | rotate pixels | |
| scale | scale pixels | |
| sharpen | sharpen | edge-mask supported |
| sigmoid | sigmoid | alt tonemap |
| soften | soften | |
| splittoning | split-toning | |
| spots | (deprecated) spot removal | |
| temperature | white balance | iop name is `temperature` |
| tonecurve | tone curve | |
| toneequal | tone equalizer | parametric-lift tone curve |
| useless | (internal) | |
| velvia | velvia | **legacy saturation** — docs say prefer `colorbalancergb` |
| vibrance | (deprecated) vibrance | replaced by `colorbalancergb` vibrance |
| vignette | vignetting | |
| watermark | watermark | |

### Geometric / perspective modules

| iop name | GUI name |
|---|---|
| crop | crop |
| flip | orientation |
| lens | lens correction |
| rotatepixels | rotate pixels |
| scalepixels | scale pixels |
| ashift | **rotate and perspective** (the keystone/perspective module — GUI name is "rotate and perspective", iop is `ashift`) |

### Deprecated but still-loadable modules (do not use for new work)

`basicadjustments`, `channelmixer` (old), `contrastbrightnesssaturation`,
`croprotate`, `defringe`, `fillight` (relight), `globaltonemap`, `invert`,
`levels`, `spotremoval` (spots), `tonemapping`, `vibrance`, `zonesystem`.

## 3. Mapping each operation to a darktable module

| Operation from the user's workflow | darktable module (iop name) | GUI name | Achievable via `--core`? |
|---|---|---|---|
| Straighten tilt | `ashift` | rotate and perspective | **No** — `--core` has no module syntax |
| Lens profile distortion/vignetting | `lens` | lens correction | **No** |
| Recover clipped highlights | `highlights` | highlight reconstruction | **No** |
| Lift crushed shadows | `shadowsandhighlights` (iop) or `toneequal` | shadows and highlights / tone equalizer | **No** |
| White balance / color cast | `temperature` (iop) | white balance | **No** |
| Vibrance (+10 to +15) | `colorbalancergb` → `global vibrance` | color balance rgb | **No** |
| Saturation (≤ +5) | `colorbalancergb` → `global saturation` (or legacy `velvia`) | color balance rgb / velvia | **No** |
| Clarity / micro-contrast | `bilat` (local contrast) | local contrast | **No** |
| Dehaze | `hazeremoval` | haze removal | **No** |
| Texture (positive or negative) | `bilat` or `diffuse` | local contrast / diffuse or sharpen | **No** |
| Skin smoothing / frequency separation | `diffuse` (diffuse or sharpen) + mask, or `equalizer`/`atrous` (contrast equalizer) with a skin mask | diffuse or sharpen / contrast equalizer | **No** (mask required) |
| Eye enhancement (radial mask + exposure/texture/sat) | `exposure` + `bilat` + `colorbalancergb` with **radial mask** | exposure + local contrast + color balance rgb | **No** (mask required) |
| Sclera lighten, teeth whiten (HSL) | `colorzones` (selective HSL) with mask, or `colorbalancergb` masked | color zones | **No** (mask required) |
| Background separation (subject-inversion mask) | `exposure` + `bilat` with **inverted drawn mask** | exposure + local contrast | **No** (mask required) |
| Sky masking (linear gradient) | `hazeremoval` + `bilat` + `colorbalancergb` with **gradient shape** | haze removal + local contrast + color balance rgb | **No** (mask required) |
| Foreground masking (linear gradient) | `toneequal` + `colorbalancergb` with **gradient shape** | tone equalizer + color balance rgb | **No** (mask required) |
| Atmospheric haze preservation | `hazeremoval` (reduce strength) | haze removal | **No** |
| Perspective / vertical keystoning | `ashift` | rotate and perspective | **No** |
| Structure (clarity +10 to +20) | `bilat` | local contrast | **No** |
| HSL de-cluttering (reduce non-subject saturation) | `colorzones` with mask | color zones | **No** (mask required) |
| B&W evaluation | `monochrome` | monochrome | **No** |
| Strict neutral WB (product) | `temperature` | white balance | **No** |
| Food warmth shift (+200 K to +400 K) | `temperature` (or `channelmixerrgb` for chroma) | white balance / color calibration | **No** |
| Orange/red luminance boost | `colorzones` (L channel by hue) | color zones | **No** |
| Specular highlight protection | `highlights` + `filmicrgb` | highlight reconstruction + filmic rgb | **No** |
| Edge sharpening with masking | `sharpen` (has built-in edge mask) | sharpen | **No** |
| Tone curve | `tonecurve` (display-referred) or `toneequal` (scene-referred) | tone curve / tone equalizer | **No** |
| Noise reduction (ISO-scaled) | `denoiseprofile` | denoise (profiled) | **No** |
| Sharpening with edge mask | `sharpen` | sharpen | **No** |

### Resolving the user's specific either/or questions

| Question | Answer |
|---|---|
| Lens correction → `darktable.lens` or `darktable.lenscorrection`? | **iop name is `lens`**. Neither `--core` string is real. |
| Highlight recovery → `darktable.highlightrecovery` or `darktable.colorsphere`? | **iop name is `highlights`** (GUI: "highlight reconstruction"). Neither string is real. |
| Shadow lift → `darktable.shadows` or `darktable.colorbalancergb`? | **iop names are `shadowsandhighlights` and `colorbalancergb`**. The user's `darktable.shadows` is not a real iop. |
| White balance → `darktable.whitebalance` or `darktable.chromaticadaptation`? | **iop name is `temperature`** (GUI: "white balance"). The "chromatic adaptation" function lives in `channelmixerrgb` (GUI: "color calibration"). |
| Vibrance vs saturation — does darktable distinguish? | **Yes.** `colorbalancergb` has separate `global vibrance` and `global saturation` sliders. The deprecated `velvia` and `vibrance` modules also exist but are not recommended. |
| Clarity / dehaze → `localcontrast`, `atrous`, `dehaze`? | **iop names are `bilat` (local contrast) and `hazeremoval` (haze removal).** `atrous` is the contrast equalizer (wavelet). There is no `dehaze` iop; dehaze is `hazeremoval`. |
| Texture → `sharpening` or different? | **Different.** Texture/clarity is `bilat` (local contrast). The `sharpen` iop is for output sharpening only. For skin texture reduction, `diffuse` (diffuse or sharpen) with a mask is the right tool. |
| Frequency separation — does darktable support it? | **Partially.** `diffuse` (diffuse or sharpen) and the equalizers (`atrous`/`equalizer`) implement wavelet decomposition, which is the mathematical basis of frequency separation. There is no one-click "frequency separation" module; you compose it with `diffuse` + a skin mask. |
| Radial mask → `darktable.mask`? | **No such iop.** Masks are a property of each module (via "drawn masks"), not a standalone module. Radial masks = the **ellipse** drawn-mask shape, with feathering. There is no separate `mask` iop. |
| Linear gradient mask → `darktable.mask`? | **Same answer.** Linear gradient is one of the drawn-mask shapes (`gradient`), available on every module that supports drawn masks. |
| Subject-inversion mask → `darktable.mask`? | **Same answer.** Every drawn mask has a polarity-toggle `+/-` button that inverts the mask. There is no `mask` iop. |
| HSL adjustments → `colorzones`, `channelmixerrgb`, or `hsl`? | **`colorzones`** is the HSL module. `channelmixerrgb` (color calibration) does channel mixing / chroma. There is no `hsl` iop. |
| Perspective correction → `ashift` or `perspective`? | **iop name is `ashift`**, GUI name is "rotate and perspective". |
| Tone curve → `tonecurve`? | **Yes**, iop name is `tonecurve`. Modern scene-referred alternative is `toneequal` (tone equalizer) or `filmicrgb`. |
| Noise reduction → `denoiseprofile` or `rawdenoise`? | **Both exist.** `denoiseprofile` (GUI: "denoise (profiled)") is the ISO-aware one for normal use. `rawdenoise` (GUI: "raw denoise") works on raw data pre-demosaic. |
| Sharpening with edge masking → `sharpen`? | **Yes.** The `sharpen` iop has a built-in edge mask (the "mask" slider) so edge masking is supported without an external mask. |

## 4. Masking in `--core` — the critical question

### Is headless masking possible via `--core`?

**No.** Masks have no representation in the `--core` argument syntax. There are
three reasons, each sufficient on its own:

1. **There is no `--core` module-parameter syntax to begin with** (see §1). So
   the question of how to encode a mask in `--core` is moot.

2. **Even if a `--conf`-style override existed** for module parameters, masks
   are not module parameters. Masks are stored as **separate data structures**
   attached to each module instance in the history stack. darktable's mask
   system supports:
   - **drawn masks** (vector shapes: brush, circle, ellipse, path, gradient,
     AI object)
   - **parametric masks** (per-channel trapezoidal opacity functions on L, a, b,
     C, h, R, G, B, H, S, L, Jz, Cz, hz — input or output)
   - **raster masks** (mask generated by an earlier module's output)
   - **AI masks** (vectorised from the `mask` task model, then stored as path
     shapes)
   - **mask combinations** (drawn ∩ parametric, with set operators: union,
     intersection, difference, exclusion)
   None of these have a `key=value` representation. Drawn masks are vector
   geometry; parametric masks are per-channel 4-marker trapezoids; raster
   masks reference another module's output.

3. **The darktable-cli man page and the `src/cli/main.c` source code make no
   mention of masks** in argument handling. The only mask-related CLI flag is
   `--export_masks <0|1>` (whether to **export** masks as separate layers in
   OpenEXR output — not whether to **apply** them).

### What is the workaround?

**XMP sidecar files.** darktable-cli accepts an XMP sidecar as its **second
positional argument**:

```
darktable-cli <input_file> <xmp_sidecar> <output_file_or_dir> [options]
```

The sidecar is loaded by `dt_exif_xmp_read()` (visible in `src/cli/main.c`,
just after the `id_list` is built). The sidecar contains the **full history
stack**, including:

- Every module that has been enabled on the image
- Every module's parameters (as `<darktable:` XML elements)
- Every mask attached to every module (drawn, parametric, raster)
- The module order preset
- The image's rank, colour labels, tags

XMP is the **only** headless mechanism darktable exposes for applying edits
that include masks.

### How do we get XMP sidecars for our 16 presets?

Three routes, in increasing order of effort:

1. **GUI authoring once, then ship the sidecars.** Open darktable on a
   representative NEF (or any raw), apply the preset's modules and masks,
   save the sidecar (`<image>.xmp`), rename it `nef-portrait-vivid.xmp`, commit
   it. darktable-cli loads it as the second positional arg. **This is the
   intended darktable workflow** and the only one that does not require
   reverse-engineering the XMP schema.

2. **Hand-author the XMP.** darktable's XMP is a custom RDF/XML schema. The
   `darktable:` namespace elements (`<darktable:history>` etc.) are not
   formally documented but are stable across releases. Feasible but fragile.

3. **Generate XMP via Lua inside a one-shot darktable run.** darktable's Lua
   API can construct a history stack programmatically and write the sidecar.
   Heavier than route 1, but scriptable. Useful if the 16 presets need to be
   regenerated from a parameter table.

### Does `--style <name>` work as an alternative?

**No** (already settled in ADR-0003). `--style` resolves against the darktable
library database (`librsqlite`), not against loose `.dtstyle` files. Seeding
that database headlessly is fragile and unsupported.

## 5. Parameter syntax — what `--core` actually accepts

The only documented `--core` parameter syntax is the darktable core's option
list, passed through verbatim. The relevant ones for our use case:

| `--core` flag | Purpose |
|---|---|
| `--conf <key>=<value>` | Override a darktablerc entry for this run only |
| `--configdir <dir>` | Set the darktable config directory (where `darktablerc` and `data.db` live) |
| `--cachedir <dir>` | Set the thumbnail/OpenCL cache location |
| `--tmpdir <dir>` | Set the temp-file directory |
| `--library <path>` | Set the library database location (use `:memory:` for an empty in-memory DB — darktable-cli prepends this already; passing it again via `--core` is allowed) |
| `--disable-opencl` | Disable OpenCL |
| `-t <n>` | Limit OpenMP threads |
| `-d <subsystem>` | Enable debug output for a subsystem |

### Documented `--conf` keys that matter for export

From the darktable-cli man page (these are the only `--conf` keys documented as
CLI-relevant):

```
--core --conf plugins/imageio/format/jpeg/quality=90
--core --conf plugins/imageio/format/tiff/bpp=16
--core --conf plugins/imageio/format/png/compression=6
--core --conf plugins/imageio/format/webp/quality=85
--core --conf plugins/imageio/format/jxl/effort=7
... (full list in the man page)
```

### Do `--conf` keys exist for module parameters?

darktablerc does contain keys like `plugins/darkroom/exposure/expanded=true`
(UI state) and `plugins/darkroom/sharpen/last_preset=...` (last-used preset
name) — but **not** for the actual module parameter values. Parameter values
are stored per-image in the history stack (XMP/library), not in darktablerc.

**So `--conf` cannot apply module parameters either.** `--core`'s only
parameter-injection mechanism is `--conf`, and `--conf` only writes to
darktablerc, and darktablerc does not store per-image module parameters.

This is the definitive answer to question 4: **there is no `--core` parameter
syntax for module parameters, full stop.**

## 6. Module ordering

### Does the order of semicolon-separated modules matter?

The question is **moot** because `--core` does not accept a
semicolon-separated module list. The user's `build_correction()` function
produces strings like `darktable.exposure:exposure=0.0;darktable.contrast:contrast=1.02`
which the darktable core parses as a single unknown positional — it never
splits on `;`.

### What about in XMP / the GUI?

In the XMP sidecar, module order is the order of `<rdf:li>` entries inside
`<darktable:history>`. darktable enforces a default pixelpipe order (the
"module order" preset, e.g. "v5.0 for RAW scene-referred") and the GUI lets
you reorder modules within that. For our purposes: when authoring sidecars
via the GUI, darktable handles the order. When hand-authoring, the order in
the XMP is the order darktable applies.

### Recommended module order for the user's workflow

Per darktable's scene-referred workflow recommendations and the user's
workflow stages:

1. **Geometric / lens**: `lens` (lens correction) → `ashift` (rotate and
   perspective) → `crop` → `orientation`
2. **Raw prep**: `rawprepare` (raw black/white point) → `highlights`
   (highlight reconstruction) → `temperature` (white balance) → `demosaic`
   → `hotpixels` → `rawdenoise` (if needed) → `denoiseprofile`
3. **Tone**: `exposure` → `toneequal` (tone equalizer) or `tonecurve` →
   `filmicrgb` (filmic rgb) or `sigmoid`
4. **Color grading**: `channelmixerrgb` (color calibration) →
   `colorbalancergb` (color balance rgb — vibrance/saturation) →
   `colorzones` (selective HSL, often masked)
5. **Local contrast / clarity**: `bilat` (local contrast) → `hazeremoval`
6. **Creative / masking-driven**: `diffuse` (diffuse or sharpen — for skin
   smoothing via mask) → `colorreconstruct` (color reconstruction) →
   `velvia` (legacy saturation, deprecated)
7. **Sharpening / output**: `sharpen` (output sharpen, with edge mask) →
   `vignette` (vignetting) → `grain` → `watermark`
8. **Conversion**: `monochrome` (B&W, applied last to override saturation)
   → `dither` (dither or posterize, last in pipe)

`monochrome` must be applied **after** any colour module whose saturation
delta would otherwise survive the B&W conversion — this matches the
existing `presets.md` contract.

## 7. Limitations of `--core` vs GUI — what is GUI-only?

Practically **all** image editing is GUI-only via `--core`, because `--core`
is not an editing interface. Concretely:

| Operation | GUI-only via darktable-cli? |
|---|---|
| Module parameter adjustment | **Yes — only via XMP sidecar or `--style` (library)** |
| Drawn masks (any shape) | **Yes — only via XMP sidecar** |
| Parametric masks | **Yes — only via XMP sidecar** |
| Raster masks | **Yes — only via XMP sidecar** |
| AI object masking | **Yes — only via XMP sidecar** (and the resulting mask is stored as path shapes anyway, so it's portable) |
| Module reordering | **Yes — only via XMP sidecar** |
| Multiple instances of the same module | **Yes — only via XMP sidecar** |
| Preset application (per module) | **Yes — only via XMP sidecar or `--style` (library)** |
| `darktablerc` defaults (no per-image effect) | No — `--conf` works |
| OpenCL toggle, thread count, debug | No — `--core` flags work |
| Output format / quality | No — `--out-ext` and `--conf plugins/imageio/format/...` work |
| ICC profile / intent | No — `--icc-type`, `--icc-file`, `--icc-intent` work |

The only image-affecting operations available headlessly are:
- Choosing the input file
- Choosing the XMP sidecar (the workaround)
- Choosing the output format and ICC
- Enabling HQ resampling, upscaling
- Setting export dimensions

## 8. The 3 most important modules the project is missing

If the project pivots to XMP sidecars, the modules most worth adding to the
current `presets.py` (which uses only `exposure`, `contrast`, `sharpening`,
`saturation`, `shadows`, `mono`, `tone`) are:

1. **`colorbalancergb`** (color balance rgb) — **vibrance and saturation
   belong here.** The current `darktable.saturation:saturation=1.25` is
   not a real module. The closest real iop for vibrance is `colorbalancergb`'s
   `global vibrance` slider, with `global saturation` as a separate slider.
   This matches the user's workflow rule "vibrance +10 to +15 before
   saturation (never exceed +5 global saturation)" exactly.

2. **`highlights`** (highlight reconstruction) — for "recover clipped
   highlights". The current `darktable.shadows:shadows=0.4` is not a real
   module; the real shadow-lift iop is `shadowsandhighlights` (GUI: "shadows
   and highlights") or `toneequal` (tone equalizer) for a parametric lift.
   For **clipped** highlights specifically, `highlights` (highlight
   reconstruction) is the right tool and is completely missing.

3. **`lens`** (lens correction) — for "lens profile distortion/vignetting
   correction". This is the universal-baseline step in the user's workflow
   and is absent. darktable's `lens` iop uses Lensfun + EXIF-identified lens
   and applies automatically when enabled; no per-image parameters are
   needed beyond enabling it.

Honourable mentions: `ashift` (perspective), `temperature` (real white
balance, current `darktable.tone:saturation` is not a real WB module),
`bilat` (local contrast — clarity/dehaze live here), `hazeremoval` (dehaze),
`colorzones` (selective HSL for teeth/sclera/skin-tone-lock), `diffuse`
(frequency-separation-style skin smoothing), `sharpen` (real output
sharpening with edge mask; current `darktable.sharpening:sharpen=0.2` is not
a real iop).

## 9. Operations from the user's workflow that are NOT achievable via `--core`

Strictly: **none of the operations are achievable via `--core`** — because
`--core` is not a module-parameter interface. Re-stated in the spirit the
question was asked: via the available headless mechanisms (XMP sidecar),
**all** operations are achievable. But the following are achievable **only
via XMP sidecar**, never via any `--core` flag:

- **Every mask-dependent operation** (which is most of the portrait,
  landscape, and architecture/street workflow):
  - skin tone lock (parametric mask on warm orange/red hue)
  - skin smoothing (frequency separation via mask)
  - eye enhancement (radial mask)
  - sclera lighten (mask)
  - teeth whiten (HSL + mask)
  - background separation (subject-inversion mask)
  - sky masking (linear gradient)
  - foreground masking (linear gradient)
  - HSL de-cluttering (selective saturation reduction with mask)
- **AI masking** (requires GUI to generate; result is vectorised and stored
  in XMP, so it can be re-applied headlessly once generated)
- **Multiple instances of the same module** (e.g. two `exposure` instances
  with different masks)
- **Module reordering** off the default pixelpipe preset
- **Per-module preset application**

Additionally, the following are achievable in principle but require
parameters that no `--core` flag can supply:

- **Highlight recovery** (`highlights` iop) — needs method selection and
  parameters via XMP
- **Lens correction** (`lens` iop) — auto-applies from EXIF, but enabling
  it requires the XMP history entry
- **White balance** (`temperature` iop) — needs temperature/tint values via
  XMP
- **Vibrance** (`colorbalancergb.global vibrance`) — needs value via XMP
- **Tone curve** — needs the curve points via XMP
- **Sharpening with edge mask** — the `sharpen` iop has the mask built in,
  but enabling and parameterising it still requires XMP

## 10. Worked example — a portrait preset as XMP, not `--core`

Below is a sketch of how the portrait preset would look **as a darktable-cli
invocation using an XMP sidecar**, contrasted with the current `--core`
form.

### Current (almost certainly broken)

```bash
darktable-cli /in/DSC_5128.NEF /out/portrait \
    --core "darktable.exposure:exposure=0.0;\
darktable.contrast:contrast=1.02;\
darktable.saturation:saturation=1.25"
```

### Corrected (using XMP sidecar)

```bash
darktable-cli /in/DSC_5128.NEF \
    /presets/nef-portrait-vivid.xmp \
    /out/portrait \
    --out-ext jpeg \
    --core --conf plugins/imageio/format/jpeg/quality=92
```

Where `nef-portrait-vivid.xmp` is a sidecar produced once by the operator
in the darktable GUI on a representative NEF, with the following module
stack (and masks where indicated):

| # | iop | GUI name | Key parameters | Mask? |
|---|---|---|---|---|
| 1 | lens | lens correction | method=Lensfun database, corrections=all | none |
| 2 | ashift | rotate and perspective | straighten=auto or 0.0°, no keystoning for portraits | none |
| 3 | highlights | highlight reconstruction | method=inpaint opposed | none |
| 4 | temperature | white balance | setting=as shot to reference | none |
| 5 | exposure | exposure | exposure=+0.0 EV (or as needed) | none |
| 6 | toneequal | tone equalizer | lift shadows by +0.3 EV, compress highlights -0.3 EV | none |
| 7 | filmicrgb | filmic rgb | default scene-referred curve | none |
| 8 | colorbalancergb | color balance rgb | global vibrance=+12, global saturation=+3 | none |
| 9 | colorbalancergb (instance 2) | color balance rgb | shadows lift=-0.05 (subject protection) | drawn: ellipse on face, inverted |
| 10 | diffuse | diffuse or sharpen | sharpen size=8, amount=-15 (skin smoothing) | drawn: ellipse on face skin area |
| 11 | bilat | local contrast | clarity=+15, contrast=+8 | drawn: ellipse on eyes, NOT inverted |
| 12 | exposure (instance 2) | exposure | exposure=+0.20 EV | drawn: ellipse on eyes |
| 13 | colorzones | color zones | hue=yellow, L=+10, S=-20 (teeth whiten) | drawn: path on teeth |
| 14 | sharpen | sharpen | amount=0.5, radius=0.8, mask=70 (edge mask) | none |
| 15 | monochrome | (only for `monochrome` sub-style) | mix=1.0 | none |

The XMP sidecar carries all of this — modules, parameters, masks, and
order — and darktable-cli applies it to every input NEF it is paired with.

### Practical note on sidecar portability across images

A sidecar built on one NEF applies cleanly to another NEF **if** the masks
are either:

- **Parametric** (no geometry to misalign), or
- **AI object** (re-vectorised on first apply per image — but this needs
  the AI model active at export time), or
- **Drawn with `gradient`/`ellipse` shapes positioned in normalized
  coordinates** (darktable stores shapes in image coordinates; a shape at
  the centre of image A is at the centre of image B).

Hand-drawn paths and brush strokes are image-specific. For a preset
template that works across many portraits, prefer **ellipse** and
**gradient** shapes positioned at frame-relative coordinates, or use
**parametric masks** keyed on hue/luminance (which is what the user's
"skin tone lock" calls for anyway).

## 11. Verification protocol (mandatory before code changes)

This research contradicts ADR-0003. Before acting on it:

1. **Reproduce the control test.** In the pinned `nef-editor-darktable:1`
   container:
   ```
   darktable-cli /probe/preview.jpg /out/control_a
   darktable-cli /probe/preview.jpg /out/control_b
   sha256sum /out/control_a/preview.jpg /out/control_b/preview.jpg
   ```
   If the two SHAs differ, the existing ADR-0003 evidence is explained by
   non-determinism. **This single test falsifies or confirms the headline
   finding.**

2. **If the control test confirms non-determinism**, file a new ADR
   superseding ADR-0003: "Presets are XMP sidecars, not `--core` strings."
   Move the parameter tables from `presets.py` into a sidecar-authoring
   plan.

3. **If the control test contradicts this research** (the two control SHAs
   are equal and the `--core` SHA genuinely differs), then `--core` *is*
   doing something the source code does not obviously show. In that case,
   re-open the investigation — possibly darktable's option parser has an
   undocumented code path that accepts `darktable.<module>:<param>=<value>`
   strings. Search `src/common/` and `src/develop/` for the parser.

The cost of the control test is two darktable-cli invocations (~14 s).
There is no excuse for skipping it.

## 12. References

### Primary sources

- darktable 5.6 user manual — `darktable-cli` invocation:
  https://docs.darktable.org/usermanual/5.6/en/special-topics/program-invocation/darktable-cli/
- darktable 5.6 user manual — `darktable` (core) invocation:
  https://docs.darktable.org/usermanual/5.6/en/special-topics/program-invocation/darktable/
- darktable 5.6 user manual — module reference (full module list):
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/
- darktable 5.6 user manual — masking & blending overview:
  https://docs.darktable.org/usermanual/5.6/en/darkroom/masking-and-blending/overview/
- darktable 5.6 user manual — drawn masks:
  https://docs.darktable.org/usermanual/5.6/en/darkroom/masking-and-blending/masks/drawn/
- darktable 5.6 user manual — parametric masks:
  https://docs.darktable.org/usermanual/5.6/en/darkroom/masking-and-blending/masks/parametric/
- darktable 5.6 user manual — AI masking:
  https://docs.darktable.org/usermanual/5.6/en/darkroom/masking-and-blending/masks/ai-masking/
- darktable 5.6 user manual — sidecar files:
  https://docs.darktable.org/usermanual/5.6/en/overview/sidecar-files/sidecar/
- darktable 5.6 user manual — exposure module:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/exposure/
- darktable 5.6 user manual — white balance module:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/white-balance/
- darktable 5.6 user manual — lens correction module:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/lens-correction/
- darktable 5.6 user manual — color balance rgb module:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/color-balance-rgb/
- darktable 5.6 user manual — velvia module:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/velvia/
- darktable source — `src/cli/main.c` (master branch):
  https://github.com/darktable-org/darktable/blob/master/src/cli/main.c
  (raw: https://github.com/darktable-org/darktable/raw/refs/heads/master/src/cli/main.c )
- darktable source — `src/iop/` directory (image operations, including
  `exposure.c`, `temperature.c`, `lens.c`, `ashift.c`, `colorbalancergb.c`,
  `bilat.c`, `hazeremoval.c`, `sharpen.c`, `highlights.c`,
  `shadowsandhighlights.c`, `toneequal.c`, `colorzones.c`, `diffuse.c`,
  `monochrome.c`)

### Project-internal references

- ADR-0003 (the ADR this research contradicts):
  `/Users/A200173944/PersonalCodes/fotography_ai/docs/adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md`
- Verification file containing the SHA-256 evidence:
  `/Users/A200173944/PersonalCodes/fotography_ai/docs/architecture/nef-editor-cli/verification.md`
- Existing preset implementation:
  `/Users/A200173944/PersonalCodes/fotography_ai/nef-editor/nef_editor/presets.py`
- Presets contract:
  `/Users/A200173944/PersonalCodes/fotography_ai/docs/architecture/nef-editor-cli/presets.md`

### Community / secondary (not used as primary evidence)

- pixls.us darktable-cli discussions (search "darktable-cli mask" and
  "darktable-cli xmp" on discuss.pixls.us) — consistent with the primary
  finding that masks require XMP sidecars; not cited above because the
  primary sources already answer the question.
