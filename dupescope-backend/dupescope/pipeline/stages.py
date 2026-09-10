"""
Pipeline stage implementations for DupeScope.

Each stage wraps a core function and stores results in PipelineContext.
"""

import shutil
import threading
import time
from pathlib import Path

from dupescope.pipeline.context import PipelineContext, StageResult


class ScanStage:
    """Discover image files in the target folder."""

    @property
    def name(self) -> str:
        return "scan"

    def run(self, ctx: PipelineContext) -> StageResult:
        images = ctx.images
        if not images:
            from dupescope.core import scan_images

            # ponytail: Rescan is expensive for large libraries (one walk per job).
            # Reuse the paths the server already collected unless none were given.
            images = scan_images(Path(ctx.folder), ctx.recursive)
        ctx.images = images
        return StageResult(
            stage_name=self.name,
            data={"count": len(images)},
        )

    def rollback(self, ctx: PipelineContext) -> None:
        pass


class DedupeStage:
    """Find exact and perceptual duplicates among scanned images."""

    @property
    def name(self) -> str:
        return "dedupes"

    def run(self, ctx: PipelineContext) -> StageResult:
        from dupescope.core import find_exact_dupes, find_perceptual_dupes

        exact = {}
        perceptual = []
        if ctx.mode in ("exact", "both"):
            exact = find_exact_dupes(ctx.images)
        if ctx.mode in ("perceptual", "both"):
            perceptual = find_perceptual_dupes(ctx.images, ctx.threshold)
        return StageResult(
            stage_name=self.name,
            data={"exact": exact, "perceptual": perceptual},
        )

    def rollback(self, ctx: PipelineContext) -> None:
        pass


class QualityStage:
    """Score images with HybridScorer (quality + aesthetic + faces)."""

    @property
    def name(self) -> str:
        return "quality"

    def run(self, ctx: PipelineContext) -> StageResult:
        if not ctx.images:
            return StageResult(
                stage_name=self.name,
                data={"keep": [], "delete": [], "details": []},
            )

        from dupescope.scoring.hybrid import HybridScorer

        scorer = HybridScorer()
        scorer.load()

        keep: list[str] = []
        delete: list[str] = []
        details: list[dict] = []
        on_progress = ctx.config.get("on_progress")
        total = len(ctx.images)

        for index, path in enumerate(ctx.images):
            result = scorer.score(path)
            # ponytail: Keeping per-file details enables the results table and
            # LLM reasons without a second scoring pass. Scale is one dict per photo.
            details.append({
                "path": str(path),
                "keep": result.keep,
                "overall": result.overall,
                "quality_score": result.quality_score,
                "aesthetic_score": result.aesthetic_score,
                "face_count": result.face_count,
                "reason": result.reason,
            })
            if result.keep:
                keep.append(str(path))
            else:
                delete.append(str(path))
            if on_progress:
                on_progress(index + 1, total)

        return StageResult(
            stage_name=self.name,
            data={"keep": keep, "delete": delete, "details": details},
        )

    def rollback(self, ctx: PipelineContext) -> None:
        pass


class LLMReasonStage:
    """Add a human-readable keep/delete reason per photo via local Ollama."""

    @property
    def name(self) -> str:
        return "llm"

    def run(self, ctx: PipelineContext) -> StageResult:
        quality = ctx.results.get("quality")
        if not quality or not ctx.images:
            return StageResult(
                stage_name=self.name,
                data={"reasons": {}},
            )

        from dupescope.llm import explain_photo

        keep_paths = set(quality.data.get("keep", []))
        reasons: dict[str, str] = {}
        on_progress = ctx.config.get("on_progress")
        total = len(ctx.images)

        for index, path in enumerate(ctx.images):
            path_str = str(path)
            reasons[path_str] = explain_photo(path, keep=path_str in keep_paths)
            if on_progress:
                on_progress(index + 1, total)

        return StageResult(
            stage_name=self.name,
            data={"reasons": reasons},
        )

    def rollback(self, ctx: PipelineContext) -> None:
        pass


class ApprovalGate:
    """
    Pause the pipeline until the user approves or rejects via API.

    Expects ctx.config["approval_event"] (threading.Event)
    and ctx.config["store"] (JobStore).
    """

    @property
    def name(self) -> str:
        return "approval"

    def run(self, ctx: PipelineContext) -> StageResult:
        event: threading.Event | None = ctx.config.get("approval_event")
        if event and not ctx.config.get("auto_archive"):
            event.wait()
        return StageResult(
            stage_name=self.name,
            data={"approved": True},
        )

    def rollback(self, ctx: PipelineContext) -> None:
        pass


class ArchiveStage:
    """
    Move rejected files to _ARCHIVED/ beside each file.

    Expects ctx.config["store"] (JobStore) and ctx.config["photos"] (dict).
    """

    @property
    def name(self) -> str:
        return "archive"

    def run(self, ctx: PipelineContext) -> StageResult:
        quality = ctx.results.get("quality")
        if quality:
            delete_paths = quality.data.get("delete", [])
        else:
            # ponytail: Server archives in a detached pass after processing, so
            # quality results are gone. Re-read the delete list from the report.
            store = ctx.config.get("store")
            job = store.get_job(ctx.job_id) if store else None
            delete_paths = (job.get("reportData") or {}).get("aiDelete", [])
        store = ctx.config.get("store")
        photos = ctx.config.get("photos", {})
        cache_lock = ctx.config.get("cache_lock", threading.Lock())
        job_id = ctx.job_id

        archive_log: list[dict] = []
        for path_str in delete_paths:
            try:
                src = Path(path_str)
                if not src.exists():
                    continue
                archive_dir = src.parent / "_ARCHIVED"
                archive_dir.mkdir(exist_ok=True)
                dst = archive_dir / src.name
                if dst.exists():
                    dst = archive_dir / f"{src.stem}_{int(time.time())}{src.suffix}"
                shutil.move(str(src), str(dst))
                entry = {"from": str(src), "to": str(dst)}
                archive_log.append(entry)
                pid = src.name
                with cache_lock:
                    if pid in photos:
                        photos[pid]["moved_to"] = dst
            except Exception as e:
                archive_log.append({"error": str(e)})

        if store:
            existing = (store.get_job(job_id) or {}).get("archive_log", [])
            store.update_job(
                job_id,
                status="archived",
                archive_log=existing + archive_log,
                completed_at=time.strftime("%Y-%m-%dT%H:%M:%S"),
                archived=True,
            )

        return StageResult(
            stage_name=self.name,
            data={"archived": len(archive_log)},
        )

    def rollback(self, ctx: PipelineContext) -> None:
        """Restore files from _ARCHIVED/ back to original locations."""
        quality = ctx.results.get("archive")
        if not quality:
            return
        for entry in quality.data.get("archive_log", []):
            try:
                src = Path(entry.get("to", ""))
                dst = Path(entry.get("from", ""))
                if src.exists():
                    shutil.move(str(src), str(dst))
            except Exception:
                pass
