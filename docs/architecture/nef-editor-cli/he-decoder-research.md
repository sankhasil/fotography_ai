---
type: reference
title: Nikon HE* Decoder — Landscape and Findings
status: verified
date: 2026-10-02
---

# Nikon HE\* Decoder — Landscape and Findings

The Z 9's HE\* files are undecodable by every open-source raw tool. This records the landscape as of
**2026-10-02**, and the discovery that removes the blocker.

**Headline: macOS ImageIO decodes HE\* natively.** Verified below. No Adobe dependency, no Wine, no
reverse engineering.

## The blocking finding, restated

All 209 files are `MakerNotes:NEFCompression = 14` = `High Efficiency*`. HE\* is Nikon's
implementation of **intoPIX TicoRAW**, a JPEG-XS-derived codec. Nikon bought the patent; intoPIX sells
an SDK. No open-source tool can read it:

| Engine | Version | Result |
|---|---|---|
| LibRaw (rawpy 0.27.1 bundles 0.22.1) | 0.22.1 | `LibRawFileUnsupportedError` at `identify()` |
| darktable-cli | 4.2.1 / 5.0.1 / 5.6.1 | `rawspeed: Out of bounds access in ByteStream` |

## Discovery: macOS decodes HE\* natively — VERIFIED

The Z 9 runs macOS 26.6.2 (`25G83`). Its ImageIO contains an HE/HE\* decoder that Apple does not
document in its format-support list.

```sh
$ sips -s format jpeg DSC_5128.NEF --out out.jpg
DSC_5128.NEF → out.jpg
$ ls -l out.jpg
-rw-r--r--  10458110  out.jpg
```

Measured properties of the result:

| Property | Value | Interpretation |
|---|---|---|
| Dimensions | **8256 × 5504** | Full 45.7 MP decode. The 8280 × 5520 sensor readout is cropped by ~24 px — normal |
| File size | 10,458,110 bytes | Full-resolution render, not the 10,684-byte embedded preview |
| Depth / colour | 8-bit RGB, Display P3 | A rendered JPEG, not raw data |
| EXIF | ISO 2000, f/4.0, 1/8000, 24 mm preserved | Metadata survives the conversion |
| Mean luminance | 94.6 / 255 | Consistent with a developed image |
| Percentiles | p1=1, p50=107, p95=193, p99=216 | Full tonal spread — **a tone curve was applied** |
| Highlight clipping | **0.00 %** above 253 | Nothing blown |
| Shadow clipping | 5.71 % below 3 | Some shadow crush; see Risks |

The percentile spread is the key evidence. Raw-linear data would sit dark and flat (mean ≈ 20–30);
this is a properly developed image.

**Consequence:** the decode stage needs no third-party software at all. The pipeline becomes
macOS-native for stage one and Docker for stage two.

## Why nobody uses it

Because it is macOS-only, and because the open-source world has been solving this the hard way. Both
facts make it easy to miss.

## The open-source landscape, in detail

### LibRaw — imminent but not public

| Fact | Detail |
|---|---|
| PR #826 | "Add Nikon Z9 High-Efficiency (HE) RAW format support". **Open**, `mergeable_state: dirty`, 9 commits, +4570/−93 across 45 files, last activity 2026-09-12 |
| Disposition | LibRaw stated on 2026-09-12 they will ship **their own** decoder this autumn and that #826 *"is not planned for use in the library and will be closed"* |
| Latest release | **0.22.2** (2026-07-16), explicitly bugfix-only. No 0.23.x, no snapshot tags. `master` contains no `nikon_he` file at all |
| libraw.org | Still lists *"Z 9 (HE/HE\* formats are not supported yet)"* |

Upgrading rawpy from LibRaw 0.22.1 to 0.22.2 changes nothing. The release that matters has not shipped.

**There is no HE\*-specific LibRaw PR.** PR #824 is *"Add Jiangtherapee Sony ARW6 CRAW HQ decoder"*,
merged 2026-07-18 — unrelated, and appears in #826 only as the competing decoder LibRaw was testing.

### The HE → HE\* delta is small — this is the encouraging part

HE\* was implemented in commit `389418ee20` of PR #826, then reverted 19 minutes later in
`8aebd05d0f`. Both remain in the fork. The delta:

> `HE : Bp ∈ {4, 5}` … `HE* : Bp ∈ {1, 2, 3}`

- **65 added lines across 5 files** — against a +4570-line HE decoder. **≈1.4 %.**
- 42 of those lines are `kGtliTable` lookup rows; 4 are camera-list strings.
- The entire logic change is **one `if` branch**: fire the precinct-16 LL reset on `Bp ∈ {1,2,3}`.

Same bitstream family, shared entropy coder, inverse 5/3 DWT and bayer reconstruction. A
format-specific delta, not a different codec.

It was reverted for quality, not infeasibility:

> "substantial decode artifacts (**32 % pixel diff** vs the production decoder, ~3.6 % with magnitude
> > 100 LSB), concentrated in specific tile bands). Visible to users; **not shippable**… The remaining
> gap is in the **clean-room decoder's tile orchestration vs the production decoder's**."

The residual was unexplained tile-level state bookkeeping — nobody had characterised it. Note the
"32 %" describes that commit's code; PR head `499bfd4` (2026-08-10) and RdWing's follow-up fixes
(2026-09-11) postdate it. Unverified whether the gap closed.

### A working pure-Python decoder exists today

On 2026-09-16 the pixls.us reverse-engineering effort published `nikon_he_decode.py` (34 KB) and
`export_dng.py` (12.6 KB) — **numpy only**, producing DNG 1.4 that opens in darktable.

Its docstring claims stages 3–6 are *"bit-exact with the LibRaw Nikon HE decoder (LibRaw PR #826)"*.
Critically, it **derives GCLI from the bitstream instead of using a `(Bp, Br)` table**, which is the
structural reason one script covers both variants where the C++ PR needed a branch. That is an
inference from reading the code, not a test result.

Other efforts: dnglab PR #835 is open with no reviews and routes `HighEfficencyStar = 14` with no
separate Bp handling; `lclevy/nikon_nef` is dead (last push 2024-04-27).

### The Nikon Image SDK — available, but no longer needed

Investigated because a darktable commenter claimed *"the included Nikon Image SDK does appear to
support HE RAW."* That claim is correct:

- **Access**: click-through licence only. No registration, no approval. The gate is
  `POST /apply/download` on a licence page. One checkbox.
- **Capability**: Nikon's own SDK reference for `kNkfl_Cmd_OpenSession` states it returns
  `kNkfl_Code_Err_NotSupported` *"when issued to a High efficiency compressed NEF on a 32-bit version
  of Windows."* Nikon **removed** that 32-bit limitation in the 2023.06.14 release. Affinity Photo 2.6
  independently confirms HE **and** HE\* via the Nikon SDK.
- **Platform**: macOS and native Apple Silicon builds exist (since 2023.01.31). A dylib, single entry
  point `Nkfl_Entry`.
- **Spec**: `Z_Series_RFmE_210.docx` ships only inside the gated archive. Both people who have read it
  report it is not a usable codec spec — *"falls way short of anything actually useful"*; another
  could not find HE/HE\* in it at all.
- **Licence constraints**:
  - §2.5 — may not *"manufacture or distribute … any software containing technology relating to the
    processing of NEF files"* without approval. **Redistribution is prohibited.**
  - §2.4 — may not reverse engineer, decompile or disassemble.
  - Private local use is within the licence. Publishing anything that embeds it is not.
- **Not a codec**: the SDK does its own demosaicing — *"Using Nikon SDK one can write another GUI
  around Nikon's engine, nothing more."* There is no per-strip access.

**Not pursued.** macOS ImageIO already decodes these files at full resolution with no licence gate and
no redistribution problem.

## Legal landscape

Relevant only if the macOS route is abandoned and we ship our own decoder.

- Patent **WO2023025487A1** (intoPIX, priority 2021-08-26; family includes US11606578B1,
  KR102767393B1, JP7608005B2, CN118044202B) claims Star-Tetrix decorrelation, the 5/3 lifting DWT, and
  **GCLI packetisation** — precisely the layer where the HE/HE\* delta lives. On-topic, not a strawman.
  Whether any implementation reads on the claims needs counsel.
- **LAME precedent**: developers never licensed, argued source-only release was "educational
  description", and told users to buy licences. *"Distributing compiled binaries … may have
  constituted infringement, but since 23 April 2017, all of these patents have expired."* A respected,
  never-litigated practice — not a tested legal defence. `Sega v. Accolade` is a copyright argument and
  does not reach patents.
- **Who will ship**: LibRaw — yes, patents never discussed in the thread. dnglab — undecided
  (*"how is it patented? Can a decoder ship legally in an application?"*, unanswered). CyberTimon/RapidRAW
  — no (*"shipping it directly inside the app looks legally unviable"*). Nikon — no (*"they couldn't"*).
  The EFF was contacted in April 2026 and has not replied.

Nobody has obtained a licence. Nobody has been sued.

## Options, ranked by cost

| Option | Cost | Status |
|---|---|---|
| **`sips` / ImageIO** | Zero | ✅ **Verified working, full resolution** |
| Core Image `CIRAWFilter` → 16-bit linear TIFF/DNG | Small native tool | Not yet built. Preserves highlight latitude — see below |
| Apple DNG Converter | Unknown | Reported working; unnecessary |
| Nikon's own Image SDK | Free, licence-restricted | Available; unnecessary |
| LibRaw's autumn snapshot | Free | Imminent; not yet public |
| piratenpanda's Python decoder | Free | Exists; unnecessary |
| Write our own | Weeks–months | Only if macOS is abandoned |
| Camera → lossless compression | 30 seconds | Still the guarantee |

## Risks

| Risk | Assessment |
|---|---|
| **Undocumented API.** Apple does not list HE/HE* in its supported-format documentation | Verified empirically on this exact OS build. But a future macOS update could remove it. Mitigation: a capability check at startup that fails loudly |
| **8-bit rendered output loses raw latitude** | Real. No highlight recovery or white-balance re-grading — those need raw. Mitigation: `CIRAWFilter` with extended dynamic range can emit 16-bit linear; build it only if the presets prove insufficient |
| **5.7 % shadow clipping** | Not yet diagnosed. Could be macOS's tone curve, or the scene. Compare against NX Studio before trusting it |
| Per-image decode cost | `sips` is a process spawn each time. A single long-lived native tool would be faster for 209 files |
| macOS-only | Acceptable — the operator works on macOS. This would need rethinking for a cross-platform tool |

## References

- [LibRaw PR #826](https://github.com/LibRaw/LibRaw/pull/826) — HE decoder, open, to be closed
- [darktable #15873](https://github.com/darktable-org/darktable/issues/15873) — HE/HE\* support thread
- [darktable #20841](https://github.com/darktable-org/darktable/issues/20841) — HE unsupported, use lossless
- [LibRaw #668](https://github.com/LibRaw/LibRaw/issues/668) — Z8/Z9 decode failures
- [pixls.us — Nikon HE\* decoder](https://discuss.pixls.us/t/nikon-he-decoder/56955) — the live effort
- [pixls.us — Z Series HE RAW support](https://discuss.pixls.us/t/nikon-z-series-high-efficiency-raw-support/50428/1)
- [dnglab PR #835](https://github.com/dnglab/dnglab/pull/835)
- [lclevy/nikon_nef](https://github.com/lclevy/nikon_nef)
- Nikon Image SDK — <https://sdk.nikonimaging.com/apply/>
- [intoPIX TicoRAW SDK](https://www.intopix.com/fasttico-raw-cpu-gpu-sdks)
- [RawTherapee #6408](https://github.com/RawTherapee/RawTherapee/issues/6408) — Adobe converter as Z 9 workaround
- [pixls.us — ART and HE files](https://discuss.pixls.us/t/art-can-not-read-nikon-high-efficiency-raw-files/53870)