# DupeScope

> Privacy-first duplicate photo detector with AI-powered quality culling. Fully offline.

## What It Does

DupeScope scans your photo library and:

1. **Finds exact duplicates** — SHA-256 byte-identical files
2. **Finds near-duplicates** — perceptual hashing (pHash + dHash + wHash) + SSIM confirmation
3. **Detects burst shots** — groups photos taken within seconds of each other
4. **Scores quality** — ML-based image quality assessment (pyiqa)
5. **Scores aesthetics** — CLIP-based aesthetic scoring
6. **Detects faces** — InsightFace with eye-open detection
7. **Makes keep/delete decisions** — hybrid scoring combining all signals
8. **Explains decisions** — a local LLM (Ollama) adds a human-readable reason per photo
9. **Schedules jobs** — a FIFO queue with a photo-backlog guard (≥ 100 photos ⇒ new jobs rejected with 503)
10. **Archives safely** — moves rejected files to `_ARCHIVED/` beside originals
11. **Supports undo** — restore any archived files instantly

Everything runs locally. No data leaves your machine.

## Architecture

```
                          ┌─────────────────────────────────────────────────┐
                          │              dupescope-ui (React/Vite)          │
                          │                                                 │
 browser ──► ┌────────┐   │  ┌──────────────┐   ┌────────────────────────┐  │
             │ App    │◄──│──│ useJobSocket │◄──│     WS /ws  event bus  │  │
             │ shell  │   │  │  (live)      │   │  queue + job events    │  │
             └────────┘   │  └──────────────┘   └────────────────────────┘  │
                 │  ▲     │         │                                       │
                 │  │ REST│         │ fallback polling                      │
                 ▼  │     │         │                                       │
             ┌────────────────┐  ┌───────────────────────────────────────────┐
             │  dupescope-backend  · FastAPI · :5000                         │
             │                                                    │          │
             │   /scan/start ──►  JobQueue (FIFO · 1 worker)      │          │
             │   /jobs/list        ├─ running: n photos           │          │
             │   /jobs/{id}*       └─ queued:  k photos           │          │
             │        │            backlog ≥ 100 ⇒ 503            │          │
             │        ▼                                           │          │
             │   PipelineEngine ════▶ WS broadcast:               │          │
             │    ├─ ScanStage        queued / scanning /         │          │
             │    ├─ DedupeStage      photo_done {i,total} /      │          │
             │    ├─ QualityStage     processing / ai_culling /   │          │
             │    ├─ LLMReasonStage   processed / archiving /     │          │
             │    ├─ ApprovalGate     archived / error            │          │
             │    └─ ArchiveStage                                 │          │
             └────────┬──────────────────────┬────────────────────┘          │
                      │                      │                               │
                ┌─────▼──────┐     ┌─────────▼──────────┐                    │
                │ SQLite     │     │ ML (torch)         │  ┌───────────────┐ │
                │ .dupescope/│     │  pyiqa · CLIP      │  │ Ollama (11434)│ │
                │ job store  │     │  InsightFace       │  │ LLaVA/Qwen    │ │
                └────────────┘     │  HybridScorer      │  │ keep reason   │ │
                                   └────────────────────┘  └───────────────┘ │
                          └──────────────────────────────────────────────────┘
```

Design detail lives in [`tasks-ui-enhance.md`](tasks-ui-enhance.md), including the QWEN/AGENT task split.

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Ollama running locally on `:11434` (needed for AI culling reasons; install `llava` or a `qwen2.5-vl` model)

### Install

```bash
# Backend
cd dupescope-backend
pip install -r requirements.txt

# Download ML models (one-time, ~2GB)
python setup_models.py

# Frontend
cd ../dupescope-ui
npm install
```

### Run

```bash
# Terminal 1 — Backend
cd dupescope-backend
python server.py
# → http://localhost:5000

# Terminal 2 — Frontend
cd dupescope-ui
npm run dev
# → http://localhost:5173
```

## Configuration

Edit `dupescope.toml` to customise behaviour — and the following env vars:

| Env var | Default | Meaning |
|---------|---------|---------|
| `DUPESCOPE_MAX_QUEUE_PHOTOS` | `100` | Photo backlog (running + queued) above which new jobs are rejected with 503 |
| `DUPESCOPE_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint for keep/delete reasons |
| `DUPESCOPE_OLLAMA_MODEL` | `llava` | Model used to explain culling decisions (e.g. `qwen2.5-vl`) |

```toml
[quality]
quality_metric = "topiq_nr"   # pyiqa metric name
quality_weight = 0.4

[aesthetic]
aesthetic_model = "laion_ViT-L-14"
aesthetic_weight = 0.35

[faces]
face_model = "buffalo_l"      # InsightFace model
face_weight = 0.25

[pipeline]
device = "cpu"                # or "cuda" for GPU
keep_threshold = 5.5
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/photos/count?folder=...` | Count photos in folder |
| POST | `/scan/start` | Submit a job to the queue (503 if backlog ≥ 100 photos) |
| GET | `/jobs/list` | All jobs (running + queued + finished) |
| GET | `/jobs/{id}` | Get job status + summary report |
| POST | `/jobs/{id}/approve` | Approve & archive |
| POST | `/jobs/{id}/mark-delete` | Mark files for deletion |
| POST | `/jobs/{id}/delete` | Archive marked files |
| POST | `/jobs/{id}/undo` | Restore archived files |
| WS | `/ws` | Event bus: subscribe to a job, receive live progress |
| — | `/jobs/{id}/files?page=&limit=` *(planned)* | Paged file rows for large result sets |
| — | `/jobs/{id}/cancel` *(planned)* | Cancel a queued job |

## Project Structure

```
dupescope-backend/
  server.py                    # FastAPI server, job queue, WS event bus
  setup_models.py              # Download ML model weights
  dupescope.toml               # Configuration
  dupescope/
    core.py                    # Core engine (scan, hash, dedupe)
    config.py                  # Config loader
    scoring/
      quality.py               # pyiqa quality scorer
      aesthetic.py             # CLIP aesthetic scorer
      faces.py                 # InsightFace detector
      hybrid.py                # Combined scorer
    pipeline/
      context.py               # Pipeline context & stage result
      engine.py                # Stage chain runner
      stages.py                # Scan, Dedupe, Quality, Archive stages
    archive/
      storage.py               # SQLite job persistence
    models/
      schemas.py               # Pydantic request/response models

dupescope-ui/
  src/
    App.jsx                    # Main app shell (Scanner + Results tabs)
    theme.js                   # Dark/light theme tokens
    api.js                     # API client & constants
    components/
      UI.jsx                   # Shared UI primitives (incl. progress PipelineBar)
      ScannerPanel.jsx         # Folder input, AI-culling config, queue banner
      ResultsPanel.jsx         # Virtualized results table (react-window)

tasks-ui-enhance.md            # Enhancement plan + QWEN/AGENT task split
```

## Tech Stack

- **Backend**: Python, FastAPI, SQLite
- **Frontend**: React, Vite, react-window (virtualized results)
- **AI**: Ollama + Qwen/LLaVA (culling reasons), pyiqa (quality), CLIP (aesthetic), InsightFace (faces)
- **Detection**: SHA-256, pHash/dHash/wHash, SSIM
- **Transport**: REST + WebSocket event bus (with polling fallback)

## Taste Skill (UI Design)

The UI uses [Taste Skill](https://github.com/Leonxlnx/taste-skill) — an open-source
anti-slop design framework for AI agents. The `redesign-existing-projects` skill was
applied to audit and upgrade the inline-styled React components (theme swap,
themed surfaces, focus-visible rings, em-dash cleanup, reduced-motion).

**Install into this repo** (idempotent — safe to re-run):

```bash
cd fotography_ai
npx skills add Leonxlnx/taste-skill --skill redesign-existing-projects -a opencode -y --copy
```

**Wire into OpenCode** — ensure `opencode.json` includes the skills path:

```json
{
  "skills": {
    "paths": [
      "open-code/.agents/skills",
      ".agents/skills"
    ]
  }
}
```

Run `scripts/setup-opencode-skills.sh` on a fresh clone to do both steps automatically.

## OpenCode Setup And Configuration

Use `scripts/opencode.sh` to launch OpenCode with the repo's local defaults:

```bash
bash scripts/opencode.sh
```

What the script does before launch:

- writes `opencode.json` with the local Ollama tool-call proxy as the default model
- keeps the T-Systems provider configured at `https://llm-server.llmhub.t-systems.net/v2`
- calls the T-Systems `/models` endpoint and syncs the returned catalog into `provider.tsystems.models`
- compares the generated config with the existing `opencode.json` and skips rewriting when nothing changed
- copies the final `opencode.json` into the current working directory so `opencode` picks it up from the launch folder

The T-Systems sync is delta-based:

- same `/models` result: `opencode.json` stays untouched
- added, removed, or changed models: only the generated config content changes
- fetch failure: the script falls back to the embedded T-Systems model catalog instead of aborting startup

### Pricing Warnings In Model Selection

The script annotates known T-Systems models with pricing information from the Telekom pricing list. The warning is stored in the generated model `name`, so it shows up directly in the OpenCode model picker without extra UI code.

Example generated entries:

```json
{
  "provider": {
    "tsystems": {
      "models": {
        "gpt-5.4": {
          "name": "GPT 5.4 (High cost, Euro2.42/Euro14.49)",
          "limit": { "context": 400000, "output": 128000 }
        },
        "gpt-oss-120b": {
          "name": "GPT OSS 120B (Euro0.20/Euro0.65)",
          "limit": { "context": 128000, "output": 32768 }
        }
      }
    }
  }
}
```

This warning is informational only. It does not block model usage.

### Colibri Configuration

> **NOT usable until 32 GB RAM.** DeepSeek V4 Flash via Colibri requires a 32 GB machine. This Mac has 16 GB, so the `colibri` provider is deliberately **not generated** into `opencode.json` by `scripts/opencode.sh`, and no Colibri server is started.

To re-enable on a 32 GB+ machine:

- Colibri cloned under `~/PersonalCodes/colibri/`
- DeepSeek V4 Flash downloaded under `~/PersonalCodes/DeepSeek-V4-Flash/` (use `git lfs install && git lfs pull` after `git clone`)
- DeepSeek V4 engine built once:
  ```bash
  make -C ~/PersonalCodes/colibri/c deepseek-v4
  ```
- Re-add the `colibri` provider block and Colibri startup logic in `scripts/opencode.sh`.

### Updating The Pricing Map

The pricing labels are maintained in `scripts/opencode.sh`. Update that table when Telekom changes model names, token prices, or context window limits.

Current source used for the warning labels:

- `https://my-t.telekom.de/sites/strive/wikiStory/2631397/strive-ai-engineer-llms-and-pricing`

## License

MIT
