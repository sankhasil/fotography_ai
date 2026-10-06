"""Preview luminance analysis for classification.

Computes mean luminance from the 1620x1080 color JPEG embedded in each NEF
(SubIFD 2). Used to distinguish bright high-ISO photos (daylight action) from
genuinely dark night photos.

Verified on 59 "night" photos (ISO >= 3200): 17 are bright daylight (lum > 0.44),
35 are genuinely dark (lum < 0.33). Threshold of 0.35 separates them cleanly.

See plan-verification-matrix.md for the measured evidence.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from nef_editor.face import extract_preview_jpeg


def mean_luminance(nef_path: Path) -> float:
    """Compute mean luminance (0.0-1.0) from the NEF's embedded preview JPEG.

    Returns -1.0 on any failure. Never raises.

    Uses Core Graphics to decode the JPEG and compute 0.299R + 0.587G + 0.114B
    averaged over a 100x67 downscale of the 1620x1080 preview.
    """
    jpeg_bytes = extract_preview_jpeg(nef_path)
    if not jpeg_bytes:
        return -1.0

    tmp = None
    try:
        import Quartz
        from Foundation import NSURL

        tmp = Path(tempfile.mktemp(suffix='.jpg'))
        tmp.write_bytes(jpeg_bytes)
        src = NSURL.fileURLWithPath_(str(tmp))
        image_source = Quartz.CGImageSourceCreateWithURL(src, None)
        if not image_source:
            return -1.0
        cg_image = Quartz.CGImageSourceCreateImageAtIndex(image_source, 0, None)
        if not cg_image:
            return -1.0

        w = Quartz.CGImageGetWidth(cg_image)
        h = Quartz.CGImageGetHeight(cg_image)
        scale = min(100.0 / w, 67.0 / h)
        sw, sh = max(1, int(w * scale)), max(1, int(h * scale))

        cs = Quartz.CGColorSpaceCreateDeviceRGB()
        bytes_per_row = sw * 4
        pixel_data = bytearray(sw * sh * 4)
        ctx = Quartz.CGBitmapContextCreate(
            pixel_data, sw, sh, 8, bytes_per_row, cs,
            Quartz.kCGImageAlphaPremultipliedLast
        )
        if not ctx:
            return -1.0
        Quartz.CGContextDrawImage(ctx, Quartz.CGRectMake(0, 0, sw, sh), cg_image)

        total = 0.0
        for i in range(0, len(pixel_data), 4):
            r, g, b = pixel_data[i], pixel_data[i + 1], pixel_data[i + 2]
            total += (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
        return total / (sw * sh)
    except Exception:
        return -1.0
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)
