---
type: decision
title: Read EXIF in pure Python; no exiftool, no LibRaw
status: accepted
date: 2026-10-02
---

# Read EXIF in pure Python; no exiftool, no LibRaw

## Context

The tool needs four values per photograph to classify it: ISO, shutter speed, aperture, focal length.
It also needs to write two fields back into each exported JPEG.

Revision 1 assigned that work to two external tools:

- **exiftool** — for reading Nikon Picture Control, and metadata generally
- **rawpy / LibRaw** — claimed to supply ISO, shutter, aperture and focal for free

Both claims were tested against the operator's 209 real `.nef` files. Neither held.

## Decision

**Parse the TIFF/EXIF container directly in pure Python. Depend on no external binary for metadata.**

The four classification signals all live in the **standard** EXIF IFD, not in Nikon's proprietary
`MakerNote`:

| Signal | Tag | Coverage across 209 files |
|---|---|---|
| ISO | 34855 `ISOSpeedSpeedRatings` | 209 / 209 |
| Shutter | 33434 `ExposureTime` | 209 / 209 |
| Aperture | 33437 `FNumber` | 209 / 209 |
| Focal length | 37386 `FocalLength` | 209 / 209 |

A working reader is roughly forty lines of `struct` unpacking. Writing `ImageDescription` and
`UserComment` into the exported JPEG uses `piexif` — pure Python, about 50 KB.

## Evidence

**LibRaw cannot read these files at all.** Every version available:

```
rawpy 0.27.1 (newest on PyPI) → LibRaw 0.22.1
LibRawFileUnsupportedError: Unsupported file format or not RAW file
```

The failure is at `identify()`, not at decode — `raw_type` fails and all `sizes` fields return zero.
LibRaw 0.22.2 is the newest release and is a patch over the bundled 0.22.1, so there is no newer
version to test. Revision 1's premise that "LibRaw often decodes what darktable cannot" was simply
false for this camera.

**exiftool was never needed.** It was justified solely by Picture Control detection, which we dropped.
For the four signals we use, it was always redundant.

**Pillow cannot open NEF either** (`UnidentifiedImageError`), so it is not an alternative reader —
though it is not needed either, since the exporter is `piexif`, not Pillow.

### A trap worth recording

`exiftool -Compression` reports these files as `Nikon NEF Compressed`, which reads as ordinary
lossless-compressed NEF and sent this investigation down the wrong path for a while.

The authoritative tag is different:

```sh
exiftool -q -s3 -NEFCompression -ext NEF <dir> -r | sort | uniq -c
# 209 High Efficiency*
```

**Always check `-NEFCompression`, not `-Compression`, before concluding a NEF is decodable.**

## Consequences

**Positive**

- Two fewer dependencies, one of which was an external binary the plan had to reason about installing.
- Metadata reads cannot fail for want of a subprocess. Pure Python, no PATH, no version skew.
- Classification stays a pure function, so its tests need no binaries and no fixtures.
- Works identically on the host and in the container.

**Negative**

- We own a TIFF parser. Nikon's `MakerNote` is **not** parsed — it is proprietary, and Picture
  Control is therefore unavailable. Accepted deliberately.
- The parser is a real maintenance surface if the tool ever needs formats beyond plain EXIF.

### Scope guard

`ponytail:` this decision covers the standard EXIF IFD only. The moment a required field turns out to
live in `MakerNote`, the correct move is to reconsider exiftool as a reader — not to grow a
reverse-engineering effort inside this project. Picture Control was the only such candidate and it was
not worth a subprocess per photograph.

## References

- [`verification.md`](../architecture/nef-editor-cli/verification.md)
- [Implementation plan](../architecture/nef-editor-cli/plan.md)
- exiftool 13.55; rawpy 0.27.1 (LibRaw 0.22.1); Pillow 10.4
- [ADR-0002](./0002-nef-editor-cli-gets-its-own-venv.md)
- [ADR-0001](./0001-darktable-cli-as-render-engine.md) — superseded