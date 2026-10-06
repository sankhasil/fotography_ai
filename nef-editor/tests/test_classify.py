"""Behaviour of the classifier.

Maps to acceptance criteria 1, 2, 3 and 11 in the plan. Pure functions only —
no binaries, no fixtures, no network.

Measured corpus facts these tests encode (verification.md):
  - ISO across 209 Z 9 files spans 160-25600, so 3200 is a real interior boundary.
  - The old shutter>=1/30 test was vacuous: every shutter was faster than 1/800s.
  - The old f/8-f/11 landscape rule fired 0 times on a f/4-6.3 lens.
"""

from __future__ import annotations

import pytest

from nef_editor.classify import classify
from nef_editor.model import Category, Metadata, SubStyle

# --- criterion 1: night is auto-detected from ISO -------------------------------


@pytest.mark.parametrize("iso", [3200, 3201, 6400, 25600])
def test_high_iso_is_night(iso: int) -> None:
    assert classify(Metadata(iso=iso)).category is Category.NIGHT


def test_night_records_the_iso_that_fired() -> None:
    result = classify(Metadata(iso=6400))
    assert any("6400" in reason for reason in result.reasons)


# --- criterion 2: nothing else is auto-detected ---------------------------------


@pytest.mark.parametrize("iso", [160, 400, 3199])
def test_low_iso_is_not_auto_classified(iso: int) -> None:
    """The operator assigns these. Guessing a scene from EXIF is what we removed."""
    assert classify(Metadata(iso=iso)).category is Category.UNCLASSIFIED


def test_scene_categories_are_never_inferred() -> None:
    """Regression guard for rules dropped after measurement.

    A 24mm f/4 shot at ISO 100 must not become `landscape` or `macro`.
    """
    meta = Metadata(iso=100, focal_length=24.0, aperture=4.0, shutter=1 / 2000)
    assert classify(meta).category is Category.UNCLASSIFIED


# --- criterion 3: reasons are always present ------------------------------------


@pytest.mark.parametrize(
    "meta",
    [
        Metadata(),
        Metadata(iso=None),
        Metadata(iso=100, shutter=None, aperture=None, focal_length=None),
    ],
    ids=["empty", "explicit-none", "partial"],
)
def test_reasons_are_never_empty(meta: Metadata) -> None:
    assert classify(meta).reasons != ()


def test_missing_metadata_does_not_raise() -> None:
    assert classify(Metadata()).category is Category.UNCLASSIFIED


# --- criterion 11: overrides ----------------------------------------------------


def test_category_override_bypasses_detection() -> None:
    result = classify(Metadata(iso=25600), category=Category.PORTRAIT)
    assert result.category is Category.PORTRAIT


def test_category_override_is_recorded_as_a_reason() -> None:
    """The database must show a human chose this, not that we detected it."""
    result = classify(Metadata(iso=25600), category=Category.MACRO)
    assert any("macro" in r.lower() for r in result.reasons)


def test_substyle_defaults_to_neutral() -> None:
    assert classify(Metadata(iso=100)).sub_style is SubStyle.NEUTRAL


def test_substyle_is_never_detected() -> None:
    """No metadata value may change the sub-style. Aesthetic intent is not in EXIF."""
    for meta in (Metadata(iso=100), Metadata(iso=25600), Metadata()):
        assert classify(meta).sub_style is SubStyle.NEUTRAL


def test_substyle_override_applies() -> None:
    result = classify(Metadata(iso=100), sub_style=SubStyle.MONOCHROME)
    assert result.sub_style is SubStyle.MONOCHROME


# --- threshold boundary ---------------------------------------------------------


def test_threshold_is_exclusive_below_inclusive_at() -> None:
    assert classify(Metadata(iso=3199)).category is Category.UNCLASSIFIED
    assert classify(Metadata(iso=3200)).category is Category.NIGHT


# --- face detection → portrait --------------------------------------------------


def test_face_detection_classifies_portrait() -> None:
    """A photo with a face and low ISO is portrait, not unclassified."""
    result = classify(Metadata(iso=100), face_count=1)
    assert result.category is Category.PORTRAIT
    assert any("face" in r.lower() for r in result.reasons)


def test_multiple_faces_still_portrait() -> None:
    result = classify(Metadata(iso=200), face_count=3)
    assert result.category is Category.PORTRAIT
    assert "3 faces" in result.reasons[0]


def test_zero_faces_is_not_portrait() -> None:
    result = classify(Metadata(iso=100), face_count=0)
    assert result.category is Category.UNCLASSIFIED


def test_night_overrides_face_detection() -> None:
    """ISO >= 3200 wins over face detection — night photos need NR more than portrait tone."""
    result = classify(Metadata(iso=6400), face_count=1)
    assert result.category is Category.NIGHT


def test_operator_override_wins_over_face_detection() -> None:
    """--category landscape on a face photo is the operator's call."""
    result = classify(Metadata(iso=100, ), category=Category.LANDSCAPE, face_count=1)
    assert result.category is Category.LANDSCAPE


def test_only_unclassified_respects_face_detection() -> None:
    """--only-unclassified does not override a face-detected portrait."""
    result = classify(Metadata(iso=100), category=Category.LANDSCAPE,
                       only_unclassified=True, face_count=1)
    assert result.category is Category.PORTRAIT


def test_face_count_in_reasons() -> None:
    result = classify(Metadata(iso=100), face_count=2)
    assert "2 faces" in result.reasons[0]