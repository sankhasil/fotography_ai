"""Behaviour of the classifier.

Maps to acceptance criteria 1, 2, 3 and 11 in the plan. Pure functions only —
no binaries, no fixtures, no network.

Measured corpus facts these tests encode (verification.md):
  - ISO across 209 Z 9 files spans 160-25600, so 3200 is a real interior boundary.
  - The old shutter>=1/30 test was vacuous: every shutter was faster than 1/800s.
  - The old f/8-f/11 landscape rule fired 0 times on a f/4-6.3 lens.
  - 17 of 59 high-ISO photos are bright daylight (lum > 0.44) — ISO alone is not night.
"""

from __future__ import annotations

import pytest

from nef_editor.classify import classify
from nef_editor.model import Category, Metadata, SubStyle

# --- night detection: ISO + luminance -------------------------------------------


@pytest.mark.parametrize("iso", [3200, 3201, 6400, 25600])
def test_high_iso_and_dark_is_night(iso: int) -> None:
    assert classify(Metadata(iso=iso), luminance=0.15).category is Category.NIGHT


def test_high_iso_but_bright_is_not_night() -> None:
    """17 of 59 high-ISO photos are bright daylight (1/8000s). ISO alone is not night."""
    result = classify(Metadata(iso=4000, focal_length=88.0, aperture=6.3), luminance=0.47)
    assert result.category is Category.UNCLASSIFIED
    assert "not night" in result.reasons[0].lower()


def test_night_records_iso_and_luminance() -> None:
    result = classify(Metadata(iso=6400), luminance=0.22)
    assert any("6400" in r for r in result.reasons)
    assert any("0.22" in r for r in result.reasons)


def test_luminance_threshold_boundary() -> None:
    """0.35 is the threshold. Below is dark, at-or-above is bright."""
    assert classify(Metadata(iso=3200), luminance=0.34).category is Category.NIGHT
    assert classify(Metadata(iso=3200), luminance=0.35).category is not Category.NIGHT


def test_low_iso_is_not_night_regardless_of_luminance() -> None:
    """A dark photo at ISO 100 is not 'night' — it's a long exposure."""
    assert classify(Metadata(iso=100), luminance=0.05).category is Category.UNCLASSIFIED


# --- nothing else is auto-detected ----------------------------------------------


@pytest.mark.parametrize("iso", [160, 400, 3199])
def test_low_iso_is_not_auto_classified(iso: int) -> None:
    assert classify(Metadata(iso=iso)).category is Category.UNCLASSIFIED


def test_scene_categories_are_never_inferred() -> None:
    meta = Metadata(iso=100, focal_length=24.0, aperture=4.0, shutter=1 / 2000)
    assert classify(meta).category is Category.UNCLASSIFIED


# --- reasons are always present -------------------------------------------------


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


# --- overrides -------------------------------------------------------------------


def test_category_override_bypasses_detection() -> None:
    result = classify(Metadata(iso=25600), category=Category.PORTRAIT, luminance=0.1)
    assert result.category is Category.PORTRAIT


def test_category_override_is_recorded_as_a_reason() -> None:
    result = classify(Metadata(iso=25600), category=Category.MACRO, luminance=0.1)
    assert any("macro" in r.lower() for r in result.reasons)


def test_substyle_defaults_to_neutral() -> None:
    assert classify(Metadata(iso=100)).sub_style is SubStyle.NEUTRAL


def test_substyle_is_never_detected() -> None:
    for meta in (Metadata(iso=100), Metadata(iso=25600), Metadata()):
        assert classify(meta).sub_style is SubStyle.NEUTRAL


def test_substyle_override_applies() -> None:
    result = classify(Metadata(iso=100), sub_style=SubStyle.MONOCHROME)
    assert result.sub_style is SubStyle.MONOCHROME


# --- face detection → portrait --------------------------------------------------


def test_face_detection_classifies_portrait() -> None:
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
    """ISO >= 3200 + dark wins over face detection."""
    result = classify(Metadata(iso=6400), face_count=1, luminance=0.15)
    assert result.category is Category.NIGHT


def test_operator_override_wins_over_face_detection() -> None:
    result = classify(Metadata(iso=100), category=Category.LANDSCAPE, face_count=1)
    assert result.category is Category.LANDSCAPE


def test_only_unclassified_respects_face_detection() -> None:
    result = classify(Metadata(iso=100), category=Category.LANDSCAPE,
                      only_unclassified=True, face_count=1)
    assert result.category is Category.PORTRAIT


def test_face_count_in_reasons() -> None:
    result = classify(Metadata(iso=100), face_count=2)
    assert "2 faces" in result.reasons[0]
