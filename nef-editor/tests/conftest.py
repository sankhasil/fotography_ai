"""Shared test fixtures.

Builds minimal TIFF files in memory so the EXIF parser can be tested against a
known structure. The operator's real files are 33MB each; committing one to the
repository to test a ~60-line parser is the wrong trade.
"""

from __future__ import annotations

import struct
from pathlib import Path

# TIFF tags we care about.
MAKE, MODEL, SOFTWARE = 271, 272, 305
EXIF_IFD_POINTER = 34665
EXPOSURE_TIME, FNUMBER, ISO, FOCAL_LENGTH = 33434, 33437, 34855, 37386

_TYPE_SHORT, _TYPE_LONG, _TYPE_ASCII, _TYPE_RATIONAL = 3, 4, 2, 5
_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1}


def build_tiff(
    *,
    iso: int | None = None,
    exposure: tuple[int, int] | None = None,
    fnumber: tuple[int, int] | None = None,
    focal: tuple[int, int] | None = None,
    make: str = "NIKON CORPORATION",
    model: str = "NIKON Z 9",
    software: str = "Ver.05.10",
) -> bytes:
    """Build a little-endian TIFF with an IFD0 and an Exif sub-IFD.

    Mirrors the real Z 9 layout closely enough to exercise every branch of the
    reader: ASCII strings in IFD0, rationals and a SHORT in the Exif IFD, and
    values that must spill past the 4-byte inline field.
    """
    header = b"II" + struct.pack("<HI", 42, 8)

    # Count entries up front: the data area sits after both IFDs, so its offset
    # cannot be known until the entry counts are.
    ifd0_count = 4
    exif_count = sum(x is not None for x in (exposure, fnumber, iso, focal))

    ifd0_off = 8
    ifd0_size = 2 + ifd0_count * 12 + 4
    exif_off = ifd0_off + ifd0_size
    exif_size = 2 + exif_count * 12 + 4
    data_off = exif_off + exif_size

    data = bytearray()
    offsets: dict[int, int] = {}

    def stash(blob: bytes) -> int:
        nonlocal data
        at = data_off + len(data)
        data.extend(blob)
        if len(data) % 2:
            data.append(0)
        return at

    def ascii_value(text: str) -> tuple[int, bytes]:
        raw = text.encode() + b"\0"
        if len(raw) <= 4:
            return 0, raw.ljust(4, b"\0")
        return stash(raw), raw

    def rational_value(pair: tuple[int, int]) -> tuple[int, bytes]:
        raw = struct.pack("<II", *pair)
        return stash(raw), raw

    def entry(tag: int, typ: int, value: int, raw: bytes, count: int | None = None) -> bytes:
        """One 12-byte IFD entry.

        `count` defaults to len(raw) but must be set explicitly for inline LONGs:
        a LONG *pointer* is one element, so declaring four would make the reader
        (correctly) treat it as an out-of-line array.
        """
        cnt = len(raw) if count is None else count
        return struct.pack("<HHI", tag, typ, cnt) + value.to_bytes(4, "little")

    # Resolve IFD0 string values first (they may spill into the data area).
    make_at, make_raw = ascii_value(make)
    model_at, model_raw = ascii_value(model)
    sw_at, sw_raw = ascii_value(software)

    entries0 = [
        entry(MAKE, _TYPE_ASCII, make_at, make_raw),
        entry(MODEL, _TYPE_ASCII, model_at, model_raw),
        entry(SOFTWARE, _TYPE_ASCII, sw_at, sw_raw),
        entry(EXIF_IFD_POINTER, _TYPE_LONG, exif_off, b"\0\0\0\0", count=1),
    ]

    entries1: list[bytes] = []
    if exposure is not None:
        at, raw = rational_value(exposure)
        entries1.append(entry(EXPOSURE_TIME, _TYPE_RATIONAL, at, raw))
    if fnumber is not None:
        at, raw = rational_value(fnumber)
        entries1.append(entry(FNUMBER, _TYPE_RATIONAL, at, raw))
    if iso is not None:
        entries1.append(entry(ISO, _TYPE_SHORT, iso, b"\0\0"))
    if focal is not None:
        at, raw = rational_value(focal)
        entries1.append(entry(FOCAL_LENGTH, _TYPE_RATIONAL, at, raw))

    out = bytearray(header)
    out += struct.pack("<H", len(entries0)) + b"".join(entries0) + struct.pack("<I", 0)
    assert len(out) == exif_off, "IFD0 size assumption broken"
    out += struct.pack("<H", len(entries1)) + b"".join(entries1) + struct.pack("<I", 0)
    assert len(out) == data_off, "Exif IFD size assumption broken"
    out += data
    return bytes(out)


#: Where the operator's real photographs live. Integration tests skip if absent.
CORPUS = Path("/Users/A200173944/Pictures/Nikon Transfer 2/FotoDump")