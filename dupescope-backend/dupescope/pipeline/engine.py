"""
PipelineEngine — chains processing stages with error handling and events.

Stages run sequentially. Each stage receives a PipelineContext and returns
a StageResult. On failure, the pipeline stops and reports the error.

WebSocket events are emitted via a callback so the engine stays decoupled
from the transport layer.
"""

import time
import traceback
from typing import Callable, Protocol

from dupescope.pipeline.context import PipelineContext, StageResult


class PipelineStage(Protocol):
    """A processing step in the DupeScope pipeline."""

    @property
    def name(self) -> str: ...

    def run(self, ctx: PipelineContext) -> StageResult: ...

    def rollback(self, ctx: PipelineContext) -> None: ...


class PipelineEngine:
    """
    Executes a sequence of PipelineStages.

    Usage:
        engine = PipelineEngine(stages=[ScanStage(), DedupeStage(), ...])
        ctx = PipelineContext(job_id="abc", folder="/photos")
        result = engine.run(ctx, on_event=my_ws_callback)
    """

    def __init__(self, stages: list[PipelineStage]):
        self._stages = stages

    def run(
        self,
        ctx: PipelineContext,
        on_event: Callable[[str, dict], None] | None = None,
    ) -> StageResult:
        """
        Run all stages in order.

        Args:
            ctx: The shared pipeline context.
            on_event: Optional callback(stage_name, {"status": ..., "extra": ...}).

        Returns:
            StageResult of the last successful stage, or the first failed stage.
        """
        emit = on_event or (lambda *_: None)
        completed: list[PipelineStage] = []

        for stage in self._stages:
            # Skip stages whose results already exist (resume from checkpoint)
            if stage.name in ctx.results:
                completed.append(stage)
                continue

            emit(stage.name, {"status": "started"})
            start = time.monotonic()

            try:
                result = stage.run(ctx)
            except Exception as exc:
                result = StageResult(
                    stage_name=stage.name,
                    success=False,
                    error=f"{type(exc).__name__}: {exc}",
                )
                traceback.print_exc()

            elapsed = time.monotonic() - start
            result.duration_seconds = round(elapsed, 2)
            ctx.results[stage.name] = result

            if not result.success:
                emit(stage.name, {
                    "status": "error",
                    "error": result.error,
                })
                return result

            emit(stage.name, {
                "status": "completed",
                "duration": result.duration_seconds,
            })
            completed.append(stage)

        # All stages passed
        return StageResult(
            stage_name="pipeline",
            success=True,
            data={"completed_stages": [s.name for s in completed]},
        )

    def rollback(self, ctx: PipelineContext) -> list[str]:
        """Roll back completed stages in reverse order."""
        rolled_back = []
        for stage in reversed(self._stages):
            if stage.name in ctx.results:
                try:
                    stage.rollback(ctx)
                    rolled_back.append(stage.name)
                except Exception:
                    pass
        return rolled_back
