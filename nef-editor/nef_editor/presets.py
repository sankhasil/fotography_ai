"""Preset sidecar selection.

Presets are XMP sidecar files authored in darktable's GUI and shipped as
data files under presets/. The CLI selects one by category + sub-style
and passes it to darktable-cli as the second positional argument.

This replaces the --core string approach, which was silently ignored
by darktable-cli 5.6.1 (falsified 2026-10-04; ADR-0003 superseded).
"""

from __future__ import annotations

from pathlib import Path

from nef_editor.model import Category, SubStyle

PRESETS_DIR = Path(__file__).resolve().parent.parent / "presets"


def select_sidecar(category: Category, sub_style: SubStyle) -> Path | None:
    """Return the XMP sidecar path for a category + sub-style, or None.

    Returns None when the sidecar does not exist yet. The caller renders
    without correction in that case -- same as the old --core path, which
    was silently ignored anyway. A None return is not an error.

    UNCLASSIFIED has no preset and always returns None.
    """
    if category is Category.UNCLASSIFIED:
        return None
    xmp = PRESETS_DIR / f"nef-{category.value}-{sub_style.value}.xmp"
    return xmp if xmp.exists() else None


def preset_name(category: Category, sub_style: SubStyle) -> str:
    """The stable identifier recorded in the database, e.g. nef-portrait-vivid."""
    return f"nef-{category.value}-{sub_style.value}"


def all_preset_names() -> tuple[str, ...]:
    """All 16 preset names (4 categories x 4 sub-styles)."""
    categories = tuple(c for c in Category if c is not Category.UNCLASSIFIED)
    return tuple(
        preset_name(c, s) for c in categories for s in SubStyle
    )


def existing_presets() -> tuple[str, ...]:
    """Names of XMP sidecars actually present in presets/."""
    if not PRESETS_DIR.exists():
        return ()
    return tuple(
        f.stem for f in sorted(PRESETS_DIR.glob("nef-*.xmp"))
    )
