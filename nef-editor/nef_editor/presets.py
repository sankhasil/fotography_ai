"""The sixteen corrections, as darktable-cli `--core` parameter sets.

A preset is composed into ONE string. darktable-cli rejects repeated `--core`
flags; multiple modules must be semicolon-separated inside a single argument.
Verified in the Phase 1 spike and recorded in ADR-0003.

NOTE ON MAGNITUDES: presets.md fixes the *names*, the base-plus-delta structure
and the ordering, but deliberately leaves parameter values to visual iteration
against real photographs. The numbers below are a defensible starting point, not
a tuned result. Treat them as provisional and revise by comparing renders.
"""

from __future__ import annotations

from nef_editor.model import Category, SubStyle

# Categories that have presets. UNCLASSIFIED deliberately has none.
PRESET_CATEGORIES: tuple[Category, ...] = (
    Category.PORTRAIT,
    Category.LANDSCAPE,
    Category.MACRO,
    Category.NIGHT,
)

# Sub-style deltas, applied on top of the category delta.
# Keyed by sub-style because `neutral` contributes nothing.
_SUB_STYLE_DELTA: dict[SubStyle, str] = {
    SubStyle.NEUTRAL: "",
    SubStyle.VIVID: "darktable.saturation:saturation=1.250",
    SubStyle.GREY: "darktable.saturation:saturation=0.600",
    SubStyle.MONOCHROME: "darktable.mono:mix=1.000",
}

# Per-category deltas: subject-appropriate sharpening, noise handling, contrast.
_CATEGORY_DELTA: dict[Category, str] = {
    # Softer global contrast; sharpening kept modest to avoid haloes on skin.
    Category.PORTRAIT: "darktable.exposure:exposure=0.000;darktable.contrast:contrast=1.020",
    # Local contrast to separate foreground from sky; gentle highlight recovery.
    Category.LANDSCAPE: "darktable.contrast:contrast=1.150;darktable.tone:saturation=1.050",
    # Micro-contrast at high effective magnification; conservative NR.
    Category.MACRO: "darktable.sharpening:sharpen=0.200;darktable.contrast:contrast=1.080",
    # Shadow recovery plus restrained highlight handling around point sources.
    Category.NIGHT: "darktable.shadows:shadows=0.400;darktable.contrast:contrast=1.100",
}

# Composition: base, then category, then sub-style. Monochrome must come last so
# it wins over any sub-style saturation delta.
_BASE = "darktable.exposure:exposure=0.000"


def build_correction(category: Category, sub_style: SubStyle) -> str:
    """Compose one `--core` string for a category and sub-style.

    Raises KeyError for UNCLASSIFIED, which has no preset. The caller must not
    substitute a default: a silent fallback would hide a miscategorisation.
    """
    parts = [_BASE, _CATEGORY_DELTA[category], _SUB_STYLE_DELTA[sub_style]]
    ordered = [p for p in parts if p]
    if sub_style is SubStyle.MONOCHROME:
        # Move the mono conversion to the end, past any saturation delta.
        ordered = [p for p in ordered if "darktable.mono" not in p]
        ordered.append("darktable.mono:mix=1.000")
    return ";".join(ordered)


def preset_name(category: Category, sub_style: SubStyle) -> str:
    """The stable identifier recorded in the database, e.g. nef-portrait-vivid."""
    return f"nef-{category.value}-{sub_style.value}"


def all_preset_names() -> tuple[str, ...]:
    return tuple(
        preset_name(c, s) for c in PRESET_CATEGORIES for s in SubStyle
    )