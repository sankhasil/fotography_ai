---
type: decision
title: Decisions Log
---

# Decisions Log

Append-only. One line per entry: `YYYY-MM-DD: decided X because Y`.

Promote non-trivial decisions to full ADRs under `docs/adr/` when they affect architecture.

## Log

- 2026-09-24: decided to gate T-Systems health requests on a non-empty `TSYSTEMS_OPENCODE_API_KEY` because health should not be queried or shown without a shared provider credential.
- 2026-10-02: decided darktable-cli is the render engine because building demosaic and tone ourselves is 3-5x the work with worse quality; recorded as ADR-0001.
- 2026-10-02: decided rawpy is only a fallback for a camera body missing from darktable's supported list, not a second engine, because an undefined "can't process it" becomes a full second pipeline.
- 2026-10-02: decided the NEF editor CLI gets its own venv because DupeScope's is 2GB of torch and insightface the editor never imports; recorded as ADR-0002.
- 2026-10-02: decided grey and monochrome are distinct sub-styles, giving 4x4=16 presets, because "less colour" and "no colour" are different requests from a photographer.
- 2026-10-02: decided classification is a pure function over a metadata dictionary so most acceptance criteria test with no binaries and no image fixtures.
- 2026-10-02: decided v1 exports JPEG only, deferring TIFF and PNG, because one format is one code path.
- 2026-10-02: decided to verify the plan against the operator's 209 real NEFs before building, which found that they are High Efficiency* compressed and unreadable by every open-source decoder.
- 2026-10-02: decided to supersede ADR-0001 because LibRaw cannot identify HE* files so the rawpy fallback could never have fired, and darktable cannot read them either.
- 2026-10-02: decided to drop exiftool and rawpy because all four classification signals are in the standard EXIF IFD and readable in pure Python; recorded as ADR-0004.
- 2026-10-02: decided to drop face detection because the largest preview embedded in the NEF is 384x256, which is below reliable detection thresholds.
- 2026-10-02: decided to auto-detect only the night category because the landscape rule fires 0 times on a f/4-6.3 lens and the macro rule conflates wide with close-up.
- 2026-10-02: decided presets are darktable-cli --core parameter sets rather than style files because --style resolves only against the library database; recorded as ADR-0003.
- 2026-10-02: decided to reject containerising Adobe DNG Converter under Wine after five attempts all failed with STATUS_CONFLICTING_ADDRESSES; recorded as ADR-0005.
- 2026-10-02: decided to reject Nikon NX Studio as the engine because it has no CLI, no Linux build, no scripting dictionary, and is not redistributable.
- 2026-10-02: decided to export into a separate sibling folder grouped by category, leaving originals untouched.
- 2026-10-02: decided to write the category into EXIF ImageDescription and UserComment so it is readable without the database.
- 2026-10-02: decided to decode HE* with macOS ImageIO instead of Adobe DNG Converter because sips decoded a Z 9 HE* file at full 8256x5504 with no licence gate; recorded as ADR-0006 and superseding ADR-0005.
- 2026-10-02: decided not to adopt the Nikon Image SDK despite it supporting HE/HE*, because licence 2.5 prohibits redistribution and macOS already decodes these files.
- 2026-10-02: decided to probe for macOS ImageIO HE* support at startup and fail loudly, because the capability is undocumented by Apple and could be withdrawn.
- 2026-10-02: decided not to write our own HE* decoder because the HE-to-HE* delta is only about 65 lines, making it bounded rather than impossible, but macOS already solves it at zero cost.
- 2026-10-02: verified sips decodes 196 of 196 Z 9 HE* files with zero failures, producing 2.1GB of full-resolution JPEGs at a 10MB median.
- 2026-10-02: discovered darktable-cli accepts only one --core flag, so multiple modules must be semicolon-separated in a single argument; recorded in ADR-0003.
- 2026-10-02: verified piexif injects ImageDescription and UserComment into darktable output with a maximum pixel difference of zero, and darktable still reads the tagged file.
