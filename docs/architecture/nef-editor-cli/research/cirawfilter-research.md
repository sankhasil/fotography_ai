---
type: reference
title: CIRAWFilter Research — 16-bit HE* Decode on macOS
status: unverified
date: 2026-10-04
---

# CIRAWFilter Research — 16-bit HE* Decode on macOS

## Headline finding

**Yes — CIRAWFilter is the right API for 16-bit linear TIFF output from NEF files.** It is a
first-class Core Image `CIFilter` subclass (macOS 12+) that decodes raw camera sensor data,
exposes the raw adjustments we need (white balance, exposure, highlight recovery, shadow lift,
noise reduction, lens correction), and renders to 16-bit linear TIFF via `CIContext`.

**HE\* support is assumed, not confirmed.** Apple's `CIRAWFilter` documentation does not name
HE\* or Nikon Z 9 explicitly, but `CIRAWFilter` is built on Core Image's raw decoder, which on
modern macOS delegates to the same OS-level raw pipeline that `ImageIO` (and therefore `sips`)
uses. Since `he-decoder-research.md` established that `sips` decodes HE\* on this Z 9, the
expectation is that `CIRAWFilter` will too — but this needs empirical confirmation with a real
test file before committing to the design.

The recommended invocation is **Python via pyobjc** — `pyobjc-framework-Quartz` wraps the entire
`CoreImage` framework ("The entire framework is usable from python." — PyObjC CoreImage API
notes), so we get `CIRAWFilter`, `CIContext`, `CIFormat`, and `CGColorSpace` without writing a
Swift binary.

---

## 1. What is CIRAWFilter?

`CIRAWFilter` is an Objective-C class in the **Core Image** framework (`CoreImage.framework`),
available **macOS 12.0+**, iOS 15.0+, visionOS 1.0+. It is a subclass of `CIFilter`.

> "A filter subclass that produces an image by manipulating RAW image sensor data from a
> digital camera or scanner."
>
> — Apple, `developer.apple.com/documentation/coreimage/cirawfilter`

It is the public, scriptable face of macOS's raw-pipeline. You hand it a raw file (URL, Data,
or `CVPixelBuffer`+properties) and it produces a `CIImage` that you can chain other `CIFilter`s
into and then render to a file via `CIContext`.

| Fact | Source |
|---|---|
| Class symbol | `c:objc(cs)CIRAWFilter` — Apple doc metadata |
| Framework | Core Image (`/documentation/CoreImage`) |
| Inherits from | `CIFilter` |
| Availability | macOS 12.0+, iOS 15.0+, visionOS 1.0+ |
| Conforms to | `NSSecureCoding`, `NSCopying`, `CustomStringConvertible` |

Sources: [CIRAWFilter reference](https://developer.apple.com/documentation/coreimage/cirawfilter),
[Core Image framework](https://developer.apple.com/documentation/coreimage).

---

## 2. How is it invoked?

### Initializers (three ways in)

```swift
convenience init?(imageURL: URL)
convenience init?(imageData: Data, identifierHint: String?)
convenience init?(cvPixelBuffer: CVPixelBuffer, properties: [AnyHashable : Any])
```

The minimal invocation is one line: `CIRAWFilter(imageURL: url)`.

### From Python via pyobjc — supported

`pyobjc-framework-Quartz` (PyPI) wraps `CoreImage`, `ImageIO`, `CoreGraphics`, `QuartzCore`,
`PDFKit`, `ImageKit`, and `CoreVideo` together. The PyObjC API Notes for CoreImage state
verbatim: *"The entire framework is usable from python."*

Import pattern:

```python
import Quartz  # exposes CoreImage, ImageIO, CoreGraphics
from Quartz import CIRAWFilter, CIContext, CIFormat
```

There are no known gaps in PyObjC's CoreImage coverage that would block `CIRAWFilter`. The class
is Objective-C (`c:objc(cs)CIRAWFilter`), not Swift-only — confirmed against the PyObjC
framework-wrappers table where `CoreImage` is wrapped by `pyobjc-framework-Quartz` and has full
API notes.

### From a Swift CLI tool — supported

A `swift` script using `import CoreImage` works directly. No GUI / AppKit required. A
`@main`-style CLI in a `Package.swift` is the fallback if pyobjc shows unexpected friction.

Sources:
- [PyObjC CoreImage API notes](https://pyobjc.readthedocs.io/en/latest/apinotes/CoreImage.html)
- [PyObjC framework-wrappers table](https://pyobjc.readthedocs.io/en/latest/notes/framework-wrappers.html)

---

## 3. What does it output?

`CIRAWFilter` does **not** write a file. It produces a **`CIImage`** — a lazy "recipe" of image
operations. To get bytes on disk you must render through `CIContext`:

```swift
func writeTIFFRepresentation(
    of: CIImage,
    to: URL,
    format: CIFormat,
    colorSpace: CGColorSpace,
    options: [CIImageRepresentationOption : Any]
) throws
```

### Pixel formats that matter for 16-bit linear output

From `CIFormat`:

| Constant | Bit depth | Type | Use |
|---|---|---|---|
| `RGBA16` | 16-bit fixed, 64 bpp | RGBA | 16-bit TIFF, integer samples |
| `RGBAh` | 16-bit half-float, 64 bpp | RGBA | 16-bit linear TIFF, HDR-friendly |
| `RGBAf` | 32-bit float, 128 bpp | RGBA | 32-bit linear, max latitude |
| `RGBA8` | 8-bit fixed, 32 bpp | RGBA | What `sips` produces today |

For our goal (preserve raw latitude, 16-bit linear), **`RGBA16` or `RGBAh`** is the right
output. `RGBAh` is preferred for downstream re-grading because half-float preserves
highlight detail past clip; `RGBA16` (16-bit integer) is compatible with more TIFF readers.

The `colorSpace` argument controls the TIFF's embedded ICC profile. For raw latitude we want a
wide-gamut linear working space — `CGColorSpace(name: CGColorSpace.linearSRGB)` or
`CGColorSpace(name: CGColorSpace.extendedSRGB)`, not Display P3 with a tone curve.

Sources: [CIContext](https://developer.apple.com/documentation/coreimage/cicontext),
[CIFormat](https://developer.apple.com/documentation/coreimage/ciformat).

---

## 4. Does it handle HE\* (High Efficiency\*) NEF files?

**Status: assumed yes, not yet verified.**

What the sources say:

- Apple's `CIRAWFilter` documentation does not list supported cameras or formats inline. It
  exposes `supportedCameraModels` and `supportedDecoderVersions` as **runtime queries** —
  meaning support is determined by the OS at call time, not by a static list in the docs.
- `sips` uses `ImageIO` (`CGImageSource`). `CIRAWFilter` uses Core Image's raw decoder.
- On modern macOS, Core Image's raw decoder and ImageIO's raw decoder both rely on the
  OS-level raw pipeline (the `RawDecode` family of system frameworks that ship in macOS). They
  are not two independent codecs; they are two API surfaces over a shared system decoder.
- `he-decoder-research.md` (this repo) established empirically that `sips` decodes the Z 9's
  HE\* files at full 45.7 MP on macOS 26.6.2. If `CIRAWFilter` shares that decoder, it inherits
  the support — but Apple does not document this relationship.

What we could **not** find:

- No Apple developer forum thread returned by the search explicitly pairs `CIRAWFilter` with
  Nikon Z 9 or HE\* (the Apple forums search endpoint returned a security challenge; GitHub
  code search required sign-in).
- No `pixls.us` thread on `CIRAWFilter` surfaced via the public Discourse search.
- No public Swift/Python sample code on GitHub was reachable through the unauthenticated
  search endpoints we tried.

**Required empirical test** (one command, see §5):

```bash
python3 -c 'import Quartz; \
  f = Quartz.CIRAWFilter.alloc().initWithImageURL_(
      Quartz.NSURL.fileURLWithPath_("DSC_5128.NEF")); \
  print(f, f.nativeSize() if f else "nil")'
```

If that returns a `CIRAWFilter` instance and a ~8256×5504 `nativeSize`, HE\* is supported and
the rest of the design is unblocked. If it returns `nil`, we fall back to `sips`-decoded 8-bit
input or a Swift CLI using `CGImageSource` + `CIImage(cgImageSource:options:)`.

Sources: [CIRAWFilter](https://developer.apple.com/documentation/coreimage/cirawfilter),
[`he-decoder-research.md`](../he-decoder-research.md).

---

## 5. What raw adjustments does it expose?

Full list from Apple's `CIRAWFilter` reference, grouped by what we need for the editor:

| Adjustment | Property | Supported-flag | Notes |
|---|---|---|---|
| **White balance (temperature)** | `neutralTemperature: Float` | — | Kelvin-style |
| **White balance (tint)** | `neutralTint: Float` | — | Green/magenta axis |
| **White balance (chromaticity)** | `neutralChromaticity: CGPoint` | — | x,y chromaticity |
| **White balance (spot)** | `neutralLocation: CGPoint` | — | Pick neutral from pixel coords |
| **Exposure** | `exposure: Float` | — | Stops |
| **Baseline exposure** | `baselineExposure: Float` | — | Camera default offset |
| **Extended dynamic range** | `extendedDynamicRangeAmount: Float` | — | EDR headroom control |
| **Highlight recovery** | `isHighlightRecoveryEnabled: Bool` | `isHighlightRecoverySupported` | **Critical** for raw latitude |
| **Shadow lift** | `boostShadowAmount: Float` | — | Shadow boost |
| **Shadow bias** | `shadowBias: Float` | — | Shadow foot adjustment |
| **Global tone curve** | `boostAmount: Float` | — | Amount of baseline tone curve |
| **Local tone map** | `localToneMapAmount: Float` | `isLocalToneMapSupported` | Adaptive tone curve |
| **Black level / contrast** | `contrastAmount: Float` | `isContrastSupported` | Local contrast on edges |
| **Detail enhancement** | `detailAmount: Float` | `isDetailSupported` | |
| **Sharpness** | `sharpnessAmount: Float` | `isSharpnessSupported` | |
| **Luminance NR** | `luminanceNoiseReductionAmount: Float` | `isLuminanceNoiseReductionSupported` | |
| **Color NR** | `colorNoiseReductionAmount: Float` | `isColorNoiseReductionSupported` | |
| **Moire reduction** | `moireReductionAmount: Float` | `isMoireReductionSupported` | |
| **Despeckle** | `despeckleAmount: Float` | `isDespeckleSupported` | |
| **Lens correction** | `isLensCorrectionEnabled: Bool` | `isLensCorrectionSupported` | Uses embedded profile |
| **Gamut mapping** | `isGamutMappingEnabled: Bool` | — | |
| **Linear-space pre-filter** | `linearSpaceFilter: CIFilter?` | — | Custom filter in linear space |
| **Scale factor** | `scaleFactor: Float` | — | Render at <1× for speed |
| **Draft mode** | `isDraftModeEnabled: Bool` | — | Fast preview |
| **Orientation** | `orientation: CGImagePropertyOrientation` | — | |
| **Decoder version** | `decoderVersion: CIRAWDecoderVersion` | `supportedDecoderVersions` | Pin a decoder |

This is a superset of what `sips` exposes (which is: none of them — `sips` only does format
conversion and the OS default development). Every parameter that `he-decoder-research.md`
identified as "lost" by `sips` (`Highlight recovery`, `White-balance re-grading`, `Black level`)
is directly exposed here.

There is also a `downloadResources(timeout:completionHandler:)` instance method and a
`downloadAllResources(timeout:completionHandler:)` class method. **Some cameras require Apple
to download a decoder bundle on first use** (e.g. via the `RAWDecoder` system extension). This
is a real risk for an offline CLI — see §7.

Sources: [CIRAWFilter reference](https://developer.apple.com/documentation/coreimage/cirawfilter)
— every property above is taken directly from that page.

---

## 6. How does it compare to `sips`?

| Aspect | `sips` (ImageIO) | `CIRAWFilter` (Core Image) |
|---|---|---|
| Underlying API | `CGImageSource` + `CGImageDestination` | `CIRAWFilter` + `CIContext` |
| Output depth | 8-bit (JPEG/TIFF/PNG/HEIF) | Up to 32-bit float (`RGBAf`) |
| Tone curve | Apple default, applied | Default available via `boostAmount`; can be defeated |
| White balance | Fixed (as shot) | Re-gradeable (`neutralTemperature`/`neutralTint`/`neutralChromaticity`) |
| Highlight recovery | None | `isHighlightRecoveryEnabled` (when supported) |
| Shadow lift | None | `boostShadowAmount` + `shadowBias` |
| Noise reduction | None | `luminanceNoiseReductionAmount`, `colorNoiseReductionAmount` |
| Lens correction | None | `isLensCorrectionEnabled` |
| Output formats | JPEG, TIFF, PNG, HEIF, HEIF10 | JPEG, TIFF, PNG, HEIF, HEIF10, OpenEXR |
| Bit-depth control | None (always 8-bit for JPEG/TIFF via `sips`) | `format: CIFormat` per write |
| Color space control | Limited (`-s setProperty profileColorSpace`) | `colorSpace: CGColorSpace` per write |
| Performance | CPU, ~1–2 s/45 MP NEF | Metal GPU or CPU, comparable or faster |
| Scriptable from CLI | Yes (shell) | Yes (pyobjc or Swift) |

**Bottom line:** `sips` is the convenience tool. `CIRAWFilter` is the engine. They almost
certainly share the same OS raw decoder (only Apple knows for sure), but `CIRAWFilter` gives
us the parameters and the bit depth that `sips` withholds.

Sources: [`sips --help`], [CIContext](https://developer.apple.com/documentation/coreimage/cicontext),
[CIFormat](https://developer.apple.com/documentation/coreimage/ciformat).

---

## 7. Can it be scripted from a CLI?

Yes, three viable paths. Ranked by cost/benefit for this project:

### Option A — Python via pyobjc (recommended)

```python
import Quartz
from Foundation import NSURL
from CoreGraphics import CGColorSpaceCreateWithName, kCGColorSpaceLinearSRGB

src = NSURL.fileURLWithPath_("input.NEF")
dst = NSURL.fileURLWithPath_("output.tif")

f = Quartz.CIRAWFilter.alloc().initWithImageURL_(src)
if f is None:
    raise SystemExit("CIRAWFilter cannot decode this NEF")

f.setNeutralTemperature_(5500.0)        # white balance, Kelvin
f.setExposure_(0.0)                      # stops
f.setHighlightRecoveryEnabled_(True)     # raw latitude

img = f.outputImage()

ctx = Quartz.CIContext.context()
cs = CGColorSpaceCreateWithName(kCGColorSpaceLinearSRGB)

ctx.writeTIFFRepresentation_of_to_format_colorSpace_options_(
    img, dst, Quartz.CIFormat.RGBAh, cs, None)
```

- **Pro:** No compile step. Lives in the same Python environment as `rawpy`, `Pillow`,
  `numpy`. Easiest for iterating on parameters and presets.
- **Pro:** PyObjC explicitly states the entire `CoreImage` framework is usable from Python.
- **Con:** Requires `pip install pyobjc-framework-Quartz` (~30 MB wheel) and a macOS-only
  deployment target (we already have that constraint — `sips` requires it too).

### Option B — Swift CLI tool

A `swift` package with `import CoreImage`, built once and called from Python via `subprocess`.
- **Pro:** First-class Xcode toolchain, no bridge friction, smallest binary.
- **Pro:** Can use `swift script` mode (single `.swift` file) for one-shot tools.
- **Con:** Adds a build step. Mixed Python/Swift stack is harder to package.

### Option C — `sips` with different flags

`-s format tiff` exists but `sips` does not expose 16-bit output or raw adjustments. Dead end
for the raw-latitude goal. `sips` is the floor, not the upgrade path.

### Option D — Other

`dcraw`, `darktable-cli`, `rawpy` are all blocked by `he-decoder-research.md` for HE\*. Not
viable for this camera.

**Recommendation: Option A (pyobjc).** It keeps everything in Python, the PyObjC coverage is
confirmed complete for CoreImage, and the iteration loop is fast. Migrate to Option B only if
we hit a bridge-specific perf or memory issue.

Sources:
- [PyObjC CoreImage API notes](https://pyobjc.readthedocs.io/en/latest/apinotes/CoreImage.html)
- [PyObjC framework-wrappers table](https://pyobjc.readthedocs.io/en/latest/notes/framework-wrappers.html)

---

## 8. Performance

No public Apple benchmark for `CIRAWFilter` per-file decode time. Reasoning:

- `CIContext` is GPU-accelerated via Metal by default (`init(mtlDevice:)`) and falls back to
  CPU (`contextWithOptions:` with no GPU).
- `sips` is CPU-only and does 1–2 s per 45 MP HE\* file (per `he-decoder-research.md`).
- `CIRAWFilter` is what Apple's own Photos app and Preview use for raw development. They are
  near-instant on a 45 MP file on Apple Silicon.
- A single `CIRAWFilter` + `writeTIFFRepresentation` call should land at **0.3–1.5 s/file**
  on Apple Silicon, **1–3 s/file** on Intel, depending on whether a Metal GPU context is used.

The two important knobs:
- `isDraftModeEnabled = true` skips the high-quality kernel — useful for thumbnails, not for
  final 16-bit output.
- `scaleFactor < 1.0` renders below native resolution — same caveat.

For batch throughput, **reuse one `CIContext`** for all files. The CIContext caches compiled
kernels; creating one per file is expensive (Apple: *"it is not recommended to create many
`CIContext` instances"*).

Sources: [CIContext overview](https://developer.apple.com/documentation/coreimage/cicontext),
[he-decoder-research.md](../he-decoder-research.md).

---

## How to invoke — minimal path

```bash
# 1. Install
pip install pyobjc-framework-Quartz

# 2. Smoke test — does CIRAWFilter open this NEF at all?
python3 -c 'import Quartz; \
  f = Quartz.CIRAWFilter.alloc().initWithImageURL_( \
      Quartz.NSURL.fileURLWithPath_("DSC_5128.NEF")); \
  print("OK", f.nativeSize()) if f else print("FAIL")'

# 3. Decode to 16-bit linear TIFF
python3 -c ' \
import Quartz; from Foundation import NSURL; from CoreGraphics import ( \
    CGColorSpaceCreateWithName, kCGColorSpaceLinearSRGB); \
src = NSURL.fileURLWithPath_("DSC_5128.NEF"); \
dst = NSURL.fileURLWithPath_("out.tif"); \
f = Quartz.CIRAWFilter.alloc().initWithImageURL_(src); \
f.setHighlightRecoveryEnabled_(True); \
img = f.outputImage(); \
ctx = Quartz.CIContext.context(); \
ctx.writeTIFFRepresentation_of_to_format_colorSpace_options_( \
    img, dst, Quartz.CIFormat.RGBAh, \
    CGColorSpaceCreateWithName(kCGColorSpaceLinearSRGB), None)'
```

**Sanity check:** the produced TIFF should be ~200–400 MB for an 8256×5504 16-bit linear
image (`8256 × 5504 × 8 bytes ≈ 363 MB`), and `mean ≈ 0.1–0.3` per channel if it is genuinely
linear (vs. ≈0.37 if a tone curve was applied, which is what `sips` produces today).

---

## Risks and unknowns

1. **HE\* support is assumed, not confirmed.** Apple does not document the `CIRAWFilter` ↔
   HE\* relationship. The shared-decoder assumption is strong but not proven. Mitigation:
   run the §"How to invoke" smoke test before any code is written against this design.

2. **Resource download may be required for some cameras.** `CIRAWFilter` exposes
   `downloadResources(timeout:completionHandler:)` and `downloadAllResources(...)`. Some
   camera models require Apple to fetch a decoder bundle from Apple's servers on first use.
   An offline CLI must either (a) warm up the cache once while online, or (b) fail with a
   useful error. Nikon Z 9 HE\* may or may not be in this set — must be tested on the target
   machine.

3. **`CIRAWFilter` may bake in a tone curve that we cannot fully defeat.** `boostAmount`
   controls "the amount of global tone curve to apply" — a value of 0 should disable it, but
   Apple does not document the exact behaviour. If the linear output still has a curve, the
   smoke test in §"How to invoke" will reveal it (mean luminance will be ≈0.37 instead of
   ≈0.1–0.3).

   Secondary risk: the default `CIContext` working color space may be Display P3 with a
   perceptual gamma, not linear. Mitigation: explicitly pass `linearSRGB` or `extendedSRGB`
   to `writeTIFFRepresentation`, and create the context with
   `CIContextOption.workingColorSpace` set to a linear space.

4. **PyObjC bridge overhead.** Allocating one `CIRAWFilter` per file in a Python loop is
   fine. Pulling the rendered 16-bit buffer back into a `numpy` array via
   `createCGImage(_:from:format:colorSpace:)` + `CGImage` → bitmap copy is slow for large
   images and doubles memory. Mitigation: write straight to TIFF via
   `writeTIFFRepresentation` and let downstream read the TIFF.

5. **No public community validation found.** We could not reach Apple developer forum
   search, `pixls.us` thread search, or GitHub code search through unauthenticated
   endpoints in this research pass. The design is grounded in Apple's primary documentation
   and PyObjC's coverage notes, but it is not corroborated by community reports of
   `CIRAWFilter` + Nikon Z 9 + HE\*. A second pass with authenticated search is recommended
   before locking the architecture.

6. **macOS-version coupling.** `CIRAWFilter` is macOS 12+. HE\* decode is verified on
   macOS 26.6.2 only (per `he-decoder-research.md`). The pipeline's minimum macOS will be
   whichever of (a) macOS 12 for `CIRAWFilter` itself, (b) the macOS version that first
   shipped the HE\* decoder, is later. We do not currently know (b) — needs verification
   on a 12/13/14 test image.

---

## References

- CIRAWFilter — https://developer.apple.com/documentation/coreimage/cirawfilter
- CIRAWFilter (markdown) — https://developer.apple.com/documentation/coreimage/cirawfilter.md
- Core Image framework — https://developer.apple.com/documentation/coreimage
- CIImage — https://developer.apple.com/documentation/coreimage/ciimage
- CIContext — https://developer.apple.com/documentation/coreimage/cicontext
- CIFormat — https://developer.apple.com/documentation/coreimage/ciformat
- Core Image Programming Guide (archive) —
  https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/CoreImaging/ci_intro/ci_intro.html
- PyObjC CoreImage API notes — https://pyobjc.readthedocs.io/en/latest/apinotes/CoreImage.html
- PyObjC framework-wrappers table — https://pyobjc.readthedocs.io/en/latest/notes/framework-wrappers.html
- PyObjC project home — https://pyobjc.readthedocs.io/en/latest/
- Existing repo research on HE\* decode — `docs/architecture/nef-editor-cli/he-decoder-research.md`

---

## Verification checklist (do before treating this as `status: verified`)

- [ ] Run the §"How to invoke" smoke test against a real Z 9 HE\* NEF.
- [ ] Confirm `CIRAWFilter.initWithImageURL_` returns non-nil for HE\*.
- [ ] Confirm `nativeSize` matches `sips` output (8256 × 5504).
- [ ] Confirm the rendered TIFF is 16-bit (`RGBAh` or `RGBA16`) by inspecting with
      `sips -g pixelSize -g format` and `tiffinfo`.
- [ ] Confirm the rendered TIFF is linear (mean per channel ≈ 0.1–0.3, not ≈0.37).
- [ ] Confirm `setHighlightRecoveryEnabled_(True)` does not raise and changes output.
- [ ] Confirm `setNeutralTemperature_(5500.0)` does not raise and shifts white balance.
- [ ] Time 10 decodes, single reused `CIContext`, Apple Silicon.
- [ ] Repeat on Intel if Intel is a supported target.
- [ ] Run with no network to test the `downloadResources` failure path.
