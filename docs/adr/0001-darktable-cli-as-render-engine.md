---
type: decision
title: darktable-cli is the render engine; rawpy is a narrow fallback
status: superseded
date: 2026-10-02
superseded_by: [ADR-0003](./0003-presets-are-core-parameter-sets-not-darktable-styles.md), [ADR-0004](./0004-read-exif-in-pure-python.md), [ADR-0005](./0005-he-requires-a-host-side-converter.md)
---

# darktable-cli is the render engine; rawpy is a narrow fallback

> **SUPERSEDED on 2026-10-02.** Two of this record's three conclusions did not survive verification
> against the operator's actual photographs. See
> [`verification.md`](../architecture/nef-editor-cli/verification.md).
>
> - The **rawpy fallback never existed in practice.** LibRaw cannot `identify()` the operator's
>   HE\*-compressed Z 9 files at any available version, so the fallback could not have fired once.
>   The "LibRaw often reads what darktable cannot" premise was simply false here.
> - **darktable-cli cannot read the files either.** Not directly — the pipeline now requires a
>   conversion stage in front of it. darktable remains the *render* engine; it is no longer the
>   *decode* engine. See ADR-0005.
> - Still sound: raw tools are the right domain, and delegating beats writing image mathematics.
>
> Kept as the reasoning of record. Do not implement from it.

## Context

The tool must turn Nikon `.nef` files into corrected `.jpg` files. Two ways to do that:

1. Depend on an external binary — `darktable-cli` — which already performs the entire pipeline:
   RAW decode, demosaic, auto-exposure, colour, preset application, JPEG export, and XMP sidecar
   writing.
2. Build the pipeline in Python on top of `rawpy` / LibRaw and numpy.

Option 2 is not a small variation on option 1. Demosaic quality, tone mapping, and colour science
are the hardest problems in this domain, and libraries that solve them well — demosaic algorithms,
scene-referred tone curves — are decades of work. LibRaw gives us a correctly demosaiced 16-bit
image; it does not give us a good photograph.

The earlier draft estimated option 2 at three to five times the work with worse demosaic and tone.
Nothing found since has changed that estimate.

This decision was explicitly confirmed by the operator: depend on `darktable-cli`, and use rawpy only
where darktable cannot cope.

The remaining question was what "cannot cope" means. Left vague, the fallback becomes a second full
engine — the exact cost this ADR exists to avoid.

## Decision

**`darktable-cli` is the primary and only render engine.** It is invoked directly via `subprocess`.

**`rawpy` is a fallback for one case only: a camera body absent from the installed darktable's
supported-camera list.** darktable's camera list lags new body releases by weeks to months, which is a
routine event for a Nikon user. Without a fallback, one unsupported body aborts the entire batch.

The fallback applies a neutral correction — no category styling — and records `engine = 'rawpy'` so
its output is identifiable after the fact.

**There is no engine interface, no base class, and no strategy registry.** The fallback is one
branch in `render`, not a polymorphic call.

### Trigger, precisely

The fallback fires only when **both** conditions hold:

1. `darktable-cli` exits non-zero for this file, **and**
2. the file's camera model is not in darktable's supported list.

A darktable failure for any other reason — a malformed preset, a full disk, a permissions problem —
is a real error. It is reported and the run continues; it does **not** silently fall back to a
degraded render. Silently downgrading on an unrelated failure would hide the actual problem behind a
plausible-looking output.

## Consequences

**Positive**

- Roughly 500 lines of orchestration instead of several thousand lines of image mathematics.
- Demosaic and tone quality are darktable's, which is the best available outcome for a Nikon user.
- XMP sidecars come for free, and the output remains editable in darktable and Lightroom.
- Presets are darktable styles — an existing, inspectable, version-controllable format. No bespoke
  preset format is invented.
- The fallback is a single `if` plus one module of tests. Nothing else in the system depends on it.

**Negative**

- Two external binaries must be installed and version-matched (`darktable`, `exiftool`). Neither is
  currently in `devbox.json`.
- GPL as an external dependency. The tool invokes darktable as a separate process; it does not link
  it. Anyone distributing this tool must respect darktable's licence.
- Output quality is bounded by darktable's presets. If a preset is wrong, the render is wrong.
- darktable's version governs which bodies are supported, so behaviour is environment-dependent.

**The real cost, stated honestly:** the presets, not the orchestrator, determine whether this tool is
useful. Delegating the engine makes the code small and makes the actual work — authoring sixteen
styles that people want — unavoidable and iterative. The temptation will be to treat the code as the
project. It is not.

## Alternatives considered

**RawTherapee-cli as a second engine.** Rejected: the same job, a second render path, and a second
preset format to author. It would double the preset authoring work for no gain. Retained as the
candidate if a third engine is ever needed — see the upgrade path below.

**Pure Python via rawpy + numpy.** Rejected: three to five times the work, materially worse demosaic
and tone, and we would own the image mathematics forever. This is the alternative most worth
reconsidering only if the GPL constraint ever becomes legal rather than practical.

**An engine interface with two implementations.** Rejected despite two engines existing. The two
share no configuration format, no preset format, and no output contract — only the vague property of
producing a JPEG. An interface over that is an abstraction with one real implementation and one
degraded implementation, which is harder to reason about than a branch. Two call sites do not make a
seam.

**A bundled darktable binary.** Rejected for now. It would remove the installation burden, at the
cost of a vendored GPL binary in the repository. Revisit if installation friction proves to be the
dominant support problem.

### Upgrade path

If a third engine appears, revisit the interface question **then**, with evidence of what the three
engines actually share. Do not pre-build for it.

If the rawpy fallback misfires in practice, delete the branch. It is one `if` and one test module.

## References

- [Implementation plan](../architecture/nef-editor-cli/plan.md)
- [Preset matrix](../architecture/nef-editor-cli/presets.md)
- [Research record](../nef-editor-cli-plan.md)
- darktable-cli manpage; docs.darktable.org 4.6
- rawtherapee-cli manpage, rawtherapee 5.x
- rawpy / LibRaw release notes