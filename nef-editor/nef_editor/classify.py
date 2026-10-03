"""Classification of one photograph.

A pure function. No I/O, no subprocess, no clock, no randomness — which is why
its tests need no binaries and no fixtures.

Only `night` is detected. That is a measured decision, not an oversight: the
landscape rule (f/8-f/11) fired 0 times on a f/4-6.3 lens, the macro rule
conflated "wide" with "close-up", and the shutter test in the night rule was
vacuous because every shutter in the corpus was faster than 1/800s. See
verification.md.

The operator assigns the remaining categories with --category.
"""

from __future__ import annotations

from nef_editor.model import (
    NIGHT_ISO_THRESHOLD,
    Category,
    Classification,
    Metadata,
    SubStyle,
)


def classify(
    metadata: Metadata,
    *,
    category: Category | None = None,
    sub_style: SubStyle = SubStyle.NEUTRAL,
) -> Classification:
    """Classify one photograph.

    An explicit `category` always wins and is recorded as a human decision.
    Otherwise `night` is detected from ISO, and anything else is UNCLASSIFIED
    rather than guessed at.

    Never raises: an unreadable photograph is UNCLASSIFIED with a reason, and
    the batch continues.
    """
    if category is not None:
        return Classification(
            category=category,
            sub_style=sub_style,
            reasons=(f"category assigned by operator: {category.value}",),
        )

    if metadata.iso is None:
        return Classification(
            category=Category.UNCLASSIFIED,
            sub_style=sub_style,
            reasons=("no ISO in EXIF; cannot detect night",),
        )

    if metadata.iso >= NIGHT_ISO_THRESHOLD:
        return Classification(
            category=Category.NIGHT,
            sub_style=sub_style,
            reasons=(
                f"night: ISO {metadata.iso} >= {NIGHT_ISO_THRESHOLD}",
                f"lens: {_describe(metadata)}",
            ),
        )

    return Classification(
        category=Category.UNCLASSIFIED,
        sub_style=sub_style,
        reasons=(
            f"ISO {metadata.iso} < {NIGHT_ISO_THRESHOLD}; not night",
            "EXIF carries no scene information; assign a category with --category",
            f"lens: {_describe(metadata)}",
        ),
    )


def _describe(metadata: Metadata) -> str:
    """Human-readable capture context. Empty string when nothing is known."""
    bits = []
    if metadata.make and metadata.model:
        bits.append(f"{metadata.make} {metadata.model}")
    if metadata.focal_length is not None:
        bits.append(f"{metadata.focal_length:g}mm")
    if metadata.aperture is not None:
        bits.append(f"f/{metadata.aperture:g}")
    if metadata.shutter is not None:
        bits.append(f"1/{round(1 / metadata.shutter):g}s" if metadata.shutter else "")
    if metadata.firmware:
        bits.append(f"fw {metadata.firmware}")
    return ", ".join(b for b in bits if b)