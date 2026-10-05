---
type: reference
title: Nikon Z 9 NEF Metadata Research — Beyond the 4 EXIF Signals
status: unverified
date: 2026-10-04
---

# Nikon Z 9 NEF Metadata — Beyond the 4 EXIF Signals

> Status: **unverified** against the operator's 209 Z 9 NEF files. All tag numbers
> and structures are sourced from the primary references at the end of this
> document. Before relying on any single tag, run
> `exiftool -s -G -<TagName> *.NEF` against the corpus to confirm coverage.
> ADR-0004's verification showed 209/209 for the four current tags; this
> document extends that work on paper only.

## Headline finding

**Roughly twenty standard EXIF tags we are not reading yet are directly
parseable by our existing ~40-line TIFF parser with ~20 lines of additions.
Most of them are more useful for category detection and QC guardrails than
the Nikon MakerNote tags the project previously dropped.**

Concretely, the standard ExifIFD already carries:

- `SceneCaptureType` (0xa306) — a 4-value enum: Standard / Landscape / Portrait / Night scene. This is the **camera's own scene classification** and is a stronger signal than anything we can derive from the preview.
- `ExposureProgram` (0x8822) — Normal / Aperture-priority / Shutter-priority / Portrait / Landscape / Sports / Macro / Manual. The Z 9 writes this on every frame.
- `LightSource` (0x9208) — the WB *preset* the camera chose: Daylight / Cloudy / Shade / Tungsten / Flash / Fluorescent / Auto. This is the WB setting the user is asking about; the Kelvin temperature lives in MakerNote.
- `MeteringMode` (0x9207) — Pattern / Spot / Center-weighted / Average. Spot metering on a face is a portrait tell.
- `ExposureMode` (0xa302) — Auto / Manual / Auto-bracket. A photographer who switched to Manual is signalling intent.
- `ExposureBiasValue` (0x9204) — exposure compensation in EV. Night scenes pushed +1 to +3 EV is a stronger night signal than ISO alone.
- `Flash` (0x9209) — fired, mode, red-eye. A portrait shot with fill flash is detectable here.
- `SubjectArea` (0x9214) — a bounding box (x, y, w, h) for the primary subject. The Z 9's auto-area AF writes this. Useful for portrait composition checks.
- `FocalLengthIn35mmFilm` (0xa305) — the 35 mm equivalent. Useful as a single wide/normal/tele bucket that does not depend on knowing the lens.
- `LensModel` (0xa434), `LensInfo` (0xa432) — the lens identity and spec (min/max focal, min/max aperture). Enough to look up the lens in the lensfun database for distortion/vignetting profiles. No MakerNote parsing required.
- `Saturation` (0xa309), `Contrast` (0xa308), `Sharpness` (0xa30a) — Normal / Low / High. Three-bit "look" the camera was told to apply.
- `ColorSpace` (0xa001) — sRGB vs Adobe RGB. The Z 9 also writes BT.2100 (HLG) when Picture Control *Tone* is set to it.

These are all in the **standard ExifIFD**, reachable today with `struct.unpack_from`
on a SHORT or RATIONAL entry. No MakerNote, no sub-IFD walk, no encryption.

## What lives where — a map

```
IFD0  ── Make, Model, Software, Orientation, ImageDescription (we have these)
  │
  ├── SubIFDs (0x014a) ── RAW payload offsets (darktable reads these)
  │     └── SubIFD3 ── 384 × 256 uncompressed RGB preview (Phase 3 will read this)
  │
  ├── ExifIFD (0x8769) ── ISOSpeedRatings, ExposureTime, FNumber, FocalLength
  │     │                (we have these four)
  │     │
  │     ├── 0x920a  FocalLength                  ✓
  │     ├── 0x9208  LightSource                  ✗  WB preset (the cheap one)
  │     ├── 0x9207  MeteringMode                 ✗
  │     ├── 0x9204  ExposureBiasValue            ✗
  │     ├── 0x9205  MaxApertureValue             ✗
  │     ├── 0x9209  Flash                        ✗
  │     ├── 0x9214  SubjectArea                  ✗  portrait composition signal
  │     ├── 0xa306  SceneCaptureType             ✗  ← the strongest free signal
  │     ├── 0xa302  ExposureMode                 ✗
  │     ├── 0xa303  WhiteBalance                 ✗  Auto vs Manual (one bit)
  │     ├── 0xa305  FocalLengthIn35mmFilm        ✗
  │     ├── 0xa307  GainControl                  ✗
  │     ├── 0xa308  Contrast                     ✗
  │     ├── 0xa309  Saturation                   ✗
  │     ├── 0xa30a  Sharpness                    ✗
  │     ├── 0xa30c  SubjectDistanceRange         ✗  Macro / Close / Distant
  │     ├── 0xa001  ColorSpace                   ✗
  │     ├── 0xa432  LensInfo                     ✗  lens spec → lensfun lookup
  │     ├── 0xa434  LensModel                    ✗  lens name → lensfun lookup
  │     ├── 0xa435  LensSerialNumber             ✗
  │     ├── 0x927c  MakerNote ── Nikon proprietary, see below
  │     └── 0x9286  UserComment                  ✓ we write this on export
  │
  └── GPSIFD (0x8825) ── only if the operator enabled GPS (Z 9 has no built-in GPS)
```

## Standard EXIF tags beyond the 4 we read

All in the standard ExifIFD. None require MakerNote parsing. None require a
sub-IFD walk. The existing `_read_ifd` in `nef_editor/exif.py:97` already
returns these — the work is adding `_scalar`/`_rational` calls and storing
into `Metadata`.

| Tag | Name | Type | What it tells us | Category use |
|---|---|---|---|---|
| 0x8822 | ExposureProgram | int16u | 1=Manual, 2=Normal, 3=Aperture-priority, 4=Shutter-priority, 5=Creative, 6=Action, 7=Portrait, 8=Landscape, 0xffff = Auto (EXIF 2.3 §A.6) | The Z 9 writes **8=Portrait** or **7=Landscape** only when the user explicitly selected the scene mode; otherwise it writes 0xffff Auto. Useful when present, not always present. |
| 0x9204 | ExposureBiasValue | rational64s | exposure compensation in EV (e.g. `1/3` = +0.33 EV) | Night: pushed +1 to +3 EV is a stronger signal than ISO alone. Portrait: ±0 EV fill flash. |
| 0x9205 | MaxApertureValue | rational64u | lens max aperture at the current focal length (APEX, `2*log2(N)`) | Distinguishes "wide-open prime" from "stopped-down zoom" without parsing the lens string. |
| 0x9207 | MeteringMode | int16u | 1=Average, 2=CenterWeightedAverage, 3=Spot, 4=MultiSpot, 5=Pattern (Nikon 3D Matrix), 6=Partial, 255=Other | Spot metering on a face → portrait tell. Matrix → landscape / general. |
| 0x9208 | LightSource | int16u | 0=Unknown, 1=Daylight, 2=Fluorescent, 3=Tungsten, 4=Flash, 9=Fine weather, 10=Cloudy, 11=Shade, 12=Daylight fluorescent, 13=Day White fluorescent, 14=Cool White fluorescent, 17=Standard Light A, 20=D55, 21=D65, 22=D75, 255=Other | The **WB preset the camera used** — the user's first answer to "what WB do you want?". For Auto WB the Z 9 writes 0=Unknown. |
| 0x9209 | Flash | int16u | bit field: fired / mode / red-eye / function / return | Portrait with fill flash fired is detectable. |
| 0x9214 | SubjectArea | int16u[2 or 4] | bounding box (x, y, w, h) or two points (x, y) × 2 | A non-empty bounding box near the upper third is a classic portrait composition. Empty for landscapes. The Z 9's auto-area AF fills this when it picks a subject. |
| 0xa001 | ColorSpace | int16u | 1=sRGB, 2=Adobe RGB, 0xffff=Uncalibrated, 65535=Other | Adobe RGB implies a colour-managed workflow; not a category signal. |
| 0xa002 / 0xa003 | PixelXDimension / PixelYDimension | int32u | Rendered image dimensions | Sanity check; also lets us validate the 384 × 256 preview size against the metadata. |
| 0xa302 | ExposureMode | int16u | 0=Auto, 1=Manual, 2=Auto-bracket | Manual mode is a deliberate-photographer tell; Auto-bracket is a HDR / focus-stack tell. |
| 0xa303 | WhiteBalance | int16u | 0=Auto, 1=Manual | A single bit. The actual preset lives in `LightSource` (0x9208); the Kelvin temperature lives in MakerNote. |
| 0xa305 | FocalLengthIn35mmFilm | int16u | 35 mm-equivalent focal length | Body-independent wide/normal/tele bucket. The Z 9 is full-frame, so this equals `FocalLength`; on a DX body it would not. Useful as a portable signal. |
| 0xa306 | SceneCaptureType | int16u | 0=Standard, 1=Landscape, 2=Portrait, 3=Night scene | **The camera's own scene classification.** Strongest free signal in the file. Read this *before* running the preview classifier; the preview classifier becomes the tiebreaker for `0=Standard`. |
| 0xa307 | GainControl | int16u | 0=None, 1=Low gain up, 2=High gain up, 3=Low gain down, 4=High gain down | High gain up = pushed ISO = night / dark scene. |
| 0xa308 / 0xa309 / 0xa30a | Contrast / Saturation / Sharpness | int16u | 0=Normal, 1=Low, 2=High | The Picture Control *base* settings. Saturation=High correlates with landscape/product; Saturation=Low with portrait. |
| 0xa30c | SubjectDistanceRange | int16u | 1=Macro, 2=Close view, 3=Distant view | Coarse distance bucket. Macro = product / food; Distant = landscape. |
| 0xa432 | LensInfo | rational64u[4] | (min focal, max focal, min aperture, max aperture) | The full lens specification. With `LensModel` this is the key into the lensfun database. |
| 0xa433 / 0xa434 / 0xa435 | LensMake / LensModel / LensSerialNumber | string | "NIKON" / "NIKKOR Z 24-200mm f/4-6.3 VR" / serial | The lens identity. lensfun uses these to look up the distortion and vignetting profile. |
| 0xa500 | Gamma | rational64u | Gamma value | Diagnostic only; not a category signal. |

### What is *not* in the standard ExifIFD

| Signal | Where it actually lives | Cost |
|---|---|---|
| Kelvin colour temperature of the chosen WB | Nikon MakerNote 0x004f `ColorTemperatureAuto` (int16u, Kelvin for Auto WB) | MakerNote walk, see below |
| WB RGGB multipliers as shot | Nikon MakerNote 0x000c `WB_RBLevels` (rational64u[4]) | MakerNote walk |
| WB RGGB for each preset (Daylight, Cloudy, Shade, …) | Nikon MakerNote 0x0097 `ColorBalance*` (sub-IFD, offset-indexed, multiple versioned variants) | Hard — see MakerNote section |
| Picture Control name (Standard, Vivid, Portrait, Landscape, …) | Nikon MakerNote 0x0023 `PictureControlData` (binary blob, 4 versioned formats) | Hard |
| Active D-Lighting strength | Nikon MakerNote 0x0022 `ActiveD-Lighting` (int16u) | MakerNote walk, easy once you're in |
| Vignette Control applied in-camera | Nikon MakerNote 0x002a `VignetteControl` (int16u) | MakerNote walk |
| Distortion correction applied in-camera | Nikon MakerNote 0x002b `DistortInfo` (sub-IFD, offset-indexed) | Hard |
| Per-lens distortion coefficients (for lens correction) | **Not in the NEF at all.** Look up by `LensModel` in the lensfun database. | Trivial once `LensModel` is read |
| Mechanical / electronic shutter mode | Nikon MakerNote 0x0034 `ShutterMode` (int16u) | MakerNote walk |
| Shutter actuation count | Nikon MakerNote 0x00a7 `ShutterCount` (int32u, encrypted on some bodies) | MakerNote walk + decryption |
| Face positions | Nikon MakerNote 0x0021 `FaceDetect` (sub-IFD) | Hard, and we already concluded faces are infeasible at 384 × 256 |

## Nikon MakerNote structure

### Layout

Per exiv2's makernote table ([ref 2](#references)) and exiftool's Nikon.pm
([ref 3](#references)):

1. The MakerNote is the value of EXIF tag **0x927c `MakerNote`** in the
   ExifIFD. Nikon Z bodies write it as an opaque `undef` blob — on the Z 9,
   the operator's corpus measured it at ~213 KB.
2. The blob starts with the 8-byte signature `"Nikon\0" + 0x02 0x10` followed
   by a 10-byte TIFF header (`II` or `MM`, magic 42, IFD0 offset). The
   ExifIFD's `MakerNote` value pointer + 18 is the start of the MakerNote's
   own TIFF header.
3. From that point, the MakerNote is **a standard TIFF IFD**: 2-byte count,
   N × 12-byte entries (tag, type, count, value/offset), then a 4-byte
   next-IFD pointer. Offsets inside the MakerNote are **relative to the
   MakerNote's TIFF header**, not to the file start.
4. This is the same structure as the outer NEF, so the existing
   `_read_ifd` in `nef_editor/exif.py:97` parses it with one change: every
   value offset must be rebased by adding the MakerNote TIFF header's file
   offset. The function becomes ~10 lines longer, not a rewrite.

### Known useful MakerNote tags (top level — once the rebased IFD is walked)

These are all in ExifTool's `Nikon` tag table ([ref 1](#references)). The
ones marked "easy" are scalar/string tags the same shape as the standard
EXIF tags; "hard" ones are nested sub-IFDs or binary blobs whose internal
layout varies by firmware.

| Tag | Name | Type | Use | Pure-Python difficulty |
|---|---|---|---|---|
| 0x0001 | MakerNoteVersion | undef[4] | Sanity check; version dispatch | easy |
| 0x0003 | ColorMode | string | "sRGB", "AdobeRGB", "BT2100" — confirms `ColorSpace` | easy |
| 0x0004 | Quality | string | "RAW", "RAW+JPEG", "FINE", "NORMAL" | easy |
| **0x0005** | WhiteBalance | string | "AUTO", "DAYLIGHT", "CLOUDY", "SHADE", "INCANDESCENT", "FLUORESCENT", "FLASH", "KELVIN", "PRESET" — the **named WB setting**, more readable than the EXIF `LightSource` int | easy |
| 0x000b | WhiteBalanceFineTune | int16s[n] | the tint / amber-magenta shift in Nikon's arbitrary units | easy |
| **0x000c** | WB_RBLevels | rational64u[4] | the actual WB multipliers as shot — what darktable reads to apply "as-shot WB" | easy |
| 0x001e | ColorSpace | int16u | 1=sRGB, 2=Adobe RGB, 4=BT.2100 — duplicates EXIF tag | easy |
| 0x0022 | ActiveD-Lighting | int16u | 0=Off, 1=Low, 3=Normal, 5=High, 65535=Auto | easy |
| 0x0023 | PictureControlData | undef^ | nested; see below | hard |
| 0x002a | VignetteControl | int16u | 0=Off, 1=Low, 3=Normal, 5=High | easy |
| 0x002b | DistortInfo | sub-IFD | offset-indexed subfields | hard |
| 0x0034 | ShutterMode | int16u | 0=Mechanical, 16=Electronic, 48=Electronic Front Curtain, 64=Electronic (Movie), 96=Electronic (High Speed) | easy |
| 0x004f | ColorTemperatureAuto | int16u | Kelvin value the Auto WB computed — **the value the user actually wants** | easy |
| 0x0089 | ShootingMode | int16u bitfield | Continuous / Delay / Self-timer / Exposure Bracketing / Auto ISO / WB Bracketing / D-Lighting Bracketing / Pre-capture | easy |
| 0x008f | SceneMode | string | "Portrait", "Landscape", "Close up", "Sports", "Night portrait", "Night landscape", "Sunset", "Candle", "Food", "Architecture", "Auto" | easy — and a **direct category signal** for the modes that set it |
| 0x0093 | NEFCompression | int16u | 14 = High Efficiency* (the tag we already use to detect HE*) | easy (we read it through exiftool today; reading direct is trivial) |
| 0x00a7 | ShutterCount | int32u! | body actuation count; on some bodies encrypted with SerialNumber+ShutterCount as key | hard on encrypted bodies; the Z 9 writes it unencrypted per ExifTool Z9 ShotInfo docs, but verification needed |
| 0x0098 | LensData* | sub-IFD | lens distortion / vignetting correction hints (encrypted on many bodies; the Z 9 *may* be unencrypted — needs verification) | hard |
| 0x0097 | ColorBalance* | sub-IFD | WB RGGB levels for every preset (Daylight, Cloudy, Shade, Tungsten, Fluorescent W/N/D, Flash, Custom, Auto) — offset-indexed subfields, **8 versioned variants** (ColorBalance0100, ColorBalance0102, … ColorBalanceUnknown) | hard |
| 0x004e | NikonSettings | undef^ | sub-IFD, per-setting offsets | hard |

### Picture Control — re-evaluation

ADR-0004 dropped Picture Control on the grounds that it lived only in
MakerNote and justified exiftool as a subprocess. That decision still
holds *if* Picture Control is needed as a string. The reality is more
nuanced:

- The tag is 0x0023 `PictureControlData`, a `undef^` blob of 348 bytes on
  current Z bodies. ExifTool dispatches to four sub-parsers
  (`PictureControl`, `PictureControl2`, `PictureControl3`,
  `PictureControlUnknown`) based on the version byte at offset 0.
- The first 4 bytes are the version (`0100`, `0200`, `0300`). The Picture
  Control *name* ("Standard", "Vivid", "Portrait", "Landscape", "Monochrome",
  "Flat", "Creative", "Photo-Sharp", "Photo-Vivid", "Photo-Soft", "Xtra"…)
  lives at a **fixed offset** inside each version's blob — the offsets are
  documented in ExifTool's `Nikon.pm` `PictureControl3` table for current Z
  bodies.
- A pure-Python reader can therefore: detect the version, read the name
  bytes, NUL-terminate, decode as ASCII. ~30 lines, no sub-IFD walk needed.
- **However**, the base tone / saturation / contrast / sharpening values
  inside Picture Control are what darktable would need to *apply* the
  look — and darktable does not read NEF MakerNote. It applies its own
  default tone curve. So even if we read the name, we cannot make
  darktable apply that exact look without rewriting the preset pipeline.

Verdict: Picture Control is **readable in pure Python** if we want the
*name* for category hints (Vivid = landscape intent, Portrait = portrait
intent, Monochrome = a deliberate B&W). The full look would still need
the preset pipeline. Re-reading ADR-0004's "scope guard": the decision
covers standard EXIF only; the moment we want MakerNote tags, we should
reconsider exiftool. The complication is that exiftool-as-subprocess was
rejected for being a per-photograph subprocess — but ~30 lines of pure
Python on a 348-byte blob has no such cost.

### Stability across Z bodies

ExifTool's `Nikon.pm` has separate `ShotInfoZ6III`, `ShotInfoZ7II`,
`ShotInfoZ8`, `ShotInfoZ9` sub-tables (ref 1, tag 0x0091). Each has its own
offset-indexed layout. The *top-level* MakerNote IFD is stable across Z
bodies; the per-body variation is in the nested ShotInfo blob. The easy
tags above (string / int16u at the top level) are stable.

### Is any of it readable in pure Python?

**Yes, the top-level IFD is.** Adding ~30 lines to `_read_ifd` to support
a `base_offset` parameter (the MakerNote TIFF header's file position)
gives access to every tag marked "easy" above. The work is mechanical:
locate the ExifIFD tag 0x927c, slice its value bytes, find the 18-byte
signature, then call the existing IFD reader with `base_offset` added to
every offset.

The "hard" tags are hard because Nikon uses **non-IFD layouts** for the
nested data: subfields are addressed by absolute byte offset from the
sub-IFD's start, not by IFD tag entries. Reading them is reverse-engineered
and per-version. ExifTool's `Nikon.pm` is the documentation; it is 14,282
lines and growing. Replicating it in pure Python would be the
"reverse-engineering effort inside this project" that ADR-0004 explicitly
ruled out.

## Lens correction data

### What the NEF carries

- **Lens identification** is in the **standard ExifIFD**: `LensModel`
  (0xa434) = "NIKKOR Z 24-200mm f/4-6.3 VR", `LensInfo` (0xa432) = the
  (24, 200, 4, 6.3) rational64u[4]. Our existing parser reads both with no
  change beyond adding two `_ascii` / `_rational` calls. **No MakerNote
  needed.**
- **In-camera applied correction**: Nikon MakerNote tag 0x002a
  `VignetteControl` (Off/Low/Normal/High) and 0x002b `DistortInfo`
  (sub-IFD, offset-indexed). These tell you what the camera applied while
  developing the JPEG preview — they do *not* give you the polynomial
  coefficients to apply yourself.
- **Per-lens distortion coefficients**: **not in the NEF.** Nikon embeds
  them in the lens firmware and in the lensfun database, not in the file.

### What darktable / lensfun uses

darktable applies lens correction via the **lensfun** database, a set of
XML files keyed by `LensModel` + `LensInfo` (and `Make` + `Model` for the
camera). For the NIKKOR Z 24-200mm f/4-6.3 VR, the profile is in lensfun's
`nikon-z.xml`. The pipeline:

1. darktable reads `LensModel` from the standard EXIF (it has its own TIFF
   parser).
2. It looks the lens up in the lensfun database (installed system-wide).
3. It applies the polynomial distortion and the radial vignetting model.

**We do not need to read the MakerNote to get lens correction.** We need
`LensModel` and `LensInfo` from the standard ExifIFD, both already
trivially reachable. If we want to apply the same correction in our own
preview-rendering path (Phase 3+), we can read the lensfun XML with
`xml.etree.ElementTree` (stdlib) and apply the polynomial in pure Python.
But for v1, darktable-cli already does this; we just need to make sure
the lensfun database is installed in the Docker image (it is, per the
existing darktable container).

### Practical implication

For lens correction we add **two EXIF reads** (`LensModel`, `LensInfo`),
one `LensModel` string, one `LensInfo` rational64u[4]. That is enough to
log the lens alongside the category and to let darktable find the right
profile. No MakerNote.

## Histogram from the 384 × 256 preview

### Where the preview lives

Per `verification.md` and `phase-3-preview-classifier.md`, the Z 9 NEF
contains an uncompressed 384 × 256 RGB preview in **SubIFD3**, reachable
by walking the IFD0 tag 0x014a `SubIFD` entries. Phase 3 item 3.1 already
plans to extract it as raw bytes with no PIL dependency.

### Computing a histogram in pure Python

The preview is 384 × 256 × 3 = 294,912 bytes of 8-bit RGB. Pure-Python
histogram:

```python
def histogram(rgb: bytes) -> tuple[list[int], list[int], list[int]]:
    r = [0] * 256
    g = [0] * 256
    b = [0] * 256
    for i in range(0, len(rgb), 3):
        r[rgb[i]] += 1
        g[rgb[i + 1]] += 1
        b[rgb[i + 2]] += 1
    return r, g, b
```

Cost on a 295 KB buffer: ~100 ms in CPython, ~10 ms in PyPy, negligible
either way against the darktable render cost. No numpy, no Pillow.

### What the histogram tells us

| Signal | Computation | Meaning |
|---|---|---|
| Blown highlights | `r[255] + g[255] + b[255]` as fraction of total pixels | >0.5% in any one channel is visible clipping. darktable's own `clip` module does this on the rendered output, but the preview's clipping is a near-identical proxy because the camera's tone curve is monotonic. |
| Crushed shadows | `r[0] + g[0] + b[0]` as fraction of total pixels | >1% in any channel is crushed blacks. |
| Mean luminance | `0.299 * mean(r) + 0.587 * mean(g) + 0.114 * mean(b)` | Exposure assessment: <40 dark, >180 bright. |
| Per-channel means | `mean(r), mean(g), mean(b)` | Color cast: any channel >10% off the others is a cast. Useful for "the camera picked a wrong WB" detection. |
| Channel histograms shape | skewness of each histogram | A bimodal histogram suggests a high-contrast scene (portrait with window light); a unimodal narrow one suggests flat light (overcast landscape). |
| Highlight rolloff | fraction of pixels in 240–255 | A camera that applies HLG or Nikon's "Flat" Picture Control rolls off smoothly; a hard clip at 255 is "Standard". Not a QC signal but a profile fingerprint. |

### Caveats

- The preview is **tone-mapped by the camera**, not raw. So a "blown
  highlight" in the preview means "the camera's tone curve clipped at
  255", not "the raw sensor clipped". For raw clipping we would need the
  raw data, which we cannot decode on HE\* files (see `he-decoder-research.md`).
  In practice, the camera's tone curve preserves ~1.5 stops of headroom
  above the 255-marked pixels, so preview clipping is a *conservative*
  signal: a non-clipped preview guarantees the raw has headroom; a
  clipped preview may or may not be clipped in the raw.
- For QC guardrails this is exactly what we want. The operator asks "is
  anything definitely blown?" The answer from the preview is "no" when
  the preview has no 255 pixels. That is a useful negative guarantee.

### Can it replace darktable's own analysis?

**For triage yes; for fine-grained QC no.** darktable's histogram is
computed on the 16-bit linear raw data after demosaic, which has 4–6
stops more headroom than the 8-bit tone-mapped preview. Our preview
histogram answers "is this picture obviously broken?" — a fast gate
before darktable. darktable's histogram answers "exactly how much
highlight detail can I recover?" — a fine-grained edit decision.

For the operator's stated workflow (auto-apply presets to 209 photos,
flag the broken ones for manual review), the preview histogram is
**sufficient** for the gate. darktable remains the truth for any photo
that survives the gate.

## White balance — camera-recorded vs preview-derived

### Camera-recorded WB

In **standard EXIF**: only `LightSource` (0x9208) — the preset the
user/camera selected (Daylight, Cloudy, Shade, …). One short integer.
No Kelvin value, no tint, no multipliers.

In **MakerNote** (the cheap top-level tags):
- 0x0005 `WhiteBalance` — the named setting as a string ("AUTO",
  "DAYLIGHT", "KELVIN", "PRESET"). More readable than the EXIF integer.
- 0x000c `WB_RBLevels` — the **as-shot** WB multipliers as rational64u[4].
  This is what darktable reads to apply "camera as-shot WB". darktable
  reads this from the raw file's own metadata, not from MakerNote — it
  has its own parser.
- 0x004f `ColorTemperatureAuto` — the **Kelvin value the Auto WB
  algorithm chose**, as int16u. This is the value the operator's "what
  Kelvin did the camera think it was?" question wants.
- 0x000b `WhiteBalanceFineTune` — the amber-magenta shift the user
  applied on top of the preset.

Reading these requires the MakerNote walk described above. None are
encrypted on the Z 9 per ExifTool's tag documentation; all are at fixed
offsets in the top-level MakerNote IFD.

### Preview-derived WB

From the 384 × 256 preview alone (no MakerNote):

- **Grey-world**: scale each channel so `mean(R) = mean(G) = mean(B)`.
  Cheap, robust for scenes with no dominant color, biased for
  landscape (heavy green/blue) and product (saturated color).
- **White-patch**: find the brightest non-clipped pixel, assume it is
  neutral, scale to make it `(255, 255, 255)`. Cheap, biased when there
  is no true white in the scene.
- **Grey-edge / weighted grey-edge**: a step up; still pure Python.

### Accuracy comparison

| Method | Source | Accuracy | Bias |
|---|---|---|---|
| Camera as-shot WB (`WB_RBLevels`) | MakerNote, raw sensor data | the truth the camera computed | none |
| Camera Auto WB Kelvin (`ColorTemperatureAuto`) | MakerNote | the camera's Kelvin number for Auto | none |
| Camera WB preset name (`LightSource` EXIF) | standard EXIF | only the preset, not the value | none for the preset |
| Grey-world from preview | 295 KB RGB | ±200 K for neutral scenes | fails on dominant-color scenes |
| White-patch from preview | 295 KB RGB | ±100 K when a true white exists | fails on no-white scenes (forest, sky) |

For a professional photo editing workflow, **the camera-recorded WB is
strictly better** because it is computed from the raw sensor data, not
from the tone-mapped preview. The preview-derived methods are useful
only when MakerNote is unavailable — for example, for category
detection (warm vs cool scene as a portrait/landscape tell), where
±200 K is irrelevant.

### Recommendation

For WB: read `LightSource` from standard EXIF now (free, 5 lines), defer
MakerNote tags until a concrete need appears (white-balance
re-rendering would need them, but we are not doing that — darktable
handles WB from the raw file's own metadata).

For category detection: the WB preset alone is a weak signal (Auto is
the most common value); the preview-derived color temperature is
stronger and is already in the Phase 3 feature vector plan.

## Category detection signals

For each of the 5 categories in `presets.md`, signals available in
priority order (strongest first). All standard-EXIF signals are
readable today; MakerNote signals need the walk; preview signals need
Phase 3 item 3.1.

| Category | Signal 1 | Signal 2 | Signal 3 | Signal 4 |
|---|---|---|---|---|
| **Portrait** | `SceneCaptureType` (0xa306) = 2 — strongest free signal | `ExposureProgram` (0x8822) = 7 (Portrait mode) | `SubjectArea` (0x9214) non-empty + upper-third placement | Preview skin-tone ratio (Phase 3) |
| **Landscape** | `SceneCaptureType` (0xa306) = 1 — strongest free signal | `ExposureProgram` (0x8822) = 8 (Landscape mode) | `FocalLengthIn35mmFilm` (0xa305) ≤ 35 mm | Preview green+blue dominance (Phase 3) |
| **Night** | `ExposureBiasValue` (0x9204) ≥ +1 EV (current rule uses only ISO; adding bias closes the "vacuous shutter test" gap from `verification.md`) | `GainControl` (0xa307) ≥ 2 (high gain up) | `SceneCaptureType` (0xa306) = 3 (Night scene) | ISO ≥ 3200 (current rule) |
| **Architecture / street** | `FocalLengthIn35mmFilm` (0xa305) ≤ 24 mm (architecture) or 24–50 mm (street) | `ExposureMode` (0xa302) = Manual (deliberate) | `Saturation` (0xa309) = Normal or Low (architecture) | Preview edge density (Phase 3, future) |
| **Product / food** | `FocalLengthIn35mmFilm` (0xa305) 50–100 mm (tabletop) | `FNumber` (we have it) ≥ f/8 — but the corpus stops at f/6.3 per `verification.md`, so this signal is dead for our lens | `SubjectDistanceRange` (0xa30c) = 1 (Macro) or 2 (Close) | `Saturation` (0xa309) = High (food) and preview saturation (Phase 3) |

### Notes

- **`SceneCaptureType` is the headline finding for category detection.**
  The Z 9 writes it. It is the camera's own scene classification. For
  photos shot in Auto / Program / Aperture-priority / Shutter-priority /
  Manual modes, the value is `0=Standard` (the camera does not presume a
  scene). For photos shot in a Scene mode (Portrait, Landscape, Night
  Portrait, Night Landscape, Close up, Sports, Food, …), the value
  matches the mode. So `SceneCaptureType` only fires for photos the
  operator already told the camera the scene for. For the rest, we fall
  back to the other signals and the preview classifier.
- The corpus in `verification.md` was shot with the NIKKOR Z 24-200mm
  f/4-6.3 VR lens only. The aperture signal is dead for this lens (max
  f/6.3). The focal length signal is alive (24-200 mm, 61 distinct
  values). Per-body, the **focal-length 35 mm-equivalent** is a
  body-independent bucket we can hard-code: ≤24 mm architecture, 24-50
  street, 50-100 portrait/tabletop, ≥100 telephoto.
- The Phase 3 preview classifier (skin-tone, blue-green ratio) is the
  tiebreaker for photos where EXIF signals are ambiguous. Reading
  `SceneCaptureType` first means the preview classifier only needs to
  fire on `SceneCaptureType=0` photos, which is the majority of the
  corpus.

## Pure-Python feasibility — summary

| Tag | Lives in | Reader complexity | Effort |
|---|---|---|---|
| All standard EXIF tags (the table above) | ExifIFD | 0 — `_read_ifd` already returns them | 5 lines per tag in `_parse` |
| Nikon MakerNote top-level (string / int16u / rational64u) | MakerNote IFD (offset rebased) | ~30 lines: locate 0x927c, slice, rebase offset, walk | half a day |
| Nikon MakerNote nested (PictureControl name only) | 348-byte blob at fixed offset | ~30 lines: detect version, slice name bytes | half a day |
| Nikon MakerNote nested (LensData, ColorBalance, NikonSettings, ShotInfoZ9, DistortInfo) | sub-IFDs with version-specific offset layouts | replicate ~1k lines of ExifTool's Nikon.pm | **do not pursue** — this is the reverse-engineering effort ADR-0004 ruled out |
| Lensfun lookup for lens correction | `LensModel` + `LensInfo` (standard EXIF) | parse system XML with `xml.etree` | 1 hour |
| Preview histogram (295 KB RGB) | SubIFD3, already planned in Phase 3.1 | ~20 lines | 1 hour |
| Preview-derived WB (grey-world / white-patch) | preview bytes | ~30 lines | 1 hour |

### What we should do, in priority order

1. **Add `SceneCaptureType` and `ExposureProgram`** — the two single most
   useful tags for category detection, both in standard EXIF, both
   read by our existing parser with two extra `_scalar` calls. Effort:
   30 minutes including tests.
2. **Add `LightSource`, `MeteringMode`, `ExposureBiasValue`, `Flash`,
   `FocalLengthIn35mmFilm`, `ExposureMode`, `SubjectArea`** — all
   standard EXIF, all category-detection signals. Effort: 1 hour,
   one branch per tag in `_parse`.
3. **Add `LensModel` and `LensInfo`** — for lens identification and
   lensfun lookup. Standard EXIF. Effort: 30 minutes.
4. **Add `Saturation`, `Contrast`, `Sharpness`, `SubjectDistanceRange`,
   `ColorSpace`, `GainControl`** — diagnostic and category-adjacent.
   Standard EXIF. Effort: 1 hour.
5. **Add the preview histogram in Phase 3.1** — already planned. Use it
   for QC guardrails (blown highlights, crushed shadows) and as a
   category-detection tiebreaker.
6. **Defer MakerNote entirely.** If a future need arises (white-balance
   re-rendering, Active D-Lighting compensation, shutter count), the
   cheap top-level MakerNote walk is half a day's work; the nested
   sub-IFDs are not. Reopen ADR-0004 at that point and decide whether to
   add the MakerNote walk or to reintroduce exiftool as a subprocess.

## References

The following primary sources were used. Each is the canonical source
for the claim attributed to it.

1. **ExifTool Nikon tag documentation** — Phil Harvey, `<https://exiftool.org/TagNames/Nikon.html>`. The most complete public reference for Nikon MakerNote tags, including sub-IFD layouts and per-body variants. Used for: every MakerNote tag number, type, and value enumeration in this document.
2. **Exiv2 makernote documentation** — Exiv2 project, `<https://exiv2.org/makernote.html#Nikon>`. Confirms that Nikon MakerNotes (post-E5400 / D2H / D70 / D100 / D200 / Z series) use a TIFF-style IFD with offsets relative to the MakerNote's own TIFF header at byte 18. Used for: the MakerNote layout claim.
3. **ExifTool source: `lib/Image/ExifTool/Nikon.pm`** — `<https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/Nikon.pm>`. 14,282 lines. The reference implementation for Nikon MakerNote parsing. Used for: the existence of `ShotInfoZ9` (per-body ShotInfo), the PictureControl / LensData / ColorBalance sub-IFD layouts, and the encryption hint on `ShutterCount` / `LensData`.
4. **ExifTool EXIF tag documentation** — `<https://exiftool.org/TagNames/EXIF.html>`. The canonical list of EXIF 2.3 / 3.0 standard tags. Used for: every standard ExifIFD tag number in this document, including `SceneCaptureType` (0xa306), `ExposureProgram` (0x8822), `LightSource` (0x9208), `SubjectArea` (0x9214), `LensInfo` (0xa432), `LensModel` (0xa434).
5. **CIPA DC-008-2026 (EXIF 3.1 specification)** — `<https://www.cipa.jp/std/documents/download_e.html?CIPA_DC-008-2026-E>`. The standard itself. ExifTool's EXIF page links to it; tag names with underlined HTML at exiftool.org are EXIF 3.0 / 3.1 tags.
6. **Adobe TIFF 6.0 specification** — `<https://www.adobe.io/open/archives/resources/tiffresources#TIFF6>` (TIFF revision 6.0, June 1992). The base format Nikon NEF and Canon CR2 / CR3 build on. Used for: the IFD entry structure (12 bytes: tag / type / count / value-or-offset) which our `_read_ifd` already implements.
7. **raw.pixls.us tag database** — `<https://raw.pixls.us/>`. The community-maintained raw sample library used by darktable / RawTherapee / rawspeed for regression testing. The Nikon Z 9 sample in the database has the same MakerNote structure as the operator's corpus.
8. **LibRaw source** — `<https://github.com/LibRaw/LibRaw>`. The reference open-source raw decoder. Its `internal/dcraw_common.cpp` and `internal/metadata.cpp` contain the Nikon MakerNote parsing path LibRaw uses. Not consulted in detail for this document because ExifTool's `Nikon.pm` is more complete; cross-check with LibRaw before implementing any MakerNote walk.
9. **ADR-0004** — `/Users/A200173944/PersonalCodes/fotography_ai/docs/adr/0004-read-exif-in-pure-python.md`. The project's existing decision: parse standard EXIF in pure Python, drop exiftool and rawpy. The scope guard in ADR-0004 says "the moment a required field turns out to live in MakerNote, the correct move is to reconsider exiftool — not to grow a reverse-engineering effort inside this project." This document respects that guard: the cheap top-level MakerNote walk is half a day's work; the nested sub-IFDs are the reverse-engineering effort the ADR rules out.
10. **Phase 3 plan** — `/Users/A200173944/PersonalCodes/fotography_ai/docs/architecture/nef-editor-cli/phase-3-preview-classifier.md`. Plans the 384 × 256 preview extraction and a 5-feature classifier. This document extends that plan by adding standard-EXIF signals the classifier should read first.
11. **Verification findings** — `/Users/A200173944/PersonalCodes/fotography_ai/docs/architecture/nef-editor-cli/verification.md`. The 209-file corpus facts: NIKON Z 9 firmware Ver.05.10, NIKKOR Z 24-200mm f/4-6.3 VR, aperture range f/4.0–f/6.3 (the f/8 portrait/product rule is dead), shutter range 1/800–1/8000 s (the night shutter test is vacuous).
12. **HE\* decoder research** — `/Users/A200173944/PersonalCodes/fotography_ai/docs/architecture/nef-editor-cli/he-decoder-research.md`. Documents that the raw sensor data is unreachable (HE\* not decodable by any open-source tool), so any "raw clipping" claim must come from the preview, not the raw.
