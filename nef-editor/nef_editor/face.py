"""Face detection for portrait auto-classification.

Uses Apple's Vision framework (VNDetectFaceRectanglesRequest) on the
1620x1080 color JPEG embedded in each NEF (SubIFD 2). No training needed —
Vision is a pre-trained face detector.

Verified on 326 NEFs: 13 photos with faces, 0 false positives, 0.04s/photo.

See ADR-0010.
"""

from __future__ import annotations

import struct
from pathlib import Path

from nef_editor.exif import _read_ifd


def extract_preview_jpeg(nef_path: Path) -> bytes | None:
    """Extract the 1620x1080 color JPEG preview from SubIFD 2 of a NEF.

    Returns None if the preview is missing or unreadable. Never raises.
    """
    try:
        data = nef_path.read_bytes()
        (first_ifd,) = struct.unpack_from('<I', data, 4)
        ifd0 = _read_ifd(data, first_ifd)
        if 0x014A not in ifd0:
            return None
        typ, cnt, raw = ifd0[0x014A]
        if cnt < 3:
            return None
        (off,) = struct.unpack_from('<I', raw, 2 * 4)
        sub = _read_ifd(data, off)

        def gv(e):
            if e is None:
                return None
            t, c, r = e
            if t == 3:
                return struct.unpack_from('<H', r, 0)[0]
            if t == 4:
                return struct.unpack_from('<I', r, 0)[0]
            return None

        jpeg_off = gv(sub.get(513))
        jpeg_len = gv(sub.get(514))
        if jpeg_off and jpeg_len and jpeg_off + jpeg_len <= len(data):
            return data[jpeg_off:jpeg_off + jpeg_len]
    except (struct.error, IndexError, ValueError, OSError):
        pass
    return None


def count_faces(nef_path: Path) -> int:
    """Count faces in a NEF's embedded preview. Returns 0 on any failure.

    Uses Apple Vision framework on the 1620x1080 color JPEG from SubIFD 2.
    Never raises — a failed detection is 0 faces, not an error.
    """
    jpeg_bytes = extract_preview_jpeg(nef_path)
    if not jpeg_bytes:
        return 0

    try:
        import tempfile
        import Quartz
        import Vision
        from Foundation import NSURL

        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp.write(jpeg_bytes)
            tmp_path = tmp.name

        src = NSURL.fileURLWithPath_(tmp_path)
        image_source = Quartz.CGImageSourceCreateWithURL(src, None)
        if not image_source:
            return 0
        cg_image = Quartz.CGImageSourceCreateImageAtIndex(image_source, 0, None)
        if not cg_image:
            return 0

        request = Vision.VNDetectFaceRectanglesRequest.alloc().init()
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_image, None)
        handler.performRequests_error_([request], None)
        results = request.results()
        return len(results) if results else 0
    except Exception:
        return 0
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except (NameError, OSError):
            pass
