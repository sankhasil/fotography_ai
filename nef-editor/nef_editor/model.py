"""Data contract for the NEF editor.

Types only. No logic, no I/O, no framework. Every component in the plan speaks
these types, so this module is what the tests are written against.

Source: docs/architecture/nef-editor-cli/plan.md (revision 3)
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

# ISO at or above which a photograph is classified `night`.
# Measured: 56 of 209 files in the reference corpus. See verification.md.
NIGHT_ISO_THRESHOLD = 3200


class Category(StrEnum):
    """Scene category.

    UNCLASSIFIED is a first-class state, not an error. A photograph with no
    category and no --category override has no preset, so it is recorded with a
    null output and the batch continues.
    """

    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    MACRO = "macro"
    NIGHT = "night"
    UNCLASSIFIED = "unclassified"


class SubStyle(StrEnum):
    """Aesthetic intent.

    Never detected — an aesthetic intent is not inferable from metadata.
    Defaults to NEUTRAL; set with --sub-style.
    """

    VIVID = "vivid"
    NEUTRAL = "neutral"
    GREY = "grey"
    MONOCHROME = "monochrome"


#: Order matters: these drive the CLI error message and the help text.
CATEGORIES: tuple[str, ...] = tuple(c.value for c in Category)
SUB_STYLES: tuple[str, ...] = tuple(s.value for s in SubStyle)

#: Categories an operator may assign with --category. UNCLASSIFIED is excluded:
# omitting --category already means unclassified, so offering it would be a
# redundant way to say nothing.
ASSIGNABLE_CATEGORIES: tuple[str, ...] = tuple(
    c.value for c in Category if c is not Category.UNCLASSIFIED
)


@dataclass(frozen=True, slots=True)
class Metadata:
    """The four EXIF signals classification needs.

    Every field is optional because a malformed or truncated file may carry any
    subset. `None` means "not present in the file", never "zero".
    """

    iso: int | None = None
    shutter: float | None = None
    aperture: float | None = None
    focal_length: float | None = None
    make: str | None = None
    model: str | None = None
    firmware: str | None = None


@dataclass(frozen=True, slots=True)
class Classification:
    """Result of classifying one photograph.

    `reasons` is the ordered list of signals that fired. It is a first-class
    output, not debug logging: it is what makes a run explainable, and it is
    written to the database.
    """

    category: Category
    sub_style: SubStyle
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PhotoRecord:
    """One row of the `photos` table. See database.md."""

    source_path: str
    source_mtime: float
    source_size: int

    category: Category
    sub_style: SubStyle
    reasons: tuple[str, ...]

    correction: str
    pipeline: str

    output_path: str | None = None
    output_hash: str | None = None
    tool_versions: str = "{}"

    processed_at: str = ""