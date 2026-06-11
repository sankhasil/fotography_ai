#!/usr/bin/env python3
"""
DupeScope — Privacy-First Duplicate Photo Detector (v2)
========================================================
Improvements over v1:
  - Objective quality metrics via OpenCV (sharpness, exposure, noise, faces)
  - Multi-hash perceptual detection (pHash + dHash + wHash)
  - SSIM confirmation for near-duplicates
  - LLaVA with temperature=0 + seed for deterministic results
  - Pre-filter: skip AI entirely if local metrics already decide
  - Weighted hybrid scoring: local metrics 70%, AI 30%
  - Burst detection: groups images shot within N seconds of each other

Requires:
  pip install Pillow imagehash opencv-python scikit-image numpy requests
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
import shutil
from pathlib import Path
from collections import defaultdict
from datetime import datetime
import multiprocessing as mp
from functools import lru_cache
import numpy as np

try:
    from PIL import Image
    import imagehash
    PERCEPTUAL = True
except ImportError:
    PERCEPTUAL = False
    print("[!] pip install Pillow imagehash\n")

try:
    import cv2
    OPENCV = True
except ImportError:
    OPENCV = False
    print("[!] pip install opencv-python  (needed for quality metrics)\n")

try:
    from skimage.metrics import structural_similarity as ssim
    SKIMAGE = True
except ImportError:
    SKIMAGE = False
    print("[!] pip install scikit-image  (needed for SSIM confirmation)\n")

# ── Supported extensions ──────────────────────────────────────────────────────
EXTS     = {'.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.tif','.heic','.avif'}
RAW_EXTS = {'.dng','.arw','.raw','.cr2','.nef','.orf','.raf','.rw2'}
ALL_EXTS = EXTS | RAW_EXTS

# ── Ollama URL ────────────────────────────────────────────────────────────────
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# ── Quality thresholds (tune for your library) ────────────────────────────────
BLUR_THRESHOLD        = 80.0   # Laplacian variance — below = blurry
OVEREXPOSE_THRESHOLD  = 245    # mean brightness above = overexposed
UNDEREXPOSE_THRESHOLD = 30     # mean brightness below = underexposed
NOISE_THRESHOLD       = 12.0   # noise std above = noisy

# ─── Image cache — decode each file once, reuse across comparisons ────────────
_image_cache: dict = {}

BANNER = r"""
  ____                  ____
 |  _ \ _   _ _ __  ___/ ___|  ___ ___  _ __   ___
 | | | | | | | '_ \/ _ \___ \ / __/ _ \| '_ \ / _ \
 | |_| | |_| | |_) |  __/___) | (_| (_) | |_) |  __/
 |____/ \__,_| .__/ \___|____/ \___\___/| .__/ \___|
             |_|                        |_|
 Privacy-First · Fully Offline · v2 — Objective + AI Hybrid
"""

# ─────────────────────────────────────────────────────────────────────────────
# IMAGE OPENING
# ─────────────────────────────────────────────────────────────────────────────

def open_raw_with_sips(path: Path, max_size: int = 1024):
    if not shutil.which("sips"):
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name
        result = subprocess.run(
            ["sips", "-s", "format", "jpeg", "-Z", str(max_size), str(path), "--out", tmp_path],
            capture_output=True, timeout=30
        )
        if result.returncode != 0:
            return None
        img = Image.open(tmp_path).convert("RGB")
        img.load()
        Path(tmp_path).unlink(missing_ok=True)
        return img
    except Exception:
        return None


def open_image(path: Path, max_size: int = 1024):
    ext = path.suffix.lower()
    if ext in RAW_EXTS:
        try:
            import rawpy
            with rawpy.imread(str(path)) as raw:
                rgb = raw.postprocess(use_camera_wb=True, half_size=True,
                                      no_auto_bright=True, output_bps=8)
            img = Image.fromarray(rgb)
            img.thumbnail((max_size, max_size), Image.LANCZOS)
            return img
        except Exception:
            return open_raw_with_sips(path, max_size)
    else:
        try:
            img = Image.open(path).convert("RGB")
            img.thumbnail((max_size, max_size), Image.LANCZOS)
            return img
        except Exception as e:
            print(f"\n[ERROR] Cannot open {path.name}: {e}")
            return None


# ─────────────────────────────────────────────────────────────────────────────
# OBJECTIVE QUALITY METRICS  (OpenCV — deterministic, no AI)
# ─────────────────────────────────────────────────────────────────────────────

def compute_local_quality(path: Path) -> dict:
    """
    Compute objective image quality using OpenCV.
    Fully deterministic — same image always gives same result.

    Sharpness:  Laplacian variance (Pech-Pacheco 2000)
                Sharp > 500, Acceptable 80-500, Blurry < 80
    Exposure:   Histogram mean + clipping percentage
    Noise:      Median filter residual standard deviation
    Subject:    Edge density in frame centre + Haar face detection
    """
    if not OPENCV:
        return _fallback_quality(path)

    try:
        img_pil = open_image(path, max_size=800)
        if img_pil is None:
            return {}

        img_np  = np.array(img_pil)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        gray    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # ── Sharpness: Laplacian variance ─────────────────────────────────
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if   lap_var >= 500: sharpness = 10.0
        elif lap_var >= 200: sharpness = 7.0 + (lap_var - 200) / 300 * 3
        elif lap_var >= BLUR_THRESHOLD:
            sharpness = 4.0 + (lap_var - BLUR_THRESHOLD) / (200 - BLUR_THRESHOLD) * 3
        else:
            sharpness = max(0.0, lap_var / BLUR_THRESHOLD * 4)

        # ── Exposure: histogram analysis ──────────────────────────────────
        mean_val    = float(np.mean(gray))
        blown_pct   = float(np.sum(gray > 250) / gray.size * 100)
        crushed_pct = float(np.sum(gray < 5)   / gray.size * 100)

        if   blown_pct > 15 or crushed_pct > 20: exposure = 2.0
        elif blown_pct > 5  or crushed_pct > 10: exposure = 5.0
        elif mean_val > OVEREXPOSE_THRESHOLD:      exposure = 4.0
        elif mean_val < UNDEREXPOSE_THRESHOLD:     exposure = 3.0
        elif 80 <= mean_val <= 180:                exposure = 10.0
        else:                                      exposure = 7.0

        # ── Noise: median filter residual ─────────────────────────────────
        median     = cv2.medianBlur(gray, 5)
        noise_raw  = float(np.std(gray.astype(np.float32) - median.astype(np.float32)))
        if   noise_raw < 3:               noise_score = 10.0
        elif noise_raw < NOISE_THRESHOLD: noise_score = 10.0 - (noise_raw / NOISE_THRESHOLD * 4)
        else:                             noise_score = max(0.0, 6.0 - (noise_raw - NOISE_THRESHOLD))

        # ── Subject: edge density + face detection ─────────────────────────
        edges        = cv2.Canny(gray, 50, 150)
        h, w         = edges.shape
        centre       = edges[h//4:3*h//4, w//4:3*w//4]
        edge_density = float(np.mean(centre > 0))

        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        faces      = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(30, 30))
        face_count = len(faces)

        if   face_count > 0:     subject = min(10.0, 6.0 + face_count * 1.5)
        elif edge_density > 0.15: subject = 7.0
        elif edge_density > 0.05: subject = 5.0
        else:                     subject = 2.0

        # ── Weighted overall ───────────────────────────────────────────────
        overall = (sharpness * 0.40 + exposure * 0.30 +
                   noise_score * 0.15 + subject * 0.15)

        is_blurry   = lap_var < BLUR_THRESHOLD
        is_bad_expo = blown_pct > 20 or crushed_pct > 25

        keep_local = (
            not is_blurry and not is_bad_expo and
            sharpness >= 5.0 and exposure >= 4.0 and overall >= 5.5
        )

        return {
            "sharpness":        round(sharpness, 1),
            "exposure":         round(exposure, 1),
            "noise":            round(noise_score, 1),
            "subject":          round(subject, 1),
            "overall_local":    round(overall, 1),
            "keep_local":       keep_local,
            "_laplacian_var":   round(lap_var, 1),
            "_mean_brightness": round(mean_val, 1),
            "_blown_pct":       round(blown_pct, 2),
            "_noise_raw":       round(noise_raw, 2),
            "_face_count":      face_count,
            "_is_blurry":       is_blurry,
        }

    except Exception as e:
        print(f"\n[WARN] Quality metric failed for {path.name}: {e}")
        return _fallback_quality(path)


def _fallback_quality(path: Path) -> dict:
    return {
        "sharpness": 5.0, "exposure": 5.0, "noise": 5.0,
        "subject": 5.0, "overall_local": 5.0, "keep_local": True,
        "_laplacian_var": -1, "_mean_brightness": -1,
        "_blown_pct": -1, "_noise_raw": -1,
        "_face_count": -1, "_is_blurry": False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SSIM CONFIRMATION
# ─────────────────────────────────────────────────────────────────────────────

def ssim_similarity(path_a: Path, path_b: Path, size: int = 256) -> float:
    """
    Structural Similarity Index between two images.
    1.0 = identical, > 0.85 = near-duplicate.
    Used to confirm pHash candidates and remove false positives.
    """
    if not SKIMAGE:
        return 1.0
    try:
        img_a = open_image(path_a, size)
        img_b = open_image(path_b, size)
        if img_a is None or img_b is None:
            return 0.0
        img_a = img_a.resize((size, size), Image.LANCZOS).convert("L")
        img_b = img_b.resize((size, size), Image.LANCZOS).convert("L")
        score, _ = ssim(np.array(img_a, dtype=np.float32),
                        np.array(img_b, dtype=np.float32),
                        full=True, data_range=255)
        return float(score)
    except Exception:
        return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# HASHING
# ─────────────────────────────────────────────────────────────────────────────

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def compute_phashes(path: Path):
    """
    Three complementary hash types — using all three cuts false positives
    roughly in half compared to pHash alone.

    pHash  frequency domain — robust to scaling/JPEG compression
    dHash  gradient hash    — good for near-identical images, very fast
    wHash  wavelet hash     — best for heavily edited/filtered images
    """
    if not PERCEPTUAL:
        return None
    try:
        img = open_image(path, 512)
        if img is None:
            return None
        return {
            "phash": str(imagehash.phash(img)),
            "dhash": str(imagehash.dhash(img)),
            "whash": str(imagehash.whash(img)),
        }
    except Exception:
        return None


def hash_distance(h1: dict, h2: dict) -> float:
    """Average hamming distance across all three hashes. Lower = more similar."""
    try:
        d_p = imagehash.hex_to_hash(h1["phash"]) - imagehash.hex_to_hash(h2["phash"])
        d_d = imagehash.hex_to_hash(h1["dhash"]) - imagehash.hex_to_hash(h2["dhash"])
        d_w = imagehash.hex_to_hash(h1["whash"]) - imagehash.hex_to_hash(h2["whash"])
        return (d_p + d_d + d_w) / 3.0
    except Exception:
        return 999.0


# ─────────────────────────────────────────────────────────────────────────────
# SCANNING
# ─────────────────────────────────────────────────────────────────────────────

def scan_images(folder: Path, recursive: bool = True) -> list:
    images = []
    if recursive:
        for root, _, files in os.walk(folder):
            for f in files:
                if Path(f).suffix.lower() in ALL_EXTS:
                    images.append(Path(root) / f)
    else:
        for f in os.listdir(folder):
            if Path(f).suffix.lower() in ALL_EXTS:
                images.append(folder / f)
    return sorted(images)


# ─────────────────────────────────────────────────────────────────────────────
# EXACT DUPLICATES
# ─────────────────────────────────────────────────────────────────────────────

def find_exact_dupes(images: list) -> dict:
    hmap    = defaultdict(list)
    skipped = []
    for i, p in enumerate(images):
        _progress("SHA-256", i + 1, len(images), p.name)
        try:
            hmap[sha256(p)].append(p)
        except (IOError, PermissionError) as e:
            skipped.append((p, str(e)))
    print()
    if skipped:
        print(f"  [!] Skipped {len(skipped)} file(s)")
    return {h: ps for h, ps in hmap.items() if len(ps) > 1}


# ─────────────────────────────────────────────────────────────────────────────
# PERCEPTUAL DUPLICATES — multi-hash + SSIM confirmation
# ─────────────────────────────────────────────────────────────────────────────
def _get_cached_image(path: Path, size: int = 256):
    """
    Cache decoded images in memory.
    Without this, every SSIM call re-opens and re-decodes the file.
    For 343 NEF files at 25MB each, that's gigabytes of redundant I/O.
    """
    key = (str(path), size)
    if key not in _image_cache:
        img = open_image(path, size)
        if img is not None:
            img = img.resize((size, size), Image.LANCZOS).convert("L")
            _image_cache[key] = np.array(img, dtype=np.float32)
        else:
            _image_cache[key] = None
    return _image_cache[key]


def ssim_similarity(path_a: Path, path_b: Path, size: int = 256) -> float:
    """SSIM with image cache — each file decoded only once."""
    if not SKIMAGE:
        return 1.0
    try:
        arr_a = _get_cached_image(path_a, size)
        arr_b = _get_cached_image(path_b, size)
        if arr_a is None or arr_b is None:
            return 0.0
        score, _ = ssim(arr_a, arr_b, full=True, data_range=255)
        return float(score)
    except Exception:
        return 0.0


def find_perceptual_dupes(images: list, threshold: int = 10,
                          ssim_confirm: bool = True) -> list:
    if not PERCEPTUAL:
        return []

    # ── Step 1: Compute all hashes ────────────────────────────────────────────
    print("  Computing multi-hashes (pHash + dHash + wHash)...")
    hash_data = []
    for i, p in enumerate(images):
        _progress("multi-hash", i + 1, len(images), p.name)
        h = compute_phashes(p)
        if h:
            hash_data.append((p, h))
    print()

    n = len(hash_data)
    total_pairs = n * (n - 1) // 2
    print(f"  Clustering {n} images ({total_pairs:,} pairs to compare)...")

    # ── Step 2: Find all candidate pairs (hash distance only, O(n²)) ──────────
    # Do this first without SSIM — it's fast (just integer arithmetic)
    candidates = []
    checked    = 0

    for i in range(n):
        for j in range(i + 1, n):
            checked += 1
            if checked % 5000 == 0 or checked == total_pairs:
                pct  = int(100 * checked / total_pairs)
                hits = len(candidates)
                sys.stdout.write(
                    f"\r  [hash-cluster] {pct:3d}%  "
                    f"{checked:,}/{total_pairs:,} pairs  "
                    f"{hits} candidates found"
                )
                sys.stdout.flush()
            if hash_distance(hash_data[i][1], hash_data[j][1]) <= threshold:
                candidates.append((i, j))
    print()

    if not candidates:
        print("  → No near-duplicate candidates found.")
        _image_cache.clear()
        return []

    print(f"  → {len(candidates)} candidate pairs — running SSIM confirmation...")

    # ── Step 3: SSIM confirmation on candidates only ──────────────────────────
    # Only open images for pairs that actually passed hash distance.
    # This is far fewer than all n² pairs.
    confirmed_pairs = set()
    for idx, (i, j) in enumerate(candidates):
        if idx % 20 == 0 or idx == len(candidates) - 1:
            pct = int(100 * (idx + 1) / len(candidates))
            sys.stdout.write(
                f"\r  [SSIM] {pct:3d}%  {idx+1}/{len(candidates)} pairs  "
                f"{len(confirmed_pairs)} confirmed"
            )
            sys.stdout.flush()

        pa, pb = hash_data[i][0], hash_data[j][0]
        if ssim_confirm and SKIMAGE:
            if ssim_similarity(pa, pb) >= 0.80:
                confirmed_pairs.add((i, j))
        else:
            confirmed_pairs.add((i, j))

    print()
    _image_cache.clear()   # free memory

    # ── Step 4: Build groups from confirmed pairs ─────────────────────────────
    groups = []
    seen   = set()
    for i, (pa, _) in enumerate(hash_data):
        if i in seen:
            continue
        grp = [pa]
        for j, (pb, _) in enumerate(hash_data):
            if i == j or j in seen:
                continue
            if (i, j) in confirmed_pairs or (j, i) in confirmed_pairs:
                grp.append(pb)
                seen.add(j)
        if len(grp) > 1:
            seen.add(i)
            groups.append(grp)

    return groups

# ─────────────────────────────────────────────────────────────────────────────
# BURST DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def find_burst_groups(images: list, max_gap_seconds: int = 3) -> list:
    """Group images taken within max_gap_seconds of each other (by mtime)."""
    timed = sorted(
        [(p, p.stat().st_mtime) for p in images if p.exists()],
        key=lambda x: x[1]
    )
    if not timed:
        return []

    groups  = []
    current = [timed[0][0]]
    for i in range(1, len(timed)):
        if timed[i][1] - timed[i-1][1] <= max_gap_seconds:
            current.append(timed[i][0])
        else:
            if len(current) > 1:
                groups.append(current)
            current = [timed[i][0]]
    if len(current) > 1:
        groups.append(current)
    return groups


# ─────────────────────────────────────────────────────────────────────────────
# LOCAL QUALITY FILTER — gates AI calls
# ─────────────────────────────────────────────────────────────────────────────

def local_quality_filter(images: list) -> tuple:
    """
    Run deterministic OpenCV metrics on all images first.
    Splits into three buckets:

      clear_keep   — objectively great (skip AI, mark keep)
      clear_delete — objectively bad   (skip AI, mark delete)
      needs_ai     — borderline        (send to LLaVA)

    This means LLaVA only sees borderline images, not obviously
    blurry or overexposed ones. Reduces AI inconsistency drastically.
    """
    clear_keep   = []
    clear_delete = []
    needs_ai     = []

    for i, p in enumerate(images):
        _progress("local-QA", i + 1, len(images), p.name)
        q = compute_local_quality(p)
        q["path"] = str(p)
        q["name"] = p.name

        if q.get("_is_blurry") or q.get("overall_local", 5) < 3.0:
            q["keep"]   = False
            q["source"] = "local_reject"
            clear_delete.append(q)
        elif q.get("overall_local", 0) >= 8.5:
            q["keep"]   = True
            q["source"] = "local_keep"
            clear_keep.append(q)
        else:
            q["source"] = "ai_review"
            needs_ai.append(q)

    print()
    return clear_keep, clear_delete, needs_ai


# ─────────────────────────────────────────────────────────────────────────────
# AI CULLING — LLaVA (deterministic settings)
# ─────────────────────────────────────────────────────────────────────────────

VISION_PROMPT = """You are a professional photo editor reviewing images for a photo library.

Return ONLY a JSON object — no other text, no markdown.

{
  "composition": <0-10>,
  "emotion_impact": <0-10>,
  "subject_clarity": <0-10>,
  "aesthetic": <0-10>,
  "keep": <true or false>,
  "reason": "<one sentence>"
}

Keep true ONLY if composition >= 6 AND aesthetic >= 6 AND subject_clarity >= 6.
Note: sharpness and exposure are already checked. Focus on artistic quality only.
"""


def encode_image(path: Path, max_size: int = 768) -> str:
    img = open_image(path, max_size)
    if img is None:
        return ""
    try:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=82)
        data = buf.getvalue()
        return base64.b64encode(data).decode() if data else ""
    except Exception:
        return ""


def evaluate_image_ai(path: Path, local_metrics: dict) -> dict:
    """
    Call LLaVA with temperature=0 and seed=42.
    These two settings make LLaVA deterministic — same image,
    same result every time. Without them, results vary per run.
    """
    encoded = encode_image(path)
    if not encoded:
        return {}

    context = (
        f"Local analysis: sharpness={local_metrics.get('sharpness','?')}/10, "
        f"exposure={local_metrics.get('exposure','?')}/10. "
        f"Focus only on artistic/compositional quality."
    )

    payload = {
        "model": "llava",
        "options": {
            "temperature": 0,    # KEY: makes output deterministic
            "seed": 42,          # KEY: extra determinism guarantee
            "num_predict": 200,
        },
        "messages": [
            {"role": "system", "content": VISION_PROMPT},
            {
                "role": "user",
                "content": f"{context}\n\nReturn ONLY the JSON object.",
                "images": [encoded],
            },
        ],
        "stream": False,
    }

    try:
        res = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=120)
        res.raise_for_status()
        raw = res.json()["message"]["content"].strip()

        cleaned = raw
        if "```" in cleaned:
            for part in cleaned.split("```"):
                part = part.strip().removeprefix("json").strip()
                if part.startswith("{"):
                    cleaned = part
                    break

        start = cleaned.find("{")
        end   = cleaned.rfind("}") + 1
        if start == -1 or end == 0:
            return {}
        return json.loads(cleaned[start:end])

    except Exception as e:
        print(f"\n[WARN] AI eval failed for {path.name}: {e}")
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# HYBRID SCORING — 70% local, 30% AI
# ─────────────────────────────────────────────────────────────────────────────

def compute_hybrid_score(local: dict, ai: dict) -> dict:
    """
    Why 70/30?
      Local metrics (sharpness, exposure) are objective and measurable.
      AI scores (composition, emotion) are subjective but valuable.
      Weighting local higher prevents AI inconsistency from dominating.

    Hard rules (override score):
      - Blurry image → always delete, regardless of AI
      - Both agree keep → keep
      - Both agree delete → delete
      - Disagree → use hybrid score threshold (5.5)
    """
    local_score = local.get("overall_local", 5.0)
    ai_score    = sum([
        ai.get("composition",    5),
        ai.get("emotion_impact", 5),
        ai.get("subject_clarity",5),
        ai.get("aesthetic",      5),
    ]) / 4 if ai else 5.0

    hybrid     = local_score * 0.70 + ai_score * 0.30
    local_keep = local.get("keep_local", True)
    ai_keep    = ai.get("keep", True) if ai else True

    if local.get("_is_blurry"):
        final_keep = False
    elif not local_keep and not ai_keep:
        final_keep = False
    elif local_keep and ai_keep:
        final_keep = True
    else:
        final_keep = hybrid >= 5.5

    return {
        "local_score":  round(local_score, 1),
        "ai_score":     round(ai_score, 1),
        "hybrid_score": round(hybrid, 1),
        "keep":         final_keep,
        "sharpness":    local.get("sharpness"),
        "exposure":     local.get("exposure"),
        "noise":        local.get("noise"),
        "subject":      local.get("subject"),
        "composition":  ai.get("composition"),
        "emotion":      ai.get("emotion_impact"),
        "aesthetic":    ai.get("aesthetic"),
        "reason":       ai.get("reason", local.get("source", "")),
        "path":         local.get("path"),
        "name":         local.get("name"),
        "_laplacian":   local.get("_laplacian_var"),
        "_faces":       local.get("_face_count"),
        "source":       local.get("source", "hybrid"),
    }


def ai_cull(images: list, run_ai: bool = True) -> tuple:
    """
    Full pipeline:
      1. Local quality metrics on all images (deterministic, fast)
      2. Clear rejects/keeps bypass AI entirely
      3. Borderline images go to LLaVA with temperature=0
      4. Hybrid score makes final decision
    """
    print("\n  Phase A — Local quality analysis (OpenCV)...")
    clear_keep, clear_delete, needs_ai = local_quality_filter(images)
    print(f"  → {len(clear_keep)} clear keeps, "
          f"{len(clear_delete)} clear rejects, "
          f"{len(needs_ai)} need AI review\n")

    ai_results = []
    if run_ai and needs_ai:
        print(f"  Phase B — AI review ({len(needs_ai)} borderline images)...")
        for i, local_q in enumerate(needs_ai):
            p = Path(local_q["path"])
            sys.stdout.write(f"\r  AI [{i+1}/{len(needs_ai)}] {p.name[:45]}")
            sys.stdout.flush()
            ai_q     = evaluate_image_ai(p, local_q)
            combined = compute_hybrid_score(local_q, ai_q)
            ai_results.append(combined)
        print()
    else:
        for local_q in needs_ai:
            local_q["keep"]   = local_q.get("keep_local", True)
            local_q["source"] = "local_only"
            ai_results.append(local_q)

    all_results = clear_keep + clear_delete + ai_results
    all_results.sort(
        key=lambda x: x.get("hybrid_score", x.get("overall_local", 5)),
        reverse=True
    )
    return (
        [r for r in all_results if r.get("keep")],
        [r for r in all_results if not r.get("keep")],
    )


# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

def _progress(label: str, current: int, total: int, name: str = ""):
    bar_len = 20
    filled  = int(bar_len * current / max(total, 1))
    bar     = "█" * filled + "░" * (bar_len - filled)
    pct     = int(100 * current / max(total, 1))
    sys.stdout.write(f"\r  [{bar}] {pct:3d}%  {label}  {name[:30].ljust(30)}")
    sys.stdout.flush()


def fmt_bytes(n: int) -> str:
    for unit in ["B","KB","MB","GB","TB"]:
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def file_info(p: Path) -> dict:
    try:
        s = p.stat()
        return {"path": str(p), "name": p.name, "size_bytes": s.st_size,
                "size_human": fmt_bytes(s.st_size),
                "modified": datetime.fromtimestamp(s.st_mtime).isoformat()}
    except Exception:
        return {"path": str(p), "name": p.name, "size_bytes": 0,
                "size_human": "?", "modified": "?"}


def build_report(folder, images, exact, perceptual, bursts, keep, delete, args) -> dict:
    exact_groups   = [{"hash_sha256": h, "files": [file_info(p) for p in ps]}
                      for h, ps in exact.items()]
    similar_groups = [{"files": [file_info(p) for p in grp]} for grp in perceptual]
    burst_groups   = [{"files": [file_info(p) for p in grp]} for grp in bursts]
    wasted = sum(sum(f["size_bytes"] for f in g["files"][1:]) for g in exact_groups)
    return {
        "dupescope_version": "2.0",
        "generated_at": datetime.now().isoformat(),
        "scanned_folder": str(folder),
        "total_images_scanned": len(images),
        "settings": {"mode": args.mode, "threshold": args.threshold,
                     "recursive": not args.no_recursive, "ai_cull": not args.no_ai},
        "ai_keep":   keep,
        "ai_delete": delete,
        "summary": {
            "exact_groups":      len(exact_groups),
            "exact_files":       sum(len(g["files"]) for g in exact_groups),
            "reclaimable_exact": fmt_bytes(wasted),
            "similar_groups":    len(similar_groups),
            "burst_groups":      len(burst_groups),
            "quality_keep":      len(keep),
            "quality_delete":    len(delete),
            "local_rejects":     sum(1 for r in delete if r.get("source")=="local_reject"),
            "ai_rejects":        sum(1 for r in delete if r.get("source") not in
                                     ("local_reject","local_keep")),
        },
        "exact_groups": exact_groups,
        "similar_groups": similar_groups,
        "burst_groups": burst_groups,
    }


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        prog="dupescope",
        description="DupeScope v2 — Objective + AI Hybrid Photo Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python dupescope.py ~/Pictures
  python dupescope.py ~/Pictures --mode perceptual --threshold 8
  python dupescope.py ~/Pictures --no-ai          # local metrics only, no LLaVA
  python dupescope.py ~/Pictures --no-ssim        # faster, skip SSIM confirmation
  python dupescope.py ~/Pictures --burst-gap 5    # group bursts within 5 seconds
        """
    )
    ap.add_argument("folder")
    ap.add_argument("--mode",       choices=["exact","perceptual","both"], default="both")
    ap.add_argument("--threshold",  type=int, default=10,
                    help="Multi-hash avg distance threshold 0-64 (default 10)")
    ap.add_argument("--no-recursive", action="store_true")
    ap.add_argument("--output",     default="dupescope_report.json", help='Output JSON report path (default: dupescope_report.json)')
    ap.add_argument("--quiet",      action="store_true")
    ap.add_argument("--no-ai",      action="store_true",
                    help="Skip LLaVA — use local metrics only (faster)")
    ap.add_argument("--no-ssim",    action="store_true",
                    help="Skip SSIM confirmation (faster, more false positives)")
    ap.add_argument("--burst-gap",  type=int, default=3,
                    help="Max seconds between burst shots (default 3)")

    args = ap.parse_args()

    if not args.quiet:
        print(BANNER)
        if not OPENCV:  print("  [WARN] opencv-python not installed — quality metrics disabled")
        if not SKIMAGE: print("  [WARN] scikit-image not installed  — SSIM disabled\n")

    folder = Path(args.folder).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        print(f"[error] Not a directory: {folder}"); sys.exit(1)

    print(f"  Scanning: {folder}")
    images = scan_images(folder, recursive=not args.no_recursive)
    print(f"  Found {len(images)} image file(s)\n")
    if not images:
        sys.exit(0)

    exact, perceptual, bursts = {}, [], []

    if args.mode in ("exact", "both"):
        print("[1/4] Exact duplicates (SHA-256)")
        exact = find_exact_dupes(images)
        print(f"      → {len(exact)} group(s)\n")

    if args.mode in ("perceptual", "both"):
        print(f"[2/4] Perceptual duplicates (pHash+dHash+wHash, threshold={args.threshold})")
        perceptual = find_perceptual_dupes(
            images, args.threshold, ssim_confirm=not args.no_ssim)
        print(f"      → {len(perceptual)} group(s)\n")

    print(f"[3/4] Burst detection (gap ≤ {args.burst_gap}s)")
    bursts = find_burst_groups(images, max_gap_seconds=args.burst_gap)
    print(f"      → {len(bursts)} burst group(s)\n")

    print("[4/4] Quality culling (local + AI hybrid)")
    keep, delete = ai_cull(images, run_ai=not args.no_ai)
    print(f"      → keep {len(keep)}, delete {len(delete)}\n")

    report   = build_report(folder, images, exact, perceptual, bursts, keep, delete, args)
    out_path = Path(args.output)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    s   = report["summary"]
    sep = "─" * 52
    print(sep)
    print(f"  Exact groups        : {s['exact_groups']:>6}")
    print(f"  Similar groups      : {s['similar_groups']:>6}")
    print(f"  Burst groups        : {s['burst_groups']:>6}")
    print(f"  Reclaimable (exact) : {s['reclaimable_exact']:>6}")
    print(f"  Quality keep        : {s['quality_keep']:>6}")
    print(f"  Quality delete      : {s['quality_delete']:>6}")
    print(f"    └ local rejects   : {s['local_rejects']:>6}  (blurry / bad exposure)")
    print(f"    └ AI rejects      : {s['ai_rejects']:>6}  (composition / aesthetic)")
    print(sep)
    print(f"\n  Report → {out_path.resolve()}\n")


if __name__ == "__main__":
    main()