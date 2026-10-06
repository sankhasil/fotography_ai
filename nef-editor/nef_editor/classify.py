"""Classification of one photograph.

Auto-detects two categories:
- night: ISO >= 3200
- portrait: face detected in the embedded preview (Apple Vision framework)

All other categories are operator-assigned with --category.

See verification.md for why the landscape/macro/shutter rules were dropped,
and ADR-0010 for face detection.
"""

from __future__ import annotations

from pathlib import Path

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
    only_unclassified: bool = False,
    face_count: int = 0,
) -> Classification:
    """Classify one photograph.

    Priority (highest wins):
    1. Operator --category (unless --only-unclassified)
    2. Night (ISO >= 3200)
    3. Portrait (face detected in preview)
    4. Operator --category as fallback (when --only-unclassified)
    5. UNCLASSIFIED

    `face_count` is provided by the caller (pipeline.process_one) via
    the face module. The classifier itself does not do I/O.

    Never raises: an unreadable photograph is UNCLASSIFIED with a reason.
    """
    # 1. Operator override (when not --only-unclassified)
    if category is not None and not only_unclassified:
        return Classification(
            category=category,
            sub_style=sub_style,
            reasons=(f"category assigned by operator: {category.value}",),
        )

    # 2. Night (ISO-based, strongest signal)
    if metadata.iso is not None and metadata.iso >= NIGHT_ISO_THRESHOLD:
        return Classification(
            category=Category.NIGHT,
            sub_style=sub_style,
            reasons=(
                f"night: ISO {metadata.iso} >= {NIGHT_ISO_THRESHOLD}",
                f"lens: {_describe(metadata)}",
            ),
        )

    # 3. Portrait (face detected)
    if face_count > 0:
        return Classification(
            category=Category.PORTRAIT,
            sub_style=sub_style,
            reasons=(
                f"portrait: {face_count} face{'s' if face_count != 1 else ''} detected",
                f"lens: {_describe(metadata)}",
            ),
        )

    # 4. Operator fallback (when --only-unclassified)
    if category is not None:
        return Classification(
            category=category,
            sub_style=sub_style,
            reasons=(f"category assigned by operator (fallback): {category.value}",),
        )

    # 5. UNCLASSIFIED
    if metadata.iso is None:
        return Classification(
            category=Category.UNCLASSIFIED,
            sub_style=sub_style,
            reasons=("no ISO in EXIF; cannot detect night",),
        )

    return Classification(
        category=Category.UNCLASSIFIED,
        sub_style=sub_style,
        reasons=(
            f"ISO {metadata.iso} < {NIGHT_ISO_THRESHOLD}; not night",
            "no face detected in preview",
            "assign a category with --category",
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