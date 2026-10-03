---
type: decision
title: macOS ImageIO decodes HE*; no Adobe dependency
status: accepted
date: 2026-10-02
---

# macOS ImageIO decodes HE\*; no Adobe dependency

## Context

The Z 9 records HE\* (`NEFCompression = 14`), which no open-source raw decoder can read. Verified
against LibRaw 0.22.1 and darktable-cli 4.2.1 / 5.0.1 / 5.6.1 — all refuse the files.

[ADR-0005](./0005-he-requires-a-host-side-converter.md) concluded that Adobe's DNG Converter was the
only viable decoder, requiring a proprietary host-side install. That was correct on the evidence it
had, and wrong on the evidence available.

A wider search found the answer on the machine we were already standing on.

## Decision

**Decode HE\* with macOS ImageIO. Do not depend on Adobe, intoPIX, Nikon's SDK, or any reverse-
engineered code.**

Stage one becomes a macOS-native decode. Stage two is unchanged: darktable-cli in Docker.

## Evidence

This machine runs macOS 26.6.2 (`25G83`). ImageIO contains an HE/HE\* decoder.

```sh
$ sips -s format jpeg DSC_5128.NEF --out out.jpg
DSC_5128.NEF → out.jpg
```

| Property | Measured | Meaning |
|---|---|---|
| Dimensions | 8256 × 5504 | Full 45.7 MP. The 8280 × 5520 readout is cropped 24 px — normal |
| Size | 10,458,110 bytes | Full render, not the 10,684-byte embedded preview |
| Depth | 8-bit RGB, Display P3 | A rendered JPEG, not raw data |
| EXIF | ISO 2000, f/4.0, 1/8000, 24 mm | Preserved |
| Percentiles | p1=1, p50=107, p95=193, p99=216 | Full tonal spread — a tone curve was applied |
| Highlights | 0.00 % above 253 | Nothing blown |
| Shadows | 5.71 % below 3 | Some crush; see Risks |

The percentile spread is what proves this is a developed image rather than raw-linear data, which
would sit dark and flat around a mean of 20–30. Measured mean luminance is 94.6.

## Alternatives rejected

| Option | Why not |
|---|---|
| **Adobe DNG Converter** (ADR-0005) | Works, but a proprietary install for something the OS already does. Adobe's licence, Adobe's version cadence, and `-c` intermediates nobody needs |
| **Nikon Image SDK** | Genuinely supports HE/HE\* — confirmed in Nikon's own `kNkfl_Cmd_OpenSession` reference, and by Affinity Photo 2.6. But licence §2.5 prohibits distributing software containing NEF-processing technology, §2.4 prohibits disassembly, and it is a black-box renderer rather than a codec. Unnecessary |
| **LibRaw's autumn snapshot** | Imminent and free, but not public. Cannot be a dependency today |
| **piratenpanda's Python HE/HE\* decoder** | Exists, numpy-only, writes DNG. Impressive — but we would be depending on an undocumented reverse-engineered decoder when the OS does the job |
| **Write our own decoder** | Weeks to months. The HE→HE\* delta is only ~65 lines, so it is *bounded* — but bounded is not free, and there is no reason to pay it now |
| **Camera → lossless compression** | Still the only fully future-proof option. It removes the HE\* dependency entirely and makes this ADR unnecessary. Remains the operator's call |

## Consequences

**Positive**

- **Zero proprietary dependencies.** No Adobe, no Nikon, no intoPIX, no licence gate, no EULA.
- No extra install step. `sips` ships with macOS.
- Stage one and stage two no longer need different provenance — both are freely available tools.
- The 1.8 GB download and the failed Wine work are both moot.

**Negative**

- **8-bit rendered output loses raw latitude.** No highlight recovery, no white-balance re-grading —
  those require raw data. Our presets are contrast, saturation, sharpening and noise reduction, all
  of which work on a well-decoded JPEG, so v1 is unaffected. If a preset ever needs latitude,
  Core Image's `CIRAWFilter` can emit 16-bit linear instead — see upgrade path.
- **macOS-only.** Acceptable: the operator works on macOS, and the render stage stays portable. A
  cross-platform tool would need the LibRaw route.
- **Undocumented capability.** Apple does not list HE/HE\* in its format-support documentation. If a
  future macOS removes it, stage one breaks silently.
- `sips` is a process spawn. For 209 files, one long-lived native tool would be faster.
- 5.7 % shadow clipping is undiagnosed — possibly macOS's tone curve, possibly the scene.

### Guard against silent breakage

Because the capability is undocumented, stage one must **probe for it at startup and fail loudly**.

```sh
sips -s format jpeg <first-nef> --out /dev/null
```

A non-zero exit means the decode stage is unavailable. The tool must stop with a clear message rather
than report every photograph as failed.

### Upgrade path

If a preset needs highlight or white-balance latitude, replace `sips` with a small native tool built on
`CIRAWFilter`, writing 16-bit linear TIFF or DNG. The public API is unchanged; only the stage-one
implementation moves.

## References

- [`he-decoder-research.md`](../architecture/nef-editor-cli/he-decoder-research.md) — full landscape
- [`verification.md`](../architecture/nef-editor-cli/verification.md)
- [Implementation plan](../architecture/nef-editor-cli/plan.md)
- [ADR-0005](./0005-he-requires-a-host-side-converter.md) — superseded
- [darktable #15873](https://github.com/darktable-org/darktable/issues/15873)
- Nikon Image SDK — <https://sdk.nikonimaging.com/apply/>