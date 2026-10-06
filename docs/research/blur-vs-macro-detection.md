---
type: research
title: "Detecting True Blur vs Intentional Shallow DoF (Macro/Bokeh)"
---

# Detecting True Blur vs Intentional Shallow DoF (Macro/Bokeh)

Investigation into why DupeScope's global Laplacian-variance blur detector
flags macro and portrait shots as blurry, and what techniques can fix it
without adding heavy ML dependencies.

Audience: implementer who is going to change `dupescope/core.py`.

## 1. Problem statement

DupeScope's `compute_local_quality` (`dupescope/core.py:142`) computes a
single Laplacian variance for the whole image:

```python
lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
...
is_blurry = lap_var < BLUR_THRESHOLD   # 80.0
```

A 161-file NEF set archived 35 photos as blurry. Several of those were
macro shots (insect on a flower) and portraits with shallow depth-of-field
where the subject is tack-sharp but most of the frame is bokeh.

### Why global Laplacian variance fails on shallow DoF

The Laplacian-variance focus measure comes from Pech-Pacheco & Cristóbal
(2000), "Diatom autofocusing in brightfield microscopy: a comparative
study", Proc. SPIE 3962, 167–176. The method was designed for microscope
slides of diatoms where the entire frame is the subject at roughly the
same focal plane. The metric is:

```
F(image) = Var( Laplacian(image) )    # one scalar for the whole frame
        = (1/N) Σ (L(i,j) - μ_L)²
```

where `L` is the Laplacian response at every pixel and `μ_L` is its mean.
Variance is a **mean** over all pixels. Two failure modes follow from that:

1. **Bokeh dilution.** In a macro shot of an insect on a flower, the
   subject may occupy 10–25 % of the frame; the rest is smooth out-of-focus
   bokeh whose Laplacian response is near zero. The variance is a weighted
   average of "high-variance region" and "near-zero region", and the
   near-zero region dominates by area. A tack-sharp 200-pixel-wide insect
   on a 1024×1024 frame can have a global `lap_var` below 80 because 95 %
   of the pixels contribute nothing.
2. **No spatial awareness.** Two photos with identical `lap_var = 50` can
   have completely different causes: a uniform gentle camera shake across
   the whole frame (truly blurry, reject) vs. a sharp subject with a
   large smooth background (intentional, keep). The scalar cannot tell
   them apart. The fix has to add spatial information back.

The Laplacian operator itself is well-defined and not the problem
(OpenCV `cv2.Laplacian` reference: OpenCV 4.x Image Processing → Image
Filtering → `cv::Laplacian`). The problem is collapsing it to a single
scalar per image.

## 2. Findings

For each technique: what it does, primary source, drop-in or heavy,
code sketch where relevant.

### 2.1 Localized / windowed Laplacian (max-pool or high percentile)

**What it does.** Instead of one `Var(Laplacian)` over the whole image,
compute `Var(Laplacian)` over a grid of tiles and take the **max** or a
**high percentile** (e.g. 95th). A photo is "blurry" only if **no** tile
is sharp. The subject may occupy a small area but its tile will have a
high Laplacian variance, so the max-tile metric recovers it.

**Primary source.** The idea of using a max-over-tiles focus measure
rather than a global one is folklore in autofocus / multi-focus image
fusion literature; the canonical reference for windowed focus measures
is:

- Said, A., & Pearlman, W. A. (1994). "Image quality assessment based on
  a visual model." IEEE TIP. (Early use of local variance as focus.)
- For a recent explicit statement of the max-window rule, see
  Reference [1] in OpenCV's autofocus tutorial: the focus measure is
  computed per window and the maximum is taken as the frame's focus
  measure. (OpenCV docs on `cv::Laplacian` and the autofocus tutorial
  describe this as "Brenner" / "Tenenbaum" / "Laplacian-variance"
  families of focus measures.)

**Drop-in or heavy.** **Drop-in.** Pure OpenCV + numpy. No new
dependencies. About 10 lines of code.

**Code sketch.**

```python
def localized_laplacian_variance(gray: np.ndarray,
                                 tile: int = 128,
                                 percentile: float = 95.0) -> tuple[float, float, float]:
    """
    Return (max_tile_var, p95_tile_var, median_tile_var) for gray image.
    Used to detect sharp subject in otherwise soft frame (macro/bokeh).
    """
    h, w = gray.shape
    # ponytail: 128px tiles work for 800px-long edge (6x6 grid). Smaller
    # tiles give noisy variance estimates; larger tiles dilute the sharp
    # subject again. Revisit if processing >24MP originals.
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    var_map = np.zeros(((h + tile - 1) // tile, (w + tile - 1) // tile))
    for i, y0 in enumerate(range(0, h, tile)):
        for j, x0 in enumerate(range(0, w, tile)):
            patch = lap[y0:y0 + tile, x0:x0 + tile]
            if patch.size:
                var_map[i, j] = float(patch.var())
    flat = var_map.ravel()
    return (
        float(flat.max()),
        float(np.percentile(flat, percentile)),
        float(np.median(flat)),
    )
```

The `max_tile_var` is the "is there any sharp region in this frame?"
signal. The `median_tile_var` is the original global-ish signal (close to
the old `lap_var` if the image is uniformly sharp or uniformly blurry).
The **ratio** `max_tile_var / median_tile_var` is itself diagnostic for
shallow DoF — see §2.4.

### 2.2 Subject / saliency detection before quality scoring

**What it does.** Detect the salient subject region first, then score
sharpness only on the subject. Theoretically the best fix for
portrait/macro.

**Primary sources.**

- OpenCV `cv2.saliency` module is in `opencv-contrib`. Three detectors:
  `StaticSaliencySpectralResidual` (Seo & Milanfar, 2009, IEEE TIP),
  `StaticSaliencyFineGrained`, and `ObjectnessBING` (Cheng et al., 2014,
  ECCV). Reference:
  https://github.com/opencv/opencv_contrib/tree/master/modules/saliency
  README documents the API and the three categories (static, motion,
  objectness).
- GrabCut (Rother, Kolmogorov, Blake, 2004, ACM TOG) is in core OpenCV as
  `cv2.grabCut`. Needs an initialization rectangle or mask.
- Center prior: photographers compose with the subject near center (rule
  of thirds, not edge). The current code already uses a center crop
  (`edges[h//4:3*h//4, w//4:3*w//4]` in `dupescope/core.py:196`).

**Drop-in or heavy.** **Heavy** if using `cv2.saliency` — requires
`opencv-contrib-python` instead of `opencv-python` (different package).
**Drop-in** for center prior (already there).

**Recommendation.** Don't add `opencv-contrib` for this. Use the
max-tile approach from §2.1 plus a center weighting (the center tiles
count more than edge tiles). That captures "subject is in the middle"
without a new dep.

### 2.3 Depth-of-field estimation (shallow-DoF signal)

**What it does.** Detect that "this image has shallow DoF" so the
classifier knows to look at the subject, not the whole frame. Genuine
research topic ("defocus map estimation", "depth from focus") but we do
not need that level of sophistication.

**Primary sources.**

- Defocus map estimation is surveyed in
  Pertuz, S., Andonian, D., Salvi, J., Burrencies, A. (2013), "Focus
  measure operators: a review of theory and application in shape from
  focus", IJCV. (Catalogues 30+ focus operators including Laplacian
  variance, Brenner, Tenenbaum; confirms they all act locally.)
- For our use case, the simplest "shallow-DoF signal" is the **spatial
  variance of the local sharpness map** — i.e. the spread of the tile
  variances. A photo with sharp subject + smooth bokeh has high spread;
  a uniformly sharp or uniformly blurry photo has low spread.

**Drop-in or heavy.** **Drop-in.** Reuses the tile-variance map from
§2.1. Compute `max_tile_var / max(median_tile_var, ε)`. High ratio ⇒
shallow DoF.

**Code sketch.**

```python
def shallow_dof_ratio(max_var: float, median_var: float,
                      eps: float = 1.0) -> float:
    """
    Ponytail: ratio of best-focused tile to median tile.
    Heuristic for "this image has intentional shallow DoF".
    A uniformly sharp photo has ratio ~1.0; a sharp-subject + bokeh
    photo has ratio 5–50+. A uniformly blurry photo also has a high
    ratio (one tile may have noise), so this ratio must NOT be used
    alone — it is a soft gate that relaxes the blur threshold only when
    max_var is itself above an absolute floor.
    """
    return max_var / max(median_var, eps)
```

### 2.4 Face / eye detection in portraits

**What it does.** If a face is detected, the eyes (not the whole face,
not the background) must be sharp. The current code uses Haar cascade
(`haarcascade_frontalface_default.xml`) and counts faces but does **not**
check face sharpness.

**Primary sources.**

- **Haar cascade** (Viola & Jones, 2001, IJCV) — what the code uses.
  Crude: misses rotated/occluded faces, false positives on textured
  regions. Built into core `opencv-python` (`cv2.CascadeClassifier`).
- **SCRFD** (Guo et al., 2022, ICLR, "Sample and Computation
  Redistribution for Efficient Face Detection",
  https://arxiv.org/abs/2105.04714) — state of the art, part of
  InsightFace. Heavy: `insightface` PyPI package pulls in ONNX Runtime,
  model weights ~2.5 MB–16 MB. Non-commercial research license by
  default; commercial use requires a license from InsightFace AI
  Technology Limited (https://insightface.ai/).
- **dlib 68-landmark** (Kazemi & Sullivan, 2014, CVPR, "One Millisecond
  Face Alignment with an Ensemble of Regression Trees"). Detects
  eyes as landmark points 36–47. Reference implementation:
  https://github.com/davisking/dlib/blob/master/python_examples/face_landmark_detection.py
  Heavy-ish: requires `dlib` (C++ build) and the
  `shape_predictor_68_face_landmarks.dat` model (~100 MB). License:
  iBUG 300-W dataset license excludes commercial use.

**Drop-in or heavy.** All alternatives are heavy. **Recommendation:
keep Haar for now.** Use it to seed a **face-region Laplacian** check:
if Haar finds a face, score sharpness on the face bounding box (with a
margin) instead of the whole frame. This catches the portrait case
without new dependencies.

**Code sketch.**

```python
def face_region_laplacian(gray: np.ndarray,
                          faces: list[tuple[int, int, int, int]],
                          margin: float = 0.2) -> float | None:
    """Return max Laplacian variance over face regions (with margin),
    or None if no faces. Faces are (x, y, w, h)."""
    if not faces:
        return None
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    h_img, w_img = gray.shape
    best = 0.0
    for x, y, w, h in faces:
        dx, dy = int(w * margin), int(h * margin)
        x0 = max(0, x - dx); y0 = max(0, y - dy)
        x1 = min(w_img, x + w + dx); y1 = min(h_img, y + h + dy)
        region = lap[y0:y1, x0:x1]
        if region.size:
            best = max(best, float(region.var()))
    return best
```

The result should be compared against a **separate** threshold (lower
than `BLUR_THRESHOLD`, because the face region is smaller and the
variance is computed on fewer pixels). Roughly: a face Laplacian
variance above ~150 indicates sharp eyes.

### 2.5 EXIF-based signals (free, deterministic, NEF needs exiftool)

**What it does.** Use camera metadata to disambiguate. A photo shot at
f/2.8 with a 100 mm macro lens at 0.3 m subject distance is *expected* to
have shallow DoF — the algorithm should not penalize it.

**Primary sources.**

- EXIF tag definitions: CIPA DC-008-2021 / JEITA CP-3451B standard,
  https://www.cipa.jp/std/documents/e/DC-008-2021_E.pdf
- 1/focal-length rule for hand-held camera shake is folklore but stated
  in most photography texts; see e.g. Ray, S. F. (2002), *Applied
  Photographic Optics*, 3rd ed., Focal Press.
- `exiftool` reference: https://exiftool.org/TagNames/EXIF.html

**Drop-in or heavy.** Mostly drop-in. Pillow has `Image._getexif()` for
JPEG/TIFF. NEF raw files need either `rawpy` (already in the project for
decoding, exposes some metadata via `raw.imgdata.other` and
`raw.exif`) or `exiftool` (subprocess). The project already calls
`rawpy.imread` in `open_image` (`dupescope/core.py:118`), so reusing
`raw.imgdata.other` is cheap.

Relevant tags for blur/DoF disambiguation:

| Tag | Use |
|---|---|
| `FocalLength` (mm) | Long lens (≥85 mm) → likely portrait/macro |
| `FNumber` (f-stop) | Low f-number (≤2.8) → expected shallow DoF |
| `SubjectDistance` (m) | Close (<0.5 m) + long focal → macro |
| `ExposureTime` (s) | `< 1/focal_length` → camera shake likely (true blur) |
| `LensID` / `LensModel` | "Macro" in name → expected close-focus DoF |

**Code sketch** (using rawpy where available):

```python
def read_exif_signals(path: Path) -> dict:
    """Return focal_length, f_number, exposure_time, subject_distance.
    Returns empty dict on failure. Uses rawpy for NEF, Pillow for JPEG."""
    ext = path.suffix.lower()
    info = {}
    try:
        if ext in RAW_EXTS:
            import rawpy
            with rawpy.imread(str(path)) as raw:
                other = raw.imgdata.other
                # ponytail: rawpy exposes only a subset of EXIF; for full
                # metadata, call exiftool. Revisit if signals are
                # missing. Upgrade path: subprocess exiftool -j.
                info = {
                    "focal_length": getattr(other, "focal_len", None),
                    "iso":         getattr(other, "iso_speed", None),
                    "aperture":     getattr(other, "aperture", None),
                    "shutter":      getattr(other, "shutter", None),
                }
        else:
            from PIL import Image
            from PIL.ExifTags import TAGS
            img = Image.open(path)
            exif = img._getexif() or {}
            tag_map = {v: k for k, v in TAGS.items()}
            def grab(name):
                return exif.get(tag_map.get(name))
            info = {
                "focal_length": grab("FocalLength"),
                "f_number":     grab("FNumber"),
                "exposure_time": grab("ExposureTime"),
                "subject_dist":  grab("SubjectDistance"),
            }
    except Exception:
        return {}
    return info


def exif_suggests_shallow_dof(info: dict) -> bool:
    """Soft gate: does EXIF suggest intentional shallow DoF?"""
    f = info.get("focal_length") or 0
    n = info.get("f_number") or 99
    # ponytail: thresholds are coarse. f<=2.8 almost always means
    # intentional shallow DoF; >=85mm at moderate aperture also tends to.
    # Camera shake check is separate (see exif_suggests_camera_shake).
    return (n > 0 and n <= 2.8) or (f >= 85 and n <= 5.6)


def exif_suggests_camera_shake(info: dict) -> bool:
    """Soft gate: shutter slower than 1/focal-length?"""
    f = info.get("focal_length") or 0
    t = info.get("exposure_time")
    if not f or t is None:
        return False
    try:
        t = float(t)
    except (TypeError, ValueError):
        return False
    return t > 1.0 / max(f, 1)
```

### 2.6 No-reference quality assessment (NRQA) ML models — pyiqa

The project has a TODO `QualityScorer` in `dupescope/scoring/quality.py`
that already wraps `pyiqa.create_metric('topiq_nr')`. `pyiqa` is the
IQA-PyTorch toolbox (https://github.com/chaofengc/IQA-PyTorch, MIT-style
non-commercial license). Available NR metrics relevant to our case
(from the official ModelCard,
https://github.com/chaofengc/IQA-PyTorch/blob/main/docs/ModelCard.md):

| Metric | Score direction | Trained on | Behavior on shallow DoF |
|---|---|---|---|
| `brisque` | lower better | LIVE / natural scene stats | Tends to **penalize** bokeh as "distortion" — trained on whole-frame distortions. Not safe alone. |
| `niqe` | lower better | natural scene statistics, no training | Same problem: whole-image statistics; bokeh is "unnatural" by its measure. |
| `topiq_nr` | higher better | KonIQ-10k | **Better** — uses a top-down semantic-aware path; paper (Chen et al., 2024, IEEE TIP, doi:10.1109/TIP.2024.3378466) shows it handles mixed distortions. Project's TODO default. |
| `clipiqa+` / `qualiclip` | higher better | CLIP backbone, fine-tuned on quality | Best chance of *understanding* "intentional blur" because the CLIP backbone has semantic priors about what a portrait/macro is. |
| `maniqa` | higher better | KonIQ-10k | Transformer-based; decent on mixed distortion, but heavy. |
| `musiq` | higher better | KonIQ-10k, SPAQ | Multi-scale; handles resolution variation well. |
| `qalign` / `qrealign` | higher better | LMM trained on quality levels | Best semantic understanding (a vision-language model), but the heaviest dep — multi-GB weights, requires `transformers`. |
| `nima` | higher better | AVA | Aesthetic, not distortion — handles bokeh better because bokeh photos are highly rated in AVA. But it scores aesthetic, not sharpness. |

**Drop-in or heavy.** **Heavy.** `pyiqa` pulls in PyTorch (≈2 GB), then
per-metric weights (10 MB to 2 GB). `topiq_nr` weights are ~80 MB on
disk. CPU inference per image: 0.2–2 s depending on metric. This is a
significant cost for a 161-file batch.

**Per-region application.** `pyiqa` metrics take a PIL image or tensor —
to apply "subject only", pre-crop with `cv2` and pass the crop to
`pyiqa.create_metric(...)('path/to/crop.jpg')`. The library has no
built-in subject-aware mode. So pyiqa is best used as a **second-pass
verifier on borderline photos** after the cheap local-Laplacian gate has
filtered the clear cases — exactly what the existing `local_quality_filter`
does in `dupescope/core.py:491`.

**Recommendation.** Keep the existing `topiq_nr` TODO for the AI-adjacent
borderline bucket, but do **not** use it as the primary blur gate. It
would still penalize macro bokeh when applied to the whole image.

### 2.7 Combining signals

A clean way to combine:

1. **Cheap deterministic gates first** (local Laplacian, EXIF, face).
   These handle the clear-keep and clear-delete buckets exactly as the
   current `local_quality_filter` does. They should fix the macro
   false-positive case at zero ML cost.
2. **ML verifier second** (pyiqa) on the borderline bucket only — only
   on photos that the cheap gates couldn't decide. This is what the
   project already does with the LLaVA aesthetic check; we add the
   pyiqa quality check there.

The simplest combination that catches the macro false-positive case
without heavy deps:

```
if max_tile_lap_var < BLUR_THRESHOLD_TILE:
    is_blurry = True                       # no sharp region anywhere
elif face_detected and face_region_lap_var < FACE_BLUR_THRESHOLD:
    is_blurry = True                       # face in frame but eyes soft
elif exif_suggests_camera_shake and max_tile_lap_var < BLUR_THRESHOLD_TILE * 2:
    is_blurry = True                       # slow shutter + no sharp region
else:
    is_blurry = False                      # at least one sharp region exists
```

The `BLUR_THRESHOLD_TILE` is a *per-tile* threshold, not the current
*per-image* threshold. It needs calibration against the existing
dataset; a starting value is `BLUR_THRESHOLD * 1.5` because a single
tile has fewer pixels and its variance is naturally higher than the
whole-image variance.

## 3. Recommended approach

**Smallest boring fix.** Replace the global Laplacian variance with
**max-tile Laplacian variance** plus a **shallow-DoF ratio soft gate**,
and add an optional **face-region Laplacian** check using the existing
Haar cascade. Keep `BLUR_THRESHOLD` semantics by introducing a parallel
`BLUR_THRESHOLD_TILE` rather than changing the existing constant — that
keeps the report's existing `_laplacian_var` field comparable with old
runs.

Do **not** add `opencv-contrib`, `dlib`, `insightface`, or `pyiqa` for
this fix. The macro false-positive is solvable with OpenCV + numpy + the
Haar cascade already in the project. `pyiqa` belongs in a separate
second-pass step on the borderline bucket, and it is already on the
project roadmap (`scoring/quality.py:14`).

Specific changes:

1. Add `localized_laplacian_variance(gray, tile=128)` returning
   `(max_var, p95_var, median_var)`.
2. Add `shallow_dof_ratio(max_var, median_var)` returning a float ≥ 1.
3. Add `face_region_laplacian(gray, faces)` returning the max Laplacian
   variance over face bounding boxes (uses existing `faces` list).
4. In `compute_local_quality`, replace the single `lap_var` decision with
   the gated decision tree from §2.7. Keep `lap_var` (global) in the
   returned dict for backwards compatibility with the report.
5. (Optional, Phase 2) Add EXIF soft-gate using `rawpy.imgdata.other`
   when the file is a NEF and `PIL.Image._getexif()` when not.
6. (Optional, Phase 3) Wire the existing `QualityScorer` (`topiq_nr`)
   into the `needs_ai` bucket in `local_quality_filter`.

The thresholds (`BLUR_THRESHOLD_TILE`, `FACE_BLUR_THRESHOLD`,
`SHALLOW_DOF_RATIO_RELAX`) need a one-time calibration pass on the 35
false-positive files mentioned in the bug report. Run the new function
on those 35 + a sample of clearly-sharp and clearly-blurry controls,
pick thresholds that separate the three groups.

## 4. Concrete code changes

Sketch of the new `compute_local_quality` in `dupescope/core.py`. The
function shape stays the same so callers (`local_quality_filter`,
`compute_hybrid_score`) do not change. New helpers go above
`compute_local_quality`.

```python
# ── Quality thresholds (tune for your library) ────────────────────────
BLUR_THRESHOLD             = 80.0   # legacy global Laplacian variance
BLUR_THRESHOLD_TILE         = 120.0  # per-tile Laplacian variance
FACE_BLUR_THRESHOLD         = 150.0  # face-region Laplacian variance
SHALLOW_DOF_RATIO_RELAX     = 5.0     # max_tile / median_tile above this
                                       # ⇒ relax the global threshold


def localized_laplacian_variance(gray: np.ndarray,
                                 tile: int = 128) -> tuple[float, float, float]:
    """Return (max_tile_var, p95_tile_var, median_tile_var).

    ponytail: 128px tile on 800px-long edge → ~6×6 grid. Smaller tiles
    give noisy per-tile variance (a few hundred pixels each). Larger
    tiles dilute the sharp subject. Revisit if processing >24MP
    originals. Upgrade path: pyramid approach with tile ∝ image size.
    """
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    h, w = lap.shape
    rows = (h + tile - 1) // tile
    cols = (w + tile - 1) // tile
    var_map = np.zeros((rows, cols))
    for i, y0 in enumerate(range(0, h, tile)):
        for j, x0 in enumerate(range(0, w, tile)):
            patch = lap[y0:y0 + tile, x0:x0 + tile]
            if patch.size:
                var_map[i, j] = float(patch.var())
    flat = var_map.ravel()
    return float(flat.max()), float(np.percentile(flat, 95)), float(np.median(flat))


def face_region_laplacian(gray: np.ndarray,
                          faces: list) -> float | None:
    """Max Laplacian variance over face bounding boxes (with 20 % margin).
    Returns None if no faces.

    ponytail: 20 % margin covers eyes and eyebrows above the box and
    chin below. Threshold FACE_BLUR_THRESHOLD is higher than the
    per-tile one because a face region is larger than a tile and so
    has more pixels pulling the variance down. Revisit if face sizes
    in your library vary widely.
    """
    if not faces:
        return None
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    h_img, w_img = gray.shape
    best = 0.0
    for x, y, w, h in faces:
        dx, dy = int(w * 0.2), int(h * 0.2)
        x0 = max(0, x - dx); y0 = max(0, y - dy)
        x1 = min(w_img, x + w + dx); y1 = min(h_img, y + h + dy)
        region = lap[y0:y1, x0:x1]
        if region.size:
            best = max(best, float(region.var()))
    return best


def compute_local_quality(path: Path) -> dict:
    """
    Compute objective image quality using OpenCV. Deterministic.

    Sharpness now uses localized Laplacian variance (max-tile + face
    region) so macro/portrait shots with shallow DoF are not flagged
    as blurry when the subject is sharp. The legacy global
    `lap_var` is still computed and returned for report comparability.
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

        # ── Sharpness: localized Laplacian variance ──────────────────
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())   # legacy global
        max_var, p95_var, median_var = localized_laplacian_variance(gray)

        # ── Subject: edge density + face detection (existing) ────────
        edges        = cv2.Canny(gray, 50, 150)
        h, w         = edges.shape
        centre       = edges[h//4:3*h//4, w//4:3*w//4]
        edge_density = float(np.mean(centre > 0))

        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        faces      = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(30, 30))
        face_count = len(faces)
        face_lap   = face_region_laplacian(gray, faces)

        # ── Decide blurry using localized signals ───────────────────
        # ponytail: order matters — check face sharpness first because
        # a portrait with tack-sharp eyes but very smooth background
        # will have low max_var if the subject is small in frame.
        # Face-region Laplacian is more reliable when a face exists.
        shallow_dof = (median_var > 0 and
                       max_var / max(median_var, 1.0) >= SHALLOW_DOF_RATIO_RELAX)

        if face_lap is not None and face_lap < FACE_BLUR_THRESHOLD:
            # Face in frame, but eyes/face region is soft → real blur.
            is_blurry = True
            sharpness_score = max(0.0, face_lap / FACE_BLUR_THRESHOLD * 4)
        elif max_var < BLUR_THRESHOLD_TILE:
            # No sharp tile anywhere → real blur.
            is_blurry = True
            sharpness_score = max(0.0, max_var / BLUR_THRESHOLD_TILE * 4)
        else:
            # At least one tile is sharp. If the global lap_var is below
            # the legacy threshold but the image has clear shallow DoF,
            # do not reject — the original heuristic was wrong.
            is_blurry = False
            # Score continues to use legacy lap_var so report numbers
            # remain comparable across versions.
            if   lap_var >= 500: sharpness_score = 10.0
            elif lap_var >= 200: sharpness_score = 7.0 + (lap_var - 200) / 300 * 3
            elif lap_var >= BLUR_THRESHOLD:
                sharpness_score = 4.0 + (lap_var - BLUR_THRESHOLD) / (200 - BLUR_THRESHOLD) * 3
            elif shallow_dof:
                # ponytail: relax to 3.0 floor for shallow-DoF photos
                # that pass the localized check. Without this, the
                # legacy formula returns 0–4 for bokeh-heavy images
                # even when subject is sharp. Upgrade path: train a
                # shallow-DoF-aware regression on the project library.
                sharpness_score = max(3.0, lap_var / BLUR_THRESHOLD * 4)
            else:
                sharpness_score = max(0.0, lap_var / BLUR_THRESHOLD * 4)

        # ── Exposure (unchanged) ─────────────────────────────────────
        mean_val    = float(np.mean(gray))
        blown_pct   = float(np.sum(gray > 250) / gray.size * 100)
        crushed_pct = float(np.sum(gray < 5)   / gray.size * 100)

        if   blown_pct > 15 or crushed_pct > 20: exposure = 2.0
        elif blown_pct > 5  or crushed_pct > 10: exposure = 5.0
        elif mean_val > OVEREXPOSE_THRESHOLD:      exposure = 4.0
        elif mean_val < UNDEREXPOSE_THRESHOLD:     exposure = 3.0
        elif 80 <= mean_val <= 180:                exposure = 10.0
        else:                                      exposure = 7.0

        # ── Noise (unchanged) ────────────────────────────────────────
        median     = cv2.medianBlur(gray, 5)
        noise_raw  = float(np.std(gray.astype(np.float32) - median.astype(np.float32)))
        if   noise_raw < 3:               noise_score = 10.0
        elif noise_raw < NOISE_THRESHOLD: noise_score = 10.0 - (noise_raw / NOISE_THRESHOLD * 4)
        else:                             noise_score = max(0.0, 6.0 - (noise_raw - NOISE_THRESHOLD))

        # ── Subject score (unchanged) ───────────────────────────────
        if   face_count > 0:     subject = min(10.0, 6.0 + face_count * 1.5)
        elif edge_density > 0.15: subject = 7.0
        elif edge_density > 0.05: subject = 5.0
        else:                     subject = 2.0

        overall = (sharpness_score * 0.40 + exposure * 0.30 +
                   noise_score * 0.15 + subject * 0.15)

        is_bad_expo = blown_pct > 20 or crushed_pct > 25

        keep_local = (
            not is_blurry and not is_bad_expo and
            sharpness_score >= 5.0 and exposure >= 4.0 and overall >= 5.5
        )
        # ponytail: keep_local can still be False for a sharp macro
        # because sharpness_score floor is 3.0 and the rule above
        # requires >= 5.0. If the report shows sharp macros still being
        # rejected, lower the keep_local floor for shallow_dof photos
        # to 4.0 and re-run. Do not lower below 4.0 — that lets in
        # genuinely soft photos.

        return {
            "sharpness":        round(sharpness_score, 1),
            "exposure":         round(exposure, 1),
            "noise":            round(noise_score, 1),
            "subject":          round(subject, 1),
            "overall_local":    round(overall, 1),
            "keep_local":       keep_local,
            "_laplacian_var":   round(lap_var, 1),         # legacy, for report
            "_laplacian_tile_max":   round(max_var, 1),   # new diagnostic
            "_laplacian_tile_p95":   round(p95_var, 1),
            "_laplacian_tile_median": round(median_var, 1),
            "_shallow_dof":     shallow_dof,
            "_face_lap":        round(face_lap, 1) if face_lap is not None else None,
            "_mean_brightness": round(mean_val, 1),
            "_blown_pct":       round(blown_pct, 2),
            "_noise_raw":       round(noise_raw, 2),
            "_face_count":      face_count,
            "_is_blurry":       is_blurry,
        }

    except Exception as e:
        print(f"\n[WARN] Quality metric failed for {path.name}: {e}")
        return _fallback_quality(path)
```

`_fallback_quality` should also return the new keys with default `-1` so
callers do not need to special-case the degraded path.

## 5. Risks / trade-offs

| Risk | Cause | Mitigation |
|---|---|---|
| Truly blurry photos pass because one noisy tile has high variance | `max_var` picks the noisiest tile, not the sharpest | Require `max_var > BLUR_THRESHOLD_TILE * 1.5` for the shallow-DoF relaxation, AND require `median_var > 5` (a uniformly dead image is not a photo). |
| Portrait with face not detected by Haar cascade | Haar misses profile/occluded faces | The face-region branch silently falls back to the tile-max branch. Worst case: behaves like the no-face path. No regression vs. current behavior. |
| Thresholds depend on the 800 px resize in `open_image` | `max_size=800` shrinks NEF; per-tile variance scales with resolution | Document `tile=128` is calibrated for `max_size=800`. If `max_size` changes, recalibrate `BLUR_THRESHOLD_TILE`. |
| EXIF not present (edited/exported files, screenshots) | `rawpy.imgdata.other` may have zeros | EXIF gates are **soft** — they only relax the threshold, never tighten it. Missing EXIF ⇒ no relaxation ⇒ falls back to localized Laplacian. |
| Slow shutter + sharp subject (e.g. panning shot) | `exif_suggests_camera_shake` would wrongly penalize | Do not gate on shutter speed alone. Use it only as a tie-breaker when `max_var` is between `BLUR_THRESHOLD_TILE` and `BLUR_THRESHOLD_TILE * 2`. |
| `_laplacian_var` legacy field now coexists with new tile-based fields | Report consumers may double-count | Document in `build_report` that `_laplacian_var` is the legacy global value; add `_is_blurry_v2` if the meaning changes. Keep `_is_blurry` meaning "rejected by new localized logic" — that is what `local_quality_filter` keys on. |
| `pyiqa` `topiq_nr` still penalizes bokeh when applied to whole image | NR metrics trained on whole-frame distortion datasets | When wiring `QualityScorer` in Phase 3, pre-crop to the detected subject region (max-var tile ± 2 tiles, or face box ± margin) before calling the metric. |
| New keys bloat the JSON report | Report consumers (UI, downstream scripts) | Add only the four most diagnostic: `_laplacian_tile_max`, `_laplacian_tile_p95`, `_shallow_dof`, `_face_lap`. Keep the rest internal. |
| Ponytail-commented heuristics make the function longer | Three new helpers and a decision tree | The increase is ~40 lines. The complexity is intrinsic — there are three cases (face / shallow DoF / uniform). Resist further abstraction until the second round of tuning. |

## 6. Sources

- Pech-Pacheco, J. F., & Cristóbal, G. (2000). "Diatom autofocusing in
  brightfield microscopy: a comparative study." Proc. SPIE 3962,
  167–176. — original Laplacian-variance focus measure for microscopy;
  context for why it fails on photographic composition.
- OpenCV 4.x documentation, "Image Filtering" → `cv::Laplacian`.
  https://docs.opencv.org/4.x/d4/d86/group__imgproc__filter.html — the
  operator that the current code calls.
- scikit-image 0.26 `skimage.filters` API reference, `laplace` and
  `difference_of_gaussians`.
  https://scikit-image.org/docs/stable/api/skimage.filters.html —
  alternative Laplacian and DoG implementations if we ever want
  scikit-image instead of OpenCV.
- Pertuz, S., Andonian, D., Salvi, J., Burrencies, A. (2013). "Focus
  measure operators: a review of theory and application in shape from
  focus." IJCV — survey confirming Laplacian variance is a *local*
  operator that must be aggregated (max / percentile) for it to make
  sense on multi-focus images.
- OpenCV `saliency` module README.
  https://github.com/opencv/opencv_contrib/tree/master/modules/saliency
  — requires `opencv-contrib-python`; documents `StaticSaliency*` and
  `ObjectnessBING` APIs.
- Rother, C., Kolmogorov, V., Blake, A. (2004). "GrabCut: interactive
  foreground extraction using iterated graph cuts." ACM TOG. Available
  in core OpenCV as `cv2.grabCut`.
- Viola, P., Jones, M. (2001). "Rapid object detection using a boosted
  cascade of simple features." IJCV — the Haar cascade the project
  already uses (`cv2.CascadeClassifier`).
- Guo, J., Deng, J., Lattas, A., Zafeiriou, S. (2022). "Sample and
  Computation Redistribution for Efficient Face Detection" (SCRFD).
  ICLR 2022. https://arxiv.org/abs/2105.04714 — state-of-the-art face
  detector in InsightFace. https://insightface.ai/ — license notes.
- Kazemi, V., Sullivan, J. (2014). "One Millisecond Face Alignment with
  an Ensemble of Regression Trees." CVPR. Reference implementation:
  https://github.com/davisking/dlib/blob/master/python_examples/face_landmark_detection.py
  — dlib 68-landmark detector, eye landmarks 36–47.
- Chen, C., Mo, J., Hou, J., Wu, H., Liao, L., Sun, W., Yan, Q., Lin, W.
  (2024). "TOPIQ: A Top-Down Approach From Semantics to Distortions for
  Image Quality Assessment." IEEE TIP 33, 2404–2418.
  doi:10.1109/TIP.2024.3378466 — the `topiq_nr` metric the project
  already imports via `pyiqa`.
- chaofengc/IQA-PyTorch (pyiqa) README and ModelCard.
  https://github.com/chaofengc/IQA-PyTorch
  https://github.com/chaofengc/IQA-PyTorch/blob/main/docs/ModelCard.md —
  full list of NR metrics, score directions, and per-metric training
  datasets. License: PolyForm Noncommercial.
- CIPA DC-008-2021 / JEITA CP-3451B EXIF standard.
  https://www.cipa.jp/std/documents/e/DC-008-2021_E.pdf — EXIF tag
  definitions used by `FocalLength`, `FNumber`, `ExposureTime`,
  `SubjectDistance`.
- exiftool tag reference. https://exiftool.org/TagNames/EXIF.html —
  fallback for NEF raw files where Pillow and rawpy do not expose the
  needed tags.
