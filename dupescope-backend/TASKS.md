# DupeScope Backend — Remaining Tasks

> Phases 1 & 2 are DONE (18 BDD tests GREEN).
> This file tracks all remaining work, categorised by who should do it.

---

## Legend

| Tag | Meaning |
|---|---|
| **QWEN** | Safe for a local Qwen model (boilerplate, tests, config, docs) |
| **AGENT** | Needs the main coding agent (architecture, ML, cross-cutting) |
| **BOTH** | Qwen can scaffold, agent reviews & wires it together |

---

## Phase 3 — Scoring Engine (ML Upgrades)

### 3.1 Dependencies & Setup

| # | Task | Owner | Notes |
|---|---|---|---|
| 3.1.1 | Add `pyiqa`, `open-clip-torch`, `torch`, `torchvision`, `insightface`, `onnxruntime` to `requirements.txt` | **QWEN** | Just add the lines. Pin versions loosely. |
| 3.1.2 | Create `setup_models.py` — CLI script that pre-downloads all ML model weights (pyiqa models, CLIP weights, InsightFace models) to a local cache dir | **QWEN** | Boilerplate: argparse + import pyiqa + call `create_metric` for each model to trigger download. ~40 lines. |
| 3.1.3 | Create `dupescope/scoring/__init__.py` with public API exports | **QWEN** | Boilerplate |

### 3.2 Quality Scorer (replaces `compute_local_quality`)

| # | Task | Owner | Notes |
|---|---|---|---|
| 3.2.1 | Create `dupescope/scoring/quality.py` — `QualityScorer` class that wraps pyiqa. Methods: `score(image_path) -> QualityResult` dataclass. Use `topiq_nr` as primary metric, `brisque` as fast fallback | **BOTH** | Qwen writes the skeleton with dataclass + pyiqa import. Agent reviews metric selection logic. |
| 3.2.2 | Create `dupescope/scoring/quality.py` — `QualityResult` dataclass with fields: `overall: float`, `sharpness: float`, `exposure: float`, `noise: float`, `is_blurry: bool`, `is_overexposed: bool`, `method: str` | **QWEN** | Pure dataclass boilerplate. ~20 lines. |
| 3.2.3 | Write BDD feature file `tests/quality.feature` — scenarios for: valid image returns score 0-10, blurry image scores low, missing file returns fallback, batch scoring works | **QWEN** | Gherkin is mechanical. Copy pattern from `tests/foundation.feature`. |
| 3.2.4 | Write step definitions `tests/test_quality.py` — implement the BDD steps using a small test fixture (create tiny test images with known properties) | **BOTH** | Qwen writes boilerplate. Agent ensures test images have correct properties (blurry = large gaussian kernel, etc). |
| 3.2.5 | Refactor `compute_local_quality` in `core.py` to delegate to `QualityScorer` when pyiqa is available, fall back to existing OpenCV logic when not | **AGENT** | Touches core pipeline. Needs careful integration. |
| 3.2.6 | Add metric caching — `QualityScorer` should cache scores in `.dupescope/quality_cache.json` so re-scans skip already-scored images | **BOTH** | Qwen writes JSON read/write. Agent integrates with scan flow. |

### 3.3 Aesthetic Scorer (replaces LLaVA for aesthetic judgment)

| # | Task | Owner | Notes |
|---|---|---|---|
| 3.3.1 | Create `dupescope/scoring/aesthetic.py` — `AestheticScorer` class wrapping LAION aesthetic predictor. Methods: `score(image_path) -> AestheticResult` | **BOTH** | Qwen writes class skeleton. Agent selects correct model (LAION-ViT-L-14 vs siglip-based). |
| 3.3.2 | Create `AestheticResult` dataclass: `aesthetic_score: float`, `keep: bool`, `confidence: float`, `method: str` | **QWEN** | Pure dataclass. |
| 3.3.3 | Write BDD feature file `tests/aesthetic.feature` | **QWEN** | Gherkin boilerplate. |
| 3.3.4 | Write step definitions `tests/test_aesthetic.py` | **BOTH** | Qwen writes structure. Agent verifies test approach. |

### 3.4 Face Detection (replaces Haar cascade)

| # | Task | Owner | Notes |
|---|---|---|---|
| 3.4.1 | Create `dupescope/scoring/faces.py` — `FaceDetector` class using InsightFace (SCRFD). Methods: `detect(image_path) -> list[Face]` dataclass with `bbox`, `landmarks`, `det_score`, `age`, `gender` | **BOTH** | Qwen writes dataclass + wrapper. Agent reviews InsightFace API usage. |
| 3.4.2 | Add eye-aspect-ratio (EAR) method to `Face` — `is_eyes_open() -> bool` using 6-point eye landmarks | **AGENT** | Requires understanding facial geometry. |
| 3.4.3 | Write BDD feature file `tests/faces.feature` — scenarios: detects face in portrait, no face in landscape, returns landmarks, eye-open detection works | **QWEN** | Gherkin boilerplate. |
| 3.4.4 | Write step definitions `tests/test_faces.py` | **BOTH** | Agent provides test images (or generates synthetic ones). |

### 3.5 Hybrid Scorer (combines all ML scorers)

| # | Task | Owner | Notes |
|---|---|---|---|
| 3.5.1 | Create `dupescope/scoring/hybrid.py` — `HybridScorer` class that combines QualityScorer + AestheticScorer + FaceDetector. Methods: `score(image_path) -> HybridResult` | **AGENT** | Architecture: weighted combination, confidence thresholds, fallback chains. |
| 3.5.2 | Create `HybridResult` dataclass with all sub-scores + final `keep: bool` + `reason: str` | **QWEN** | Dataclass with ~15 fields. |
| 3.5.3 | Replace `compute_hybrid_score` and `ai_cull` in `core.py` with `HybridScorer` | **AGENT** | Core pipeline refactor. |
| 3.5.4 | Write BDD feature file `tests/hybrid.feature` | **BOTH** | Qwen writes scenarios. Agent defines edge cases. |
| 3.5.5 | Write step definitions `tests/test_hybrid.py` | **AGENT** | Complex mocking of ML models. |

### 3.6 Semantic Similarity (CLIP-based grouping)

| # | Task | Owner | Notes |
|---|---|---|---|
| 3.6.1 | Create `dupescope/scoring/semantic.py` — `SemanticMatcher` class using CLIP-IQA or SigLIP embeddings. Methods: `embed(image_path) -> tensor`, `similarity(a, b) -> float`, `find_groups(images, threshold) -> list[list[Path]]` | **AGENT** | CLIP embedding pipeline, cosine similarity, clustering. |
| 3.6.2 | Write BDD feature file `tests/semantic.feature` | **QWEN** | Gherkin. |
| 3.6.3 | Write step definitions `tests/test_semantic.py` | **BOTH** | Qwen boilerplate, agent mocking. |

---

## Phase 4 — Pipeline Refactor (Stage-based)

### 4.1 Pipeline Architecture

| # | Task | Owner | Notes |
|---|---|---|---|
| 4.1.1 | Create `dupescope/pipeline/stages.py` — define `PipelineStage` protocol/ABC with `name`, `run(context) -> StageResult`, `rollback(context)` | **AGENT** | Core architecture decision. |
| 4.1.2 | Create `dupescope/pipeline/context.py` — `PipelineContext` dataclass holding: `job_id`, `folder`, `images`, `mode`, `results` dict, `config` | **QWEN** | Dataclass + typed dict. |
| 4.1.3 | Create `dupescope/pipeline/engine.py` — `PipelineEngine` that chains stages, handles errors, emits WebSocket events, supports resume from checkpoint | **AGENT** | Error handling, checkpointing, event emission. |
| 4.1.4 | Implement `ScanStage` — wraps `scan_images` | **QWEN** | Thin wrapper. ~30 lines. |
| 4.1.5 | Implement `ExactDupeStage` — wraps `find_exact_dupes` | **QWEN** | Thin wrapper. ~30 lines. |
| 4.1.6 | Implement `PerceptualDupeStage` — wraps `find_perceptual_dupes` | **QWEN** | Thin wrapper. ~30 lines. |
| 4.1.7 | Implement `QualityStage` — wraps `HybridScorer` from Phase 3 | **BOTH** | Qwen writes skeleton, agent wires ML scorer. |
| 4.1.8 | Implement `ArchiveStage` — wraps `move_to_archive` with undo support | **BOTH** | Qwen writes skeleton, agent handles rollback logic. |
| 4.1.9 | Refactor `server.py` `_worker` to use `PipelineEngine` instead of inline logic | **AGENT** | Core refactor. |
| 4.1.10 | Write BDD feature file `tests/pipeline.feature` | **QWEN** | Gherkin. |
| 4.1.11 | Write step definitions `tests/test_pipeline.py` — test stage chaining, error rollback, checkpoint resume | **AGENT** | Complex test scenarios. |

### 4.2 Configuration

| # | Task | Owner | Notes |
|---|---|---|---|
| 4.2.1 | Create `dupescope/config.py` — `DupeScopeConfig` dataclass with all settings (thresholds, model paths, weights, cache dirs). Load from `dupescope.toml` or env vars | **QWEN** | TOML parsing + dataclass. ~80 lines. |
| 4.2.2 | Create `dupescope.toml` default config file | **QWEN** | Just a TOML with defaults. ~40 lines. |
| 4.2.3 | Write BDD feature file `tests/config.feature` | **QWEN** | Gherkin. |
| 4.2.4 | Write step definitions `tests/test_config.py` | **QWEN** | TOML parsing tests. |

---

## Phase 5 — Frontend (Component Split + New Features)

### 5.1 Component Split

| # | Task | Owner | Notes |
|---|---|---|---|
| 5.1.1 | Extract `App.jsx` lines 1-23 (THEMES) into `src/theme.js` | **QWEN** | Pure extraction, no logic change. |
| 5.1.2 | Extract `App.jsx` lines 25-37 (apiFetch) into `src/api.js` | **QWEN** | Pure extraction. |
| 5.1.3 | Extract pipeline status bar into `src/components/PipelineStatus.jsx` | **QWEN** | Pure extraction. |
| 5.1.4 | Extract photo table into `src/components/PhotoTable.jsx` | **QWEN** | Pure extraction. |
| 5.1.5 | Extract controls/toolbar into `src/components/Controls.jsx` | **QWEN** | Pure extraction. |
| 5.1.6 | Extract duplicate groups view into `src/components/DuplicateGroups.jsx` | **QWEN** | Pure extraction. |
| 5.1.7 | Extract report/summary panel into `src/components/ReportSummary.jsx` | **QWEN** | Pure extraction. |
| 5.1.8 | Create `src/hooks/useWebSocket.js` — custom hook for WebSocket connection + reconnection | **BOTH** | Qwen writes boilerplate. Agent handles reconnection edge cases. |
| 5.1.9 | Create `src/hooks/usePhotos.js` — custom hook managing photo state, selections, bulk operations | **BOTH** | Qwen writes skeleton. Agent reviews state management. |
| 5.1.10 | Refactor `App.jsx` to import all extracted components | **QWEN** | Import wiring only. |

### 5.2 New UI Features

| # | Task | Owner | Notes |
|---|---|---|---|
| 5.2.1 | Add keyboard shortcuts (j/k navigate, space select, d mark delete, Enter approve) | **BOTH** | Qwen writes event listener boilerplate. Agent defines shortcut map. |
| 5.2.2 | Add bulk selection UI (select all / deselect / invert) | **QWEN** | State management + checkbox rendering. |
| 5.2.3 | Add confidence column to photo table (shows quality score %) | **QWEN** | Simple column addition. |
| 5.2.4 | Add side-by-side comparison modal (two photos at once) | **BOTH** | Qwen writes modal. Agent handles image loading/performance. |
| 5.2.5 | Add dark/light theme toggle button | **QWEN** | Already has THEMES object, just needs a toggle button. |
| 5.2.6 | Add before/after space savings summary | **QWEN** | Simple math + render. |
| 5.2.7 | Add "scan history" sidebar showing previous jobs from SQLite | **BOTH** | Qwen writes component. Agent adds API endpoint. |

---

## Phase 6 — Documentation

| # | Task | Owner | Notes |
|---|---|---|---|
| 6.1 | Write `README.md` — project overview, install, usage, architecture diagram (ASCII) | **QWEN** | Markdown boilerplate. Agent reviews accuracy. |
| 6.2 | Write `docs/architecture.md` — system design, data flow, ML pipeline diagram | **AGENT** | Needs understanding of full system. |
| 6.3 | Write `docs/api.md` — REST API reference (all endpoints, request/response schemas) | **QWEN** | Mechanical: read server.py, write docs. |
| 6.4 | Write `docs/configuration.md` — all config options, env vars, TOML reference | **QWEN** | Read config.py, write docs. |
| 6.5 | Add docstrings to all public functions in `core.py` | **QWEN** | Existing code already has some, fill gaps. |
| 6.6 | Add docstrings to `server.py` endpoints | **QWEN** | FastAPI auto-docs exist, add summaries. |
| 6.7 | Write `CHANGELOG.md` with all changes from v2 to v3 | **QWEN** | Read git log, write markdown. |

---

## Execution Order

```
Phase 3.1  (deps + setup)          ← start here
Phase 3.2  (quality scorer)         ← ML core
Phase 3.3  (aesthetic scorer)       ← ML core
Phase 3.4  (face detection)         ← ML core
Phase 3.5  (hybrid scorer)          ← integrates 3.2-3.4
Phase 4.2  (config)                 ← independent, can run in parallel
Phase 3.6  (semantic similarity)    ← optional, can defer
Phase 4.1  (pipeline engine)        ← needs 3.5 done
Phase 5.1  (component split)        ← independent, can run in parallel
Phase 5.2  (new UI features)        ← needs 5.1 done
Phase 6    (documentation)          ← do last
```

---

## Qwen-Only Batch (can be delegated in one shot)

These tasks are pure boilerplate with zero architecture decisions:

```
3.1.1  Add deps to requirements.txt
3.1.3  scoring/__init__.py
3.2.2  QualityResult dataclass
3.3.2  AestheticResult dataclass
3.5.2  HybridResult dataclass
4.1.2  PipelineContext dataclass
4.1.4  ScanStage wrapper
4.1.5  ExactDupeStage wrapper
4.1.6  PerceptualDupeStage wrapper
4.2.1  DupeScopeConfig dataclass
4.2.2  dupescope.toml defaults
5.1.1  Extract theme.js
5.1.2  Extract api.js
5.1.3  Extract PipelineStatus.jsx
5.1.4  Extract PhotoTable.jsx
5.1.5  Extract Controls.jsx
5.1.6  Extract DuplicateGroups.jsx
5.1.7  Extract ReportSummary.jsx
5.1.10 Refactor App.jsx imports
5.2.2  Bulk selection UI
5.2.3  Confidence column
5.2.5  Theme toggle button
5.2.6  Space savings summary
6.1    README.md
6.3    docs/api.md
6.4    docs/configuration.md
6.5    docstrings in core.py
6.6    docstrings in server.py
6.7    CHANGELOG.md
```

**Total: 28 tasks** that a local Qwen model can handle with the right prompt.
