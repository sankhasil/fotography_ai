---
type: reference
title: NEF Editor — Verification Findings
status: verified
date: 2026-10-02
---

# Verification Findings

Everything here was measured against the operator's real photographs — 209 `.nef` files in
`~/Pictures/Nikon Transfer 2/FotoDump`, all from a **NIKON Z 9, firmware Ver.05.10**. No claim in this
document is inherited from the earlier draft.

This file is the evidence base for [`plan.md`](./plan.md). Where the plan and this file disagree, this
file wins.

## The blocking finding

**All 209 files are `MakerNotes:NEFCompression = 14` — `High Efficiency*` (HE\*).**

HE\* is Nikon's proprietary compression. There is no open-source decoder. Measured, not assumed:

| Engine | Version | Result |
|---|---|---|
| LibRaw via rawpy 0.27.1 (newest on PyPI) | 0.22.1 | `LibRawFileUnsupportedError` at `identify()` |
| darktable-cli, Debian bookworm | 4.2.1 | `rawspeed: Out of bounds access in ByteStream` |
| darktable-cli, Debian trixie | 5.0.1 | same |
| darktable-cli, Fedora 44 | **5.6.1** (current release) | same |

Files are **not** truncated — payload offsets end exactly at file size. They are structurally valid,
which is why `exiftool` and a hand-written TIFF parser read them happily while every pixel decoder
refuses.

**How to read HE\* status:** `exiftool -Compression` reports the misleading generic string
`Nikon NEF Compressed`. The authoritative tag is `-NEFCompression`:

```sh
exiftool -q -s3 -NEFCompression -ext NEF <dir> -r | sort | uniq -c
# 209 High Efficiency*
```

### Escaping it

| Route | Status |
|---|---|
| **Set the Z 9 to lossless compression** | ✅ Recommended. One menu item. Files grow ~50–100 MB; every tool reads them. |
| Adobe DNG Converter → DNG, then darktable | ⚠️ Works in principle. macOS build installs via `brew install --cask adobe-dng-converter` (18.7). **Not yet executed** — see Open Risks. |
| Adobe DNG Converter inside Docker via Wine | ❌ Failed after 5 attempts. See below. |
| Nikon NX Studio | ❌ No CLI, no Linux build. See below. |

## Wine attempt — failed

`AdobeDNGConverter_x64_18_7.exe` (1.82 GB) downloaded from
`download.adobe.com/pub/adobe/dng/win/`. Wine 10.0 under `linux/amd64` on Apple Silicon:

| Attempt | Result |
|---|---|
| wine64 only | `syswow64\ntdll.dll` missing → added `wine32:i386` |
| With wine32, `Z:` path | `c0000018 STATUS_CONFLICTING_ADDRESSES` |
| Virtual `C:` path | same |
| Non-root user | same |
| Windows 7 compatibility mode | same |

The payload is `zlb`-compressed (InstallShield's proprietary container); 7-Zip extracts only PE
fragments, so the bootstrapper cannot be bypassed. Wine's 32-bit PE loader never maps the binary.
Escaping this needs a different Wine build or real x86 hardware.

`ponytail:` the volumes holding the 1.8 GB installer were deleted after this failed. Re-downloading
costs ~4 minutes; do not repeat the Wine attempt without a specific reason to believe a version
change fixes it.

## NX Studio — ruled out

Three independent blockers, each verified:

| Claim | Evidence |
|---|---|
| Runs on Linux/Alpine | Nikon's download centre lists exactly two builds: `S-NXSTDO-011001WF-...exe` (Windows 11) and `S-NXSTDO-011001MF-...dmg` (macOS). No Linux build. |
| Has a CLI | The installed 22 MB Mach-O binary contains **zero** `--flags`, no `usage:`, no headless or batch references. |
| Can be scripted | **0** matches for AppleScript / scripting-dictionary support. Not automatable even via AppleScript. |
| Redistributable | Nikon's download page states *"Reproduction: Not permitted"*. |

Its official help documents GUI operations only — "click [Export]", "click [Save as]". There is no CLI
mode to find.

## What the EXIF layer actually provides

All four classification signals are in the **standard** EXIF IFD — readable with a ~40-line pure-Python
TIFF parser. **No exiftool. No LibRaw.**

| Signal | Tag | Coverage |
|---|---|---|
| ISO | 34855 `ISOSpeedSpeedRatings` | 209 / 209 |
| Shutter | 33434 `ExposureTime` | 209 / 209 |
| Aperture | 33437 `FNumber` | 209 / 209 |
| Focal length | 37386 `FocalLength` | 209 / 209 |

Only `MakerNote` (213 KB proprietary blob) holds Picture Control — and it is the one thing we do not
need.

## Measured distributions (209 files)

| Field | Observed |
|---|---|
| Body / firmware | NIKON Z 9, Ver.05.10, 209/209 |
| Lens | NIKKOR Z 24-200mm f/4-6.3 VR |
| ISO | 160 – 25600, 32 distinct values |
| Aperture | **f/4.0 – f/6.3 only** — the lens never reaches f/8 |
| Focal length | 24 – 200 mm, 61 distinct values |
| Shutter | 1/800 – 1/8000 s — every frame is faster than 1/30 s |
| File size | 29.6 – 35.4 MB, median 32.7 MB, 206/209 in one 5 MB band |

### Rule hit counts against this corpus

| Rule | Intended | Actual |
|---|---|---|
| 1. night: ISO ≥ 3200 **and** shutter ≥ 1/30 | scene detection | **56** — but the shutter test is *vacuous*: every shutter is faster than 1/800 s. This rule is really "ISO alone". |
| 2. macro: focal ≤ 60 mm **and** f/4–f/8 | close-up detection | **43** — on a 24-200 mm, focal ≤ 60 mm means *wide*, not *close-up*. Likely false positives. |
| 3. landscape: focal ≥ 24 mm **and** f/8–f/11 | wide scene | **0** — the lens stops at f/6.3. **The rule is dead.** |
| 4. portrait: face detection | — | **unusable**, see below |

## Face detection — infeasible from NEF

Embedded previews inside the NEF:

| Source | Size |
|---|---|
| IFD0 tag 0x0201 JPEG | 160 × 120, 10,684 bytes |
| SubIFD3 uncompressed RGB | **384 × 256** |

384 × 256 is the best available. Faces in that frame are a few tens of pixels — below reliable YuNet
thresholds. Rendering a usable preview would cost a second darktable invocation per file.

**Dropped from v1.** Portrait becomes the fallback classification, overridable with `--category`.

## darktable-cli wrapper contract — verified in Docker

Tested with darktable-cli **5.6.1** in `nef-editor-darktable:1`, rendering a JPEG extracted from a
NEF preview. Every line below is measured.

```
darktable-cli <INPUT_FILE_OR_DIR> <OUTPUT_DIR> [OPTIONS]
```

| Fact | Consequence |
|---|---|
| Input and output are **positional**. `-i` and `-o` **do not exist**. | Passing `-i`/`-o` produces `warning: unknown option` and darktable silently falls back to positional parsing. My first NEF tests appeared to work for this reason alone. |
| No `--config` flag. | Use `XDG_CONFIG_HOME`; darktable reads `$XDG_CONFIG_HOME/darktable/`. |
| `--style <name>` requires the style **imported into the library database**. | Dropping `.dtstyle` files into `styles/` does **not** work — darktable reports `cannot find the style`. Seeding `librsqlite` headlessly is fragile. |
| `--core "<module>:<params>"` applies adjustments with **no library**. | ✅ Verified: output SHA256 changes between plain and `--core "darktable.exposure:exposure=0.5"`. |
| Output dir implies `$(FILE_NAME).jpg`. | The wrapper controls output paths via directories, not filename patterns. |
| Container has outbound internet. | ✅ Verified `HTTP 200` from `pypi.org`. Downloads inside the container work with no extra config. |

**Therefore presets are `--core` parameter sets, not darktable style files.** See
[ADR-0003](../../adr/0003-presets-are-core-parameter-sets-not-darktable-styles.md).

## Deployment artifact

`nef-editor/docker/` — built and verified.

| Check | Result |
|---|---|
| `docker compose build` | ✅ `nef-editor-darktable:1` |
| darktable-cli | ✅ 5.6.1 |
| NEFs visible in container | ✅ 196 top-level, 209 recursive |
| Source mount read-only | ✅ verified by write probe |

## Open risks

| Risk | Status |
|---|---|
| **Adobe DNG Converter conversion never executed.** `brew install --cask adobe-dng-converter` exists (18.7) and the Windows CLI URL is confirmed, but the conversion has not been run on a real Z 9 HE\* file. | **Unverified.** This is the only unknown standing between the current code and a working render. |
| Night/macro rules are fitted to one body and one lens | Accepted for v1; thresholds stay configurable |
| No run history in SQLite | Deliberate; see `database.md` |