# Preset XMP Sidecars

Each file in this directory is a darktable XMP sidecar for one preset,
named `nef-<category>-<sub-style>.xmp`.

## Authoring

1. Open a representative NEF in darktable GUI (on the host, not in Docker)
2. Apply the module stack for the category + sub-style
3. Right-click the image in the lighttable -> "Write sidecar files" -> save here
4. Rename the file to `nef-<category>-<sub-style>.xmp`
5. Commit to this directory

## Naming

| Category | Sub-styles |
|---|---|
| night | neutral, vivid, grey, monochrome |
| portrait | neutral, vivid, grey, monochrome |
| landscape | neutral, vivid, grey, monochrome |
| macro | neutral, vivid, grey, monochrome |

Total: 16 sidecars (4 categories x 4 sub-styles).

## Status

No sidecars authored yet. Until they exist, `select_sidecar()` returns
None and darktable renders with default development only (no correction).
This is equivalent to the old `--core` path, which was silently ignored.
