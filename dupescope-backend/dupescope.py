#!/usr/bin/env python3
"""
DupeScope — Privacy-First Duplicate Photo Detector
====================================================
Runs fully offline. No data leaves your machine.
Requires: pip install Pillow imagehash

Usage:
  python dupescope.py /path/to/Photos
  python dupescope.py /path/to/Photos --mode exact
  python dupescope.py /path/to/Photos --mode perceptual --threshold 15
  python dupescope.py /path/to/Photos --mode both --output my_report.json
"""
import os
import hashlib
import json
import io
import requests
import argparse
import sys
import base64
import subprocess
import tempfile
from pathlib import Path
from collections import defaultdict
from datetime import datetime
try:
    from PIL import Image
    import imagehash
    PERCEPTUAL = True
except ImportError:
    PERCEPTUAL = False
    print("[!] Perceptual mode unavailable. Install dependencies:")
    print("    pip install Pillow imagehash\n")

# Supported image extensions
EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.avif', '.raw', '.cr2', '.nef'}

BANNER = r"""
  ____                  ____
 |  _ \ _   _ _ __  ___/ ___|  ___ ___  _ __   ___
 | | | | | | | '_ \/ _ \___ \ / __/ _ \| '_ \ / _ \
 | |_| | |_| | |_) |  __/___) | (_| (_) | |_) |  __/
 |____/ \__,_| .__/ \___|____/ \___\___/| .__/ \___|
             |_|                        |_|
 Privacy-First · Fully Offline · No Data Leaves Your Machine
"""

# ── Utilities ────────────────────────────────────────────────────────────────

def open_raw_with_sips(path: Path, max_size: int = 1024) -> Image.Image | None:
    """
    Fallback RAW decoder using macOS built-in sips.
    Supports all Nikon NEF variants including newest bodies.
    """
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name

        result = subprocess.run(
            ["sips", "-s", "format", "jpeg",
             "-Z", str(max_size),          # resize longest edge to max_size
             str(path),
             "--out", tmp_path],
            capture_output=True,
            timeout=30
        )

        if result.returncode != 0:
            print(f"\n[ERROR] sips failed for {path.name}: {result.stderr.decode()}")
            return None

        img = Image.open(tmp_path).convert("RGB")
        img.load()                          # force load before temp file is deleted
        Path(tmp_path).unlink(missing_ok=True)
        return img

    except Exception as e:
        print(f"\n[ERROR] sips fallback failed for {path.name}: {e}")
        return None


def open_image(path: Path, max_size: int = 1024) -> Image.Image | None:
    """
    Opens any image — tries rawpy first, falls back to sips for RAW,
    then standard Pillow for normal formats.
    """
    ext = path.suffix.lower()

    if ext in EXTS:
        # Try rawpy first (faster when it works)
        try:
            import rawpy
            with rawpy.imread(str(path)) as raw:
                rgb = raw.postprocess(
                    use_camera_wb=True,
                    half_size=True,
                    no_auto_bright=True,
                    output_bps=8,
                )
            img = Image.fromarray(rgb)
            img.thumbnail((max_size, max_size), Image.LANCZOS)
            return img
        except Exception as rawpy_err:
            print(f"\n[INFO] rawpy failed for {path.name} ({rawpy_err}), trying sips…")
            return open_raw_with_sips(path, max_size)   # fallback
    else:
        try:
            img = Image.open(path).convert("RGB")
            img.thumbnail((max_size, max_size), Image.LANCZOS)
            return img
        except Exception as e:
            print(f"\n[ERROR] Cannot open {path.name}: {e}")
            return None

def sha256(path: Path) -> str:
    """Compute SHA-256 hash of a file in 64 KB chunks."""
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def fmt_bytes(n: int) -> str:
    """Human-readable file size."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def progress(label: str, current: int, total: int, name: str = ''):
    """Inline progress indicator."""
    bar_len = 20
    filled = int(bar_len * current / max(total, 1))
    bar = '█' * filled + '░' * (bar_len - filled)
    pct = int(100 * current / max(total, 1))
    short_name = name[:30].ljust(30) if name else ''
    sys.stdout.write(f"\r  [{bar}] {pct:3d}%  {label}  {short_name}")
    sys.stdout.flush()


# ── Scanning ─────────────────────────────────────────────────────────────────

def scan_images(folder: Path, recursive: bool = True) -> list:
    """Walk folder and collect all image paths."""
    images = []
    if recursive:
        for root, _, files in os.walk(folder):
            for f in files:
                if Path(f).suffix.lower() in EXTS:
                    images.append(Path(root) / f)
    else:
        for f in os.listdir(folder):
            if Path(f).suffix.lower() in EXTS:
                images.append(folder / f)
    return sorted(images)


# ── Exact duplicate detection ─────────────────────────────────────────────────

def find_exact_dupes(images: list) -> dict:
    """
    Group images by SHA-256 hash.
    Returns dict: {hash_str: [Path, Path, ...]}  for groups with 2+ files.
    """
    hmap = defaultdict(list)
    skipped = []

    for i, p in enumerate(images):
        progress('SHA-256', i + 1, len(images), p.name)
        try:
            hmap[sha256(p)].append(p)
        except (IOError, PermissionError) as e:
            skipped.append((p, str(e)))

    print()  # newline after progress bar

    if skipped:
        print(f"  [!] Skipped {len(skipped)} unreadable file(s):")
        for p, err in skipped[:5]:
            print(f"      {p.name}: {err}")

    return {h: ps for h, ps in hmap.items() if len(ps) > 1}


# ── Perceptual duplicate detection ───────────────────────────────────────────

def find_perceptual_dupes(images: list, threshold: int = 10) -> list:
    """
    Compute perceptual hash (pHash) for each image.
    Returns list of groups: [[Path, Path, ...], ...]
    
    Threshold guide:
      0   — mathematically identical
      5   — near-identical (minor compression differences)
      10  — near-duplicate (slight edits, EXIF strip, minor crop)
      20  — visually similar (colour grade, moderate crop)
      30+ — loose similarity (same scene, different exposure)
    """
    if not PERCEPTUAL:
        print("  [!] Skipping: Pillow/imagehash not installed.")
        return []

    ph_list = []
    skipped = []

    for i, p in enumerate(images):
        progress('pHash', i + 1, len(images), p.name)
        try:
            img = Image.open(p).convert('RGB')
            ph_list.append((p, imagehash.phash(img)))
        except Exception as e:
            skipped.append((p, str(e)))

    print()

    if skipped:
        print(f"  [!] Skipped {len(skipped)} unreadable image(s).")

    # Greedy clustering: for each un-grouped image, find all neighbours
    groups = []
    seen = set()

    for i, (pa, ha) in enumerate(ph_list):
        if i in seen:
            continue
        grp = [pa]
        for j, (pb, hb) in enumerate(ph_list):
            if i == j or j in seen:
                continue
            if ha - hb <= threshold:
                grp.append(pb)
                seen.add(j)
        if len(grp) > 1:
            seen.add(i)
            groups.append(grp)

    return groups


# ─────────────────────────────────────────────────────────────
# AI CULLING (LLAVA)
# ─────────────────────────────────────────────────────────────

VISION_PROMPT = """
You are a professional photo editor.

Return ONLY JSON:

{
  "sharpness": 0-10,
  "exposure": 0-10,
  "subject_presence": 0-10,
  "composition": 0-10,
  "emotion": 0-10,
  "keep": true/false,
  "reason": "short reason"
}

Rules:
- keep ONLY if sharpness >= 8 AND exposure >= 7 AND subject_presence >= 7
"""


def encode_image(path: Path, max_size: int = 1024) -> str:
    """Encode image to base64 JPEG string for LLaVA."""
    img = open_image(path, max_size)
    if img is None:
        return ""
    try:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        data = buf.getvalue()
        if len(data) == 0:
            print(f"\n[WARN] Encoded 0 bytes for {path.name}")
            return ""
        return base64.b64encode(data).decode()
    except Exception as e:
        print(f"\n[ERROR] JPEG encode failed for {path.name}: {e}")
        return ""


def evaluate_image(path: Path):
    encoded = encode_image(path)
    if not encoded:
        print(f"\n[SKIP] {path.name} — no image data")
        return None

    payload = {
        "model": "llava",
        "messages": [
            {"role": "system", "content": VISION_PROMPT},
            {
                "role": "user",
                "content": "Evaluate this image. Reply with ONLY the JSON object, no other text.",
                "images": [encoded]
            }
        ],
        "stream": False
    }

    try:
        result = requests.post(
            "http://localhost:11434/api/chat",
            json=payload,
            timeout=120
        )
        result.raise_for_status()

        raw_text = result.json()["message"]["content"]

        # Debug — print what LLaVA actually returned
        print(f"\n[DEBUG] Raw LLaVA response for {path.name}:")
        print(repr(raw_text[:300]))

        if not raw_text or not raw_text.strip():
            print(f"\n[WARN] LLaVA returned empty response for {path.name}")
            return None

        # Strip markdown code fences if present
        cleaned = raw_text.strip()
        if "```" in cleaned:
            # Extract content between ``` blocks
            parts = cleaned.split("```")
            for part in parts:
                part = part.strip().removeprefix("json").strip()
                if part.startswith("{"):
                    cleaned = part
                    break

        # Find the JSON object even if there's surrounding text
        start = cleaned.find("{")
        end   = cleaned.rfind("}") + 1
        if start == -1 or end == 0:
            print(f"\n[WARN] No JSON object found in response for {path.name}")
            print(f"       Full response: {repr(raw_text[:200])}")
            return None

        json_str = cleaned[start:end]
        return json.loads(json_str)

    except requests.HTTPError as e:
        print(f"\n[ERROR] HTTP {e.response.status_code} for {path.name}: {e.response.text[:200]}")
        return None
    except json.JSONDecodeError as e:
        print(f"\n[ERROR] JSON parse failed for {path.name}: {e}")
        print(f"        Tried to parse: {repr(json_str if 'json_str' in dir() else 'N/A')}")
        return None
    except Exception as e:
        print(f"\n[ERROR] evaluate_image failed for {path.name}: {e}")
        return None


def ai_cull(images):
    results = []

    for i, img in enumerate(images):
        print(f"\rAI scoring {i+1}/{len(images)}: {img.name[:40]}", end="")
        r = evaluate_image(img)
        if r and isinstance(r, dict):   # guard: must be a parsed dict
            r["path"] = str(img)
            results.append(r)

    print()

    results.sort(key=lambda x: (
        x["sharpness"] +
        x["exposure"] +
        x["subject_presence"] +
        x["composition"] +
        x["emotion"]
    ), reverse=True)

    return results



# ── Report building ──────────────────────────────────────────────────────────

def file_info(p: Path) -> dict:
    """Metadata dict for a single file."""
    try:
        s = p.stat()
        return {
            "path": str(p),
            "name": p.name,
            "size_bytes": s.st_size,
            "size_human": fmt_bytes(s.st_size),
            "modified": datetime.fromtimestamp(s.st_mtime).isoformat(),
        }
    except Exception:
        return {"path": str(p), "name": p.name, "size_bytes": 0,
                "size_human": "?", "modified": "?"}


def build_report(folder, images, exact, perceptual, args, keep, delete ) -> dict:
    exact_groups = [
        {"hash_sha256": h, "files": [file_info(p) for p in ps]}
        for h, ps in exact.items()
    ]
    similar_groups = [
        {"files": [file_info(p) for p in grp]}
        for grp in perceptual
    ]
    wasted_exact = sum(
        sum(f["size_bytes"] for f in g["files"][1:])
        for g in exact_groups
    )
    return {
        "dupescope_version": "1.0",
        "generated_at": datetime.now().isoformat(),
        "scanned_folder": str(folder),
        "total_images_scanned": len(images),
        "settings": {
            "mode": args.mode,
            "threshold": args.threshold,
            "recursive": not args.no_recursive,
        },
        "ai_keep": keep,
        "ai_delete": delete,
        "summary": {
            "exact_duplicate_groups": len(exact_groups),
            "exact_duplicate_files": sum(len(g["files"]) for g in exact_groups),
            "reclaimable_bytes_exact": wasted_exact,
            "reclaimable_human": fmt_bytes(wasted_exact),
            "similar_groups": len(similar_groups),
            "similar_files": sum(len(g["files"]) for g in similar_groups),
        },
        "exact_groups": exact_groups,
        "similar_groups": similar_groups,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        prog='dupescope',
        description='DupeScope — Privacy-First Offline Duplicate Photo Detector',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python dupescope.py ~/Pictures
  python dupescope.py ~/Pictures --mode perceptual --threshold 15
  python dupescope.py ~/Pictures --mode both --output report.json --no-recursive
        """
    )
    ap.add_argument('folder',
                    help='Path to the folder to scan')
    ap.add_argument('--mode', choices=['exact', 'perceptual', 'both'],
                    default='both',
                    help='Detection mode (default: both)')
    ap.add_argument('--threshold', type=int, default=10,
                    help='pHash distance threshold 0-64 (default: 10)')
    ap.add_argument('--no-recursive', action='store_true',
                    help='Only scan the top-level folder, no subfolders')
    ap.add_argument('--output', default='dupescope_report.json',
                    help='Output JSON report path (default: dupescope_report.json)')
    ap.add_argument('--quiet', action='store_true',
                    help='Suppress progress output')
    args = ap.parse_args()

    if not args.quiet:
        print(BANNER)

    folder = Path(args.folder).expanduser().resolve()
    if not folder.exists():
        print(f"[error] Folder not found: {folder}")
        sys.exit(1)
    if not folder.is_dir():
        print(f"[error] Not a directory: {folder}")
        sys.exit(1)

    print(f"  Scanning: {folder}")
    images = scan_images(folder, recursive=not args.no_recursive)
    print(f"  Found {len(images)} image file(s)\n")

    if not images:
        print("[!] No images found. Check the folder path and extensions.")
        sys.exit(0)

    exact, perceptual = {}, []

    # Step 1 — Exact
    if args.mode in ('exact', 'both'):
        print("[1/3] Exact duplicate detection (SHA-256 hash)")
        exact = find_exact_dupes(images)
        print(f"      → {len(exact)} group(s) found\n")

    # Step 2 — Perceptual
    if args.mode in ('perceptual', 'both'):
        print(f"[2/3] Perceptual duplicate detection (pHash, threshold={args.threshold})")
        perceptual = find_perceptual_dupes(images, threshold=args.threshold)
        print(f"      → {len(perceptual)} group(s) found\n")

    # Step 3 - AI Culling
    print(f"[3/3] Running AI Culling (llava)")
    ai_results  = ai_cull(images)
    keep = [r for r in ai_results if r.get("keep") is True]
    delete = [r for r in ai_results if r.get("keep") is not True]
    print(f"      → {len(keep)} good image(s) found\n")
    # Build & save report
    report = build_report(folder, images, exact, perceptual, args, keep, delete)
    out_path = Path(args.output)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Summary
    s = report['summary']
    sep = '─' * 50
    print(sep)
    print(f"  Exact duplicate groups : {s['exact_duplicate_groups']:>6}")
    print(f"  Exact duplicate files  : {s['exact_duplicate_files']:>6}")
    print(f"  Reclaimable space      : {s['reclaimable_human']:>6}")
    print(f"  Similar groups         : {s['similar_groups']:>6}")
    print(f"  Similar files          : {s['similar_files']:>6}")
    print(f"  AI keep                : {len(report['ai_keep']):>6}")
    print(f"  AI delete              : {len(report['ai_delete']):>6}")
    print(sep)
    print(f"\n  Report saved → {out_path.resolve()}\n")


if __name__ == '__main__':
    main()