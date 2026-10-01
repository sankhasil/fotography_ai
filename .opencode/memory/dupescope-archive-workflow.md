---
name: dupescope-archive-workflow
description: How the 13 photo archives in FotoDump/_ARCHIVED were done and how to reverse them
metadata:
  type: project
---

On 2026-10-01, 13 blurry NEFs were moved (not deleted) from `/Users/A200173944/Pictures/Nikon Transfer 2/FotoDump` into `FotoDump/_ARCHIVED/`. Folder went 209 -> 196 NEFs.

They were selected with two filters, deliberately narrow, because a verification run had shown unreliable AI verdicts:
- rejected in **both** `baseline_pre_refactor.json` and the post-refactor report, and
- flagged `_is_blurry` in both (deterministic OpenCV check, reproduces exactly across runs)

Only that set was archived. 3 AI-reviewed borderline files (`DSC_5273`, `DSC_5285`, `DSC_5320`) were **left in place** because their verdicts flipped between runs.

Reverse with `undo_archive.py` + `archive_manifest.json` in `dupescope-backend/` (kept for exactly this reason; `--apply` to actually restore). The pipeline's own `ArchiveStage.rollback` was a no-op bug until fixed in the same session.

**Why:** User requirement was "archive means move, never delete", and no file moves without explicit approval.

**How to apply:** Never delete these or run `rm` on `_ARCHIVED/`. If asked to re-archive or extend the set, re-verify determinism per-file first.
