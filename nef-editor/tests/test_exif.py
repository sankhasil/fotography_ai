"""Behaviour of the EXIF reader and the category writer.

Maps to acceptance criterion 4 in the plan, plus the criterion 10 requirement
that a category is readable from the exported file without the database.

The reader is pure Python and imports nothing third-party. That is the point of
ADR-0004: exiftool and rawpy were both deleted from this project, and neither
could read these files anyway.
"""

from __future__ import annotations

import base64
from pathlib import Path

import pytest

from nef_editor.exif import read_metadata, write_category
from nef_editor.model import Metadata
from tests.conftest import CORPUS, build_tiff


def _write(tmp_path: Path, **kwargs: object) -> Path:
    target = tmp_path / "sample.nef"
    target.write_bytes(build_tiff(**kwargs))
    return target


# --- reading --------------------------------------------------------------------


def test_reads_all_four_signals(tmp_path: Path) -> None:
    path = _write(tmp_path, iso=2000, exposure=(10, 80000), fnumber=(400, 100), focal=(240, 10))
    meta = read_metadata(path)

    assert meta.iso == 2000
    assert meta.shutter == pytest.approx(1 / 8000)
    assert meta.aperture == pytest.approx(4.0)
    assert meta.focal_length == pytest.approx(24.0)


def test_reads_body_and_firmware(tmp_path: Path) -> None:
    meta = read_metadata(_write(tmp_path))
    assert meta.make == "NIKON CORPORATION"
    assert meta.model == "NIKON Z 9"
    assert meta.firmware == "Ver.05.10"


def test_missing_tags_are_none_not_zero(tmp_path: Path) -> None:
    meta = read_metadata(_write(tmp_path, iso=None))
    assert meta.iso is None
    assert meta.aperture is None


def test_a_file_with_no_exif_at_all_yields_empty_metadata(tmp_path: Path) -> None:
    """Truncated or non-TIFF input must not raise — the batch has to continue."""
    junk = tmp_path / "broken.nef"
    junk.write_bytes(b"not a tiff at all")
    assert read_metadata(junk) == Metadata()


def test_reading_never_raises(tmp_path: Path) -> None:
    for payload in (b"", b"II", b"II\x2a\x00", b"II\x2a\x00\x08\x00\x00\x00\xff\xff"):
        path = tmp_path / "x.nef"
        path.write_bytes(payload)
        read_metadata(path)  # must not raise


# --- criterion 4: against a real Z 9 HE* file -----------------------------------


@pytest.mark.skipif(not CORPUS.is_dir(), reason="operator photo corpus not present")
def test_reads_a_real_z9_he_star_file() -> None:
    sample = sorted(CORPUS.glob("*.NEF"))[0]
    meta = read_metadata(sample)

    assert meta.model == "NIKON Z 9"
    assert meta.iso is not None
    assert meta.aperture is not None
    assert meta.focal_length is not None


# --- criterion 10: the category is readable from the file -----------------------


def test_write_category_sets_both_fields(tmp_path: Path) -> None:
    path = tmp_path / "out.jpg"
    path.write_bytes(_jpeg_bytes())

    write_category(path, "night")

    import piexif

    exif = piexif.load(str(path))
    assert exif["0th"][piexif.ImageIFD.ImageDescription] == b"nef-editor: night"
    assert exif["Exif"][piexif.ExifIFD.UserComment][8:] == b"night"


def test_write_category_leaves_pixels_untouched(tmp_path: Path) -> None:
    """Injecting metadata must not re-encode or corrupt the image."""
    path = tmp_path / "out.jpg"
    original = _jpeg_bytes()
    path.write_bytes(original)

    write_category(path, "portrait")
    tagged = path.read_bytes()

    assert tagged != original, "expected the file to change"
    assert _jpeg_payload(tagged) == _jpeg_payload(original)


def _jpeg_bytes() -> bytes:
    """A minimal but genuinely valid 1x1 baseline JPEG.

    piexif validates JPEG structure, so a hand-rolled blob is not good enough —
    this is a standard reference blob, embedded as base64 to keep it copyable.
    """
    return base64.b64decode(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
        "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
        "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
    )


def _jpeg_payload(data: bytes) -> bytes:
    """Everything between the SOI and EOI markers — i.e. the entropy-coded image."""
    start = data.index(b"\xff\xda")
    end = data.rindex(b"\xff\xd9")
    return data[start:end]