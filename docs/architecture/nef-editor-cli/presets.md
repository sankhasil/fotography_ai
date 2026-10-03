---
type: reference
title: NEF Photo Editor CLI — Preset Matrix
status: draft
date: 2026-10-02
part_of: ./plan.md
---

# Preset Matrix

Sixteen darktable styles: four categories × four sub-styles. This file is the contract for *what each
preset is for*. The exact darktable parameter values are authored by visual iteration against real
photographs and are **not** specified here — see [Authoring](#authoring-the-presets).

## Naming

```
nef-<category>-<sub-style>
```

Lowercase, hyphenated. The `nef-` prefix keeps our styles distinguishable from the user's own styles
in a shared darktable config directory, and makes `darktable-cli --style` selection unambiguous.

## Categories

| Category | Subject | Recognisable traits |
|---|---|---|
| `portrait` | People, and animals that read as people to a face detector | Faces present; moderate focal length; open aperture |
| `landscape` | Open scenes, horizons, wide vistas | Wide focal length; stopped-down aperture; deep depth of field |
| `macro` | Close subjects — insects, flowers, textures | Short focal length; f/4–f/8; close-focus metadata |
| `night` | Low-light scenes, city lights, astrophotography | High ISO; shutter at or above 1/30 s |

## Sub-styles

Sub-style is an **aesthetic intent**, chosen by the operator, not inferred from the scene. It applies
across all four categories.

| Sub-style | Intent | Relationship to `neutral` |
|---|---|---|
| `neutral` | Honest rendering. Correct exposure and white balance, minimal creative intervention. | The baseline. Every other sub-style is a deliberate departure from it. |
| `vivid` | Saturated, contrast-forward, punchy. | More saturation and contrast. |
| `grey` | Desaturated toward neutral **while retaining colour**. A restrained, editorial look. | Pulls saturation down without crossing to black-and-white. |
| `monochrome` | True black-and-white conversion. | The only sub-style that discards chroma entirely. |

`grey` and `monochrome` are distinct because they answer different requests. `grey` is a photographer
who wants less colour; `monochrome` is a photographer who wants no colour. Conflating them — as the
earlier draft proposed — would force the operator to choose between an over-saturated image and a
black-and-white one.

**Contract:** `monochrome` is the only sub-style permitted to fully desaturate. `grey` must retain
visible chroma. A `grey` preset that reads as black-and-white is a defect.

## The matrix

| | `neutral` | `vivid` | `grey` | `monochrome` |
|---|---|---|---|---|
| **portrait** | `nef-portrait-neutral` | `nef-portrait-vivid` | `nef-portrait-grey` | `nef-portrait-monochrome` |
| **landscape** | `nef-landscape-neutral` | `nef-landscape-vivid` | `nef-landscape-grey` | `nef-landscape-monochrome` |
| **macro** | `nef-macro-neutral` | `nef-macro-vivid` | `nef-macro-grey` | `nef-macro-monochrome` |
| **night** | `nef-night-neutral` | `nef-night-vivid` | `nef-night-grey` | `nef-night-monochrome` |

All sixteen names are fixed. A correction that does not exist at this exact name is a defect — the
lookup is a plain dictionary access and must never fall through to a default.

## These are `--core` parameter sets, not darktable styles

Revision 1 of this document specified these as `.dtstyle` files loaded via `darktable-cli --style`.
**That does not work.** `--style` resolves names against darktable's *library database*; dropping
files into `styles/` produces `cannot find the style 'nef-...' to apply during export`, and seeding
`librsqlite` headlessly is fragile. See
[ADR-0003](../../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md).

Instead each preset is a **data table in this repository**, translated at invocation into a
`--core` string:

```
darktable-cli <in.dng> <out>/<category> --core "<module>:<params>;<module>:<params>"
```

Verified in darktable-cli 5.6.1: `--core "darktable.exposure:exposure=0.5"` changes the output hash
with no library present.

## Composition: shared base, then deltas

The matrix is **not** sixteen independent corrections. It is one base plus a documented delta per
cell. This keeps the sixteen consistent and makes a correction to the base a correction everywhere.

```
base                 auto white balance, auto exposure, lens correction if available
  + category delta   subject-appropriate sharpening, noise handling, local contrast
  + sub-style delta  saturation and contrast departure from neutral
  + monochrome delta full chroma removal — applied last, overrides any sub-style saturation
```

**Contract:** `monochrome` is applied last and overrides the sub-style saturation delta. Otherwise a
residual tint survives the conversion.

### Category deltas

| Category | Delta |
|---|---|
| `portrait` | Protect skin tones. Slightly reduced global contrast, sharpening biased toward the subject rather than the background. |
| `landscape` | Depth and clarity. Modest local contrast to separate foreground from sky, careful highlight recovery. |
| `macro` | Micro-contrast and texture recovery at high effective magnification, with conservative noise reduction. |
| `night` | Noise reduction scaled by the actual ISO, shadow recovery, and restrained highlight handling around point light sources. |

`ponytail:` `night` is the one category where noise reduction **must** be driven by the photograph's
real ISO rather than fixed, because the useful range spans ISO 3200 to ISO 102400 and a single fixed
value is wrong at both ends. darktable supports an ISO-driven module; if that proves insufficient,
scale it per-invocation instead of authoring a style per ISO bucket. Revisit on the first batch of
genuinely high-ISO night photographs. Note the measured corpus tops out at ISO 25600, so the 102400
end of that range is a design allowance, not an observation.

### Sub-style deltas

| Sub-style | Delta |
|---|---|
| `neutral` | None. The base is the neutral rendering. |
| `vivid` | Increased vibrance, increased contrast. |
| `grey` | Reduced saturation, holding chroma above zero. |
| `monochrome` | Full desaturation. Applied last. |

## Picture Control is not read

Revision 1 had the detected Picture Control (`Exif.Nikon3.PictureControl`, `NikonPc.*`) nudging the
base. **Dropped.** It lives in Nikon's proprietary 213 KB `MakerNote` blob, which only exiftool can
read — and exiftool was deleted from the dependency list because pure Python covers every signal we
actually use.

Paying a subprocess call per photograph to bias a preset by a value we never validated is not worth
it. If Picture Control ever proves to matter, this decision is revisited with evidence.

Nikon does not publish Picture Control mathematics and it has not been reverse-engineered. These
presets are honest approximations, never pixel-identical to NX Studio output. Document that in the
tool's own output — a user comparing the two must be told why they differ rather than left to conclude
the tool is broken.

## Authoring the presets

**The parameters are not specified in this file, deliberately.** They are determined by comparing
renders against real photographs and iterating — which is the actual work of this project.

What this file fixes, and what must not drift:

| Fixed here | Determined by iteration |
|---|---|
| The sixteen preset names | Every darktable module parameter |
| The base-plus-delta structure | Which modules are in the base at all |
| Which delta applies in which order | The magnitude of each delta |
| `monochrome` overrides saturation | Per-category thresholds for sharpening and NR |
| Presets are `--core` strings, not styles | — this one is architectural |

**Acceptance:** a preset is done when a representative photograph in its category renders with a
defensible correction, the operator agrees it is an improvement over the uncorrected original, and it
is visually consistent with the other fifteen. Not when its parameters are filled in.

**Acceptance:** a preset is done when a representative photograph in its category renders with a
defensible correction, the operator agrees it is an improvement over the uncorrected original, and it
is visually consistent with the other fifteen. Not when its parameters are filled in.

## Sub-style selection

Sub-style is **never detected**. It is an operator choice, defaulting to `neutral`.

`--sub-style <name>` sets it for the whole run. `--category <name>` likewise bypasses classification
for a category. Both are the operator's escape hatch when automatic classification guesses wrong.

There is no `--auto-sub-style`, and adding one later would need a case for why an aesthetic intent is
inferable from metadata. It is not.