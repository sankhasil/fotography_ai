"""Classification of one photograph.

Auto-detects two categories:
- night: ISO >= 3200 AND preview luminance < 0.35 (dark + high ISO)
- portrait: face detected in the embedded preview (Apple Vision framework)

All other categories are operator-assigned with --category.

The luminance check was added after verification showed 17 of 59 high-ISO
photos were bright daylight (shot at 1/8000s with high ISO for action).
ISO alone is not a reliable night signal. See plan-verification-matrix.md.

See ADR-0010 for face detection.
"""

from __future__ import annotations

from pathlib import Path

from nef_editor.model import (
    NIGHT_ISO_THRESHOLD,
    NIGHT_LUMINANCE_THRESHOLD,
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
    luminance: float = 1.0,
) -> Classification:
    """Classify one photograph.

    Priority (highest wins):
    1. Operator --category (unless --only-unclassified)
    2. Night (ISO >= 3200 AND luminance < 0.35)
    3. Portrait (face detected in preview)
    4. Operator --category as fallback (when --only-unclassified)
    5. UNCLASSIFIED

    `face_count` and `luminance` are provided by the caller (pipeline.process_one)
    via the face and preview modules. The classifier itself does not do I/O.

    `luminance` defaults to 1.0 (bright) — if no preview is available, the
    luminance check is skipped and night detection falls back to ISO alone.
    Set to -1.0 to explicitly skip (treated as "unknown, don't block night").

    Never raises: an unreadable photograph is UNCLASSIFIED with a reason.
    """
    # 1. Operator override (when not --only-unclassified)
    if category is not None and not only_unclassified:
        return Classification(
            category=category,
            sub_style=sub_style,
            reasons=(f"category assigned by operator: {category.value}",),
        )

    # 2. Night (ISO + luminance)
    if metadata.iso is not None and metadata.iso >= NIGHT_ISO_THRESHOLD:
        is_dark = luminance < 0 or luminance < NIGHT_LUMINANCE_THRESHOLD
        if is_dark:
            lum_reason = f"luminance {luminance:.3f} < {NIGHT_LUMINANCE_THRESHOLD}"
            return Classification(
                category=Category.NIGHT,
                sub_style=sub_style,
                reasons=(
                    f"night: ISO {metadata.iso} >= {NIGHT_ISO_THRESHOLD}",
                    lum_reason,
                    f"lens: {_describe(metadata)}",
                ),
            )
        # High ISO but bright — not night
        lum_reason = f"ISO {metadata.iso} >= {NIGHT_ISO_THRESHOLD} but luminance {luminance:.3f} >= {NIGHT_LUMINANCE_THRESHOLD}; not night (likely high-ISO daylight)"

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

    if metadata.iso >= NIGHT_ISO_THRESHOLD:
        return Classification(
            category=Category.UNCLASSIFIED,
            sub_style=sub_style,
            reasons=(
                lum_reason,
                "no face detected in preview",
                "assign a category with --category",
                f"lens: {_describe(metadata)}",
            ),
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