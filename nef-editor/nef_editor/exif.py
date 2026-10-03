"""Pure-Python EXIF reading and category writing.

ADR-0004. The four signals classification needs all live in the *standard* EXIF
IFD, not in Nikon's proprietary MakerNote, so a small TIFF reader replaces both
exiftool and rawpy. Both were deleted from this project: exiftool was only ever
justified by Picture Control, which we do not use, and rawpy cannot read
HE*-compressed files at all.

Verified: 209 of 209 files in the reference corpus yield ISO, shutter, aperture
and focal length. See verification.md.
"""

from __future__ import annotations

import struct
from pathlib import Path

from nef_editor.model import Metadata

# TIFF tags.
_TAG_MAKE = 271
_TAG_MODEL = 272
_TAG_SOFTWARE = 305
_TAG_EXIF_IFD = 34665
_TAG_EXPOSURE = 33434
_TAG_FNUMBER = 33437
_TAG_ISO = 34855
_TAG_FOCAL = 37386

_TYPE_ASCII = 2
_TYPE_SHORT = 3
_TYPE_LONG = 4
_TYPE_RATIONAL = 5

_TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}

_IMAGE_DESCRIPTION = 0x010E  # ImageDescription, IFD0
_SOFTWARE = 0x0131
_USER_COMMENT = 0x9286  # UserComment, Exif IFD

_USER_COMMENT_PREFIX = 8  # 8-byte character-code header required by the spec


def read_metadata(path: Path) -> Metadata:
    """Read the signals classification needs.

    Never raises. A truncated or non-TIFF file yields empty Metadata, because a
    single bad photograph must not stop the batch.

    ponytail: reads the whole file rather than seeking to the IFDs. The IFDs sit
    in the first ~35KB of a Z 9 NEF, so a prefix read would be faster, but the
    offset is not guaranteed across bodies. Correctness first; revisit only if
    reading is measured as the bottleneck.
    """
    try:
        data = path.read_bytes()
    except OSError:
        return Metadata()
    try:
        return _parse(data)
    except (struct.error, IndexError, ValueError, ZeroDivisionError):
        return Metadata()


def _parse(data: bytes) -> Metadata:
    if data[:2] != b"II":
        return Metadata()  # big-endian TIFF is not produced by any Nikon we target
    (first_ifd,) = struct.unpack_from("<I", data, 4)
    ifd0 = _read_ifd(data, first_ifd)

    fields: dict[str, object] = {
        "make": _ascii(data, ifd0.get(_TAG_MAKE)),
        "model": _ascii(data, ifd0.get(_TAG_MODEL)),
        "firmware": _ascii(data, ifd0.get(_TAG_SOFTWARE)),
    }

    exif_off = _offset(ifd0.get(_TAG_EXIF_IFD))
    if exif_off:
        exif = _read_ifd(data, exif_off)
        iso = _scalar(data, exif.get(_TAG_ISO))
        if iso is not None:
            fields["iso"] = int(iso)
        exposure = _rational(data, exif.get(_TAG_EXPOSURE))
        if exposure:
            # ExposureTime is the duration in seconds already (1/8000 -> 0.000125).
            fields["shutter"] = exposure
        aperture = _rational(data, exif.get(_TAG_FNUMBER))
        if aperture:
            fields["aperture"] = aperture
        focal = _rational(data, exif.get(_TAG_FOCAL))
        if focal:
            fields["focal_length"] = focal

    return Metadata(**fields)  # type: ignore[arg-type]


def _read_ifd(data: bytes, offset: int) -> dict[int, tuple[int, int, bytes]]:
    """Return {tag: (type, count, value_or_offset_bytes)} for one IFD."""
    if offset <= 0 or offset + 2 > len(data):
        return {}
    (count,) = struct.unpack_from("<H", data, offset)
    entries: dict[int, tuple[int, int, bytes]] = {}
    for i in range(count):
        pos = offset + 2 + i * 12
        if pos + 12 > len(data):
            break
        tag, typ, cnt = struct.unpack_from("<HHI", data, pos)
        size = _TYPE_SIZE.get(typ, 1) * cnt
        if size <= 4:
            raw = data[pos + 8 : pos + 8 + size]
        else:
            (value_off,) = struct.unpack_from("<I", data, pos + 8)
            raw = data[value_off : value_off + size]
        entries[tag] = (typ, cnt, raw)
    return entries


def _offset(entry: tuple[int, int, bytes] | None) -> int | None:
    """The integer an entry carries.

    For anything wider than 4 bytes the integer is an offset into the file, so
    `raw` is the *pointer*, not the value. Callers only use this for pointer
    tags (the Exif IFD), where the entry is always an inline LONG.
    """
    if entry is None:
        return None
    typ, _, raw = entry
    if typ == _TYPE_LONG and len(raw) >= 4:
        return struct.unpack_from("<I", raw)[0]
    if typ == _TYPE_SHORT and len(raw) >= 2:
        return struct.unpack_from("<H", raw)[0]
    return None


def _ascii(data: bytes, entry: tuple[int, int, bytes] | None) -> str | None:
    if entry is None or entry[0] != _TYPE_ASCII:
        return None
    text = entry[2].split(b"\0", 1)[0].decode("latin-1").strip()
    return text or None


def _scalar(data: bytes, entry: tuple[int, int, bytes] | None) -> float | None:
    if entry is None:
        return None
    typ, _, raw = entry
    try:
        if typ == _TYPE_SHORT:
            return float(struct.unpack_from("<H", raw)[0])
        if typ == _TYPE_LONG:
            return float(struct.unpack_from("<I", raw)[0])
    except struct.error:
        return None
    return None


def _rational(data: bytes, entry: tuple[int, int, bytes] | None) -> float | None:
    """First RATIONAL in the entry, as a float. 0/0 yields None."""
    if entry is None or entry[0] != _TYPE_RATIONAL or len(entry[2]) < 8:
        return None
    num, den = struct.unpack_from("<II", entry[2])
    return num / den if den else None


def write_category(path: Path, category: str) -> None:
    """Stamp the category into the exported JPEG's EXIF.

    Writes both fields the plan requires:
      ImageDescription (IFD0)  -> "nef-editor: <category>"
      UserComment     (Exif)   -> "<category>"

    Only the metadata segment is rewritten; the entropy-coded image data is
    untouched. Verified by byte comparison in tests/test_exif.py.
    """
    import piexif

    exif = piexif.load(str(path))
    exif["0th"][_IMAGE_DESCRIPTION] = f"nef-editor: {category}".encode()
    exif["0th"][_SOFTWARE] = b"nef-editor"
    exif["Exif"][_USER_COMMENT] = b"\0" * _USER_COMMENT_PREFIX + category.encode()
    piexif.insert(piexif.dump(exif), str(path))