---
type: decision
title: HE* needs a host-side converter; the container renders only
status: superseded
date: 2026-10-02
superseded_by: [ADR-0006](./0006-macos-imageio-decodes-he-star.md)
---

# HE\* needs a host-side converter; the container renders only

> **SUPERSEDED on 2026-10-02**, the same day it was written.
>
> A wider search found that **macOS ImageIO decodes HE\* natively** — full 45.7 MP, no licence gate,
> no third-party software. The Adobe DNG Converter dependency this record introduced is unnecessary.
> See [ADR-0006](./0006-macos-imageio-decodes-he-star.md) and
> [`he-decoder-research.md`](../architecture/nef-editor-cli/he-decoder-research.md).
>
> The finding that **LibRaw cannot decode these files, and neither can darktable, and no open-source
> tool can** remains true and was correct here. What was wrong was the conclusion that only Adobe
> could fill the gap.
>
> Kept as the reasoning of record. Do not implement from it.

## Context

The operator photographs with a **NIKON Z 9, firmware Ver.05.10**, and the camera is set to
**High Efficiency\* (HE\*)** compression. All 209 files confirm it:

```sh
exiftool -q -s3 -NEFCompression -ext NEF <dir> -r | sort | uniq -c
# 209 High Efficiency*
```

HE\* is Nikon's proprietary compression and **has no open-source decoder**. Every open tool refuses
the files:

| Engine | Version | Result |
|---|---|---|
| LibRaw via rawpy 0.27.1 | 0.22.1 | `LibRawFileUnsupportedError` at `identify()` |
| darktable-cli, Debian bookworm | 4.2.1 | `rawspeed: Out of bounds access in ByteStream` |
| darktable-cli, Debian trixie | 5.0.1 | same |
| darktable-cli, Fedora 44 | **5.6.1** (current) | same |

The files are structurally valid — payload offsets end exactly at file size — which is why metadata
readers succeed while every pixel decoder fails.

The pipeline therefore needs **something** to decode HE\* before darktable can render. The only
credible candidate is Adobe, who licenses Nikon's decoder.

## Decision

**A two-stage pipeline, split across a platform boundary:**

| Stage | Runs on | Tool |
|---|---|---|
| HE\* → DNG | **Host** (macOS, native) | Adobe DNG Converter 18.7 |
| DNG → JPEG + XMP | **Docker** | darktable-cli 5.6.1, pinned |

The container holds the render stage only. It does not attempt to decode HE\*.

## Alternatives considered

### Containerise the converter under Wine — rejected after five attempts

Adobe publishes no Linux build, so the container route requires Wine. The Windows x64 installer was
downloaded (1.82 GB, `download.adobe.com/pub/adobe/dng/win/AdobeDNGConverter_x64_18_7.exe`) and Wine
10.0 was installed under `linux/amd64` on Apple Silicon:

| Attempt | Result |
|---|---|
| wine64 only | `syswow64\ntdll.dll` missing → added `wine32:i386` |
| With wine32, `Z:` path | `c0000018 STATUS_CONFLICTING_ADDRESSES` |
| Virtual `C:` path | same |
| Non-root user | same |
| Windows 7 compatibility mode | same |

The payload is `zlb`-compressed (InstallShield's proprietary container). 7-Zip extracts only PE
fragments, so the bootstrapper cannot be bypassed to reach the MSI underneath. Wine's 32-bit PE loader
never maps the binary — the installer never starts, so no silent-install flag can help.

Rejected. Reversible only by a different Wine build or real x86 hardware.

### Use Nikon NX Studio instead — rejected

NX Studio is the only tool here that decodes HE\* natively. It cannot be scripted:

| Claim | Evidence |
|---|---|
| Has a CLI | The installed 22 MB Mach-O binary contains **zero** `--flags`, no `usage:`, no headless or batch references |
| Can be scripted | **0** matches for AppleScript or a scripting dictionary — not automatable even that way |
| Runs on Linux | Nikon's download centre lists exactly two builds: Windows 11 and macOS. No Linux build |
| Redistributable | Nikon's download page states *"Reproduction: Not permitted"* |

Its documentation describes GUI operations only — "click [Export]", "click [Save as]". There is no CLI
mode to find. Automating a GUI would also forfeit the preset system entirely.

### Set the camera to lossless — recommended, and not a decision this project can make

One menu item. Files grow from ~33 MB to ~50–100 MB. Every tool reads them, and **this entire ADR
becomes unnecessary** — darktable-cli alone does everything, in the existing container, with no Adobe
dependency and no host install.

This is the better engineering outcome. It is recorded here as the preferred path and remains the
operator's choice, because it trades storage for a proprietary dependency.

## Consequences

**Positive**

- darktable stays pinned in a reproducible container, verified at 5.6.1.
- Only one stage crosses the boundary, and it is a documented command.

**Negative**

- The pipeline needs **both** a working Docker install and a host-side Adobe install. Two
  prerequisites, two failure modes, for one tool.
- DNG intermediates need disk: roughly 8 GB for a 209-file folder. Deleted after successful render.
- HE\* support depends on a proprietary tool Adobe can change or withdraw.
- The converter step is **unverified**. See below.

### The open risk, stated plainly

**`brew install --cask adobe-dng-converter` has never been run against a real Z 9 HE\* file.** The
cask exists (18.7), and Adobe documents a batch CLI (`-c -fl -mp -d <dir>`), but no HE\* file has
been converted in this project. Until that runs, the render stage is proven in isolation only —
darktable has never been fed a DNG produced from these photographs.

This is the single highest-priority verification remaining. Everything downstream is speculative
without it.

### Upgrade path

If the camera moves to lossless, delete stage one and this ADR. The container becomes the whole
pipeline.

If Adobe withdraws the converter, the same applies. Either way the fallback is the camera setting,
not a third tool.

## References

- [`verification.md`](../architecture/nef-editor-cli/verification.md)
- [Implementation plan](../architecture/nef-editor-cli/plan.md)
- [ADR-0003](./0003-presets-are-core-parameter-sets-not-darktable-styles.md)
- [darktable #20841](https://github.com/darktable-org/darktable/issues/20841) — "Nikon HE (high
  efficiency) compressed raws are not currently supported… make sure you're using lossless instead"
- [LibRaw #668](https://github.com/LibRaw/LibRaw/issues/668) — Z8/Z9 NEF decode failures
- [RawTherapee #6408](https://github.com/RawTherapee/RawTherapee/issues/6408) — Adobe DNG Converter
  used as the Z 9 HE\* workaround; "The compression is proprietary and needs licensing"
- Nikon NX Studio download centre — system requirements and reproduction terms