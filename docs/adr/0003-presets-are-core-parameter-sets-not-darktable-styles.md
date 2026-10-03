---
type: decision
title: Presets are --core parameter sets, not darktable style files
status: accepted
date: 2026-10-02
---

# Presets are `--core` parameter sets, not darktable style files

## Context

The tool needs sixteen corrections — four categories × four sub-styles — applied automatically during
export. darktable offers two obvious mechanisms:

1. **Named styles** via `darktable-cli --style <name>`
2. **Ad-hoc module parameters** via `darktable-cli --core "<module>:<params>"`

Revision 1 of the plan assumed (1), with the sixteen presets authored as `.dtstyle` files. That was
never tested.

It was tested during verification, and it does not work.

## Decision

**Presets are `--core` parameter sets, authored as data in this repository and translated at
invocation.**

darktable-cli is invoked as:

```
darktable-cli <in.dng> <out>/<category> --core "<module>:<params>;<module>:<params>"
```

## Evidence

Tested against darktable-cli **5.6.1** in the pinned container `nef-editor-darktable:1`, rendering a
JPEG extracted from a Nikon NEF preview.

### `--style` fails

```
$ darktable-cli /probe/preview.jpg /out --style nef-portrait-neutral
[imageio] cannot find the style 'nef-portrait-neutral' to apply during export
[imageio] please check that you have imported this style into darktable and
         specified it in the command line without the .dtstyle extension
[imageio_storage_disk] could not export to file: `/out/preview.jpg'
```

This reproduces even with the file placed at `$XDG_CONFIG_HOME/darktable/styles/`, which is the
conventional location and the one revision 1 assumed. darktable resolves `--style` against its
**library database** (`librsqlite`), not against loose files on disk. Populating that database
headlessly means writing rows into another application's SQLite schema — unversioned, unsupported,
and liable to break on any darktable upgrade.

### `--core` works

```
$ darktable-cli /probe/preview.jpg /out/plain
[export_job] exported to `/out/plain/preview.jpg'

$ darktable-cli /probe/preview.jpg /out/cored --core "darktable.exposure:exposure=0.5"
[export_job] exported to `/out/cored/preview.jpg'

$ sha256sum out/plain/preview.jpg out/cored/preview.jpg
bb4bf47461c9d491...  out/plain/preview.jpg
554d9a0fcab4303e...  out/cored/preview.jpg
```

Different hashes: the adjustment was genuinely applied, with no library present.

### One `--core` flag only — modules are semicolon-separated

This was found during the Phase 1 integration spike, on a full 45 MP decode. Passing `--core` twice
**fails**:

```
$ darktable-cli /in/DSC_5128.jpg /out/night \
    --core "darktable.exposure:exposure=0.15" \
    --core "darktable.contrast:contrast=1.12"
    If -d signal or -d all is specified, specify the signal action
→ no output written
```

Multiple modules must go in a **single** flag, semicolon-separated:

```
$ darktable-cli /in/DSC_5128.jpg /out/night2 \
    --core "darktable.exposure:exposure=0.15;darktable.contrast:contrast=1.12"
[export_job] exported to `/out/night2/DSC_5128.jpg'
```

All three renders differ by SHA-256, so both the single-module and multi-module forms apply their
adjustments.

**Consequence for the wrapper:** a preset is composed into one string, never into a list of flags.
A sixteen-preset table with up to five modules each must serialise to one argument.

### Throughput

Measured on one 45.7 MP JPEG in the pinned container: **6.9 s warm**, 18.9 s cold. A 209-file folder
is therefore roughly **24 minutes** of render time, plus decode. Worth stating so nobody discovers it
as a surprise.

## Consequences

**Positive**

- No dependency on darktable's internal database schema.
- Presets are reviewable data in one place, diffable in git, not buried in application state.
- Survives darktable upgrades, which would silently invalidate a library-seeded approach.
- A preset is a string. Testing one is running darktable with that string.

**Negative**

- `--core` strings are less pleasant to author than `.dtstyle`, which are structured Lua.
- Correction state is invisible to the darktable GUI. A style applied by our tool will not appear in
  darktable's Styles panel — the output *will* still carry an XMP sidecar recording what was applied,
  so the information is recoverable, but not browsable.
- We lose any future ability to share these presets with other darktable users as `.dtstyle` files.

### Upgrade path

If darktable gains a supported headless style-import flag, revisit. The trigger is concrete: a
documented way to register a style without touching `librsqlite`.

## Also settled here: the CLI calling convention

Verification produced two facts that shape the wrapper, both of which revision 1 got wrong:

| Fact | Consequence |
|---|---|
| Input and output are **positional**; `-i` and `-o` **do not exist** in 5.6.1 | Passing `-i`/`-o` prints `warning: unknown option` and darktable silently re-parses positionally. My first NEF tests appeared to work for that reason alone. |
| There is **no** `--config` flag | Use `XDG_CONFIG_HOME`; darktable reads `$XDG_CONFIG_HOME/darktable/`. |

## References

- [`verification.md`](../architecture/nef-editor-cli/verification.md)
- [`presets.md`](../architecture/nef-editor-cli/presets.md)
- [Implementation plan](../architecture/nef-editor-cli/plan.md)
- darktable-cli 5.6.1 `--help`
- [ADR-0001](./0001-darktable-cli-as-render-engine.md) — superseded