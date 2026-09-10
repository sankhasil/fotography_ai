#!/usr/bin/env python3
"""
DupeScope API Server — FastAPI + Job Queue + WebSocket
=======================================================

Pipeline:
  queued -> scanning -> processing -> ai_culling -> processed -> archiving -> archived

Features:
  - Scheduled job queue (single FIFO worker)
  - Photo-backlog guard (DUPESCOPE_MAX_QUEUE_PHOTOS, default 100) → 503 when full
  - WebSocket event bus (WS /ws) for live progress + completion notifications
  - AI culling: hybrid scorer decides keep/delete, local Ollama explains why
  - Detached approval: archive runs on approve without blocking the queue
  - Safe archiving (_ARCHIVED next to files)
  - Undo system (restore moved files)
  - SQLite persistence per folder
"""

import asyncio
import os
import shutil
import sqlite3
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from dupescope.archive.storage import JobStore
from dupescope.core import (
    scan_images,
    fmt_bytes,
)
from dupescope.llm import OLLAMA_MODEL, OLLAMA_URL
from dupescope.pipeline.context import PipelineContext
from dupescope.pipeline.engine import PipelineEngine
from dupescope.pipeline.stages import (
    ScanStage,
    DedupeStage,
    QualityStage,
    LLMReasonStage,
    ArchiveStage,
)
from dupescope.models.schemas import (
    ScanRequest,
    MarkDeleteRequest,
    DeleteRequest,
)

app = FastAPI(title="DupeScope", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_QUEUE_PHOTOS = int(os.environ.get("DUPESCOPE_MAX_QUEUE_PHOTOS", "100"))

# ─────────────────────────────────────────────────────────────────────────────
# SHARED STATE
# ─────────────────────────────────────────────────────────────────────────────

cache_lock = threading.Lock()
stores: dict[str, JobStore] = {}

# Job queue state
queue_lock = threading.Lock()
queue_event = threading.Event()
queue: list[str] = []                       # queued job_ids, FIFO
running_job: str | None = None              # job_id currently executing
job_totals: dict[str, int] = {}             # job_id -> total photos (backlog math)
job_photos: dict[str, dict[str, dict]] = {}  # job_id -> {filename: meta}

# WebSocket bus state
ws_clients: list[WebSocket] = []
ws_subscriptions: dict[WebSocket, set[str]] = {}
ws_queues: dict[WebSocket, asyncio.Queue] = {}
ws_loops: dict[WebSocket, asyncio.AbstractEventLoop] = {}

# Archive concurrency guards
archive_lock = threading.Lock()
archiving: dict[str, bool] = {}

_queue_worker_started = False
_queue_worker_lock = threading.Lock()


def ts() -> str:
    return datetime.now().isoformat()


def photo_id(p: Path) -> str:
    return p.name


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET EVENT BUS
# ─────────────────────────────────────────────────────────────────────────────


def emit_event(job_id: str, event: str, extra: dict | None = None) -> None:
    """Push {jobId, status, extra} to every socket subscribed to job_id.

    Sync by design so worker threads can emit without an event loop.
    """
    payload = {"jobId": job_id, "status": event, "extra": extra or {}}
    for ws in list(ws_clients):
        if job_id in ws_subscriptions.get(ws, set()):
            q = ws_queues.get(ws)
            loop = ws_loops.get(ws)
            if q is not None and loop is not None:
                loop.call_soon_threadsafe(q.put_nowait, payload)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    ws_subscriptions[websocket] = set()
    outbox: asyncio.Queue = asyncio.Queue()
    ws_queues[websocket] = outbox
    ws_loops[websocket] = asyncio.get_running_loop()

    async def writer():
        while True:
            payload = await outbox.get()
            if payload is None:
                break
            try:
                await websocket.send_json(payload)
            except Exception:
                break

    writer_task = asyncio.create_task(writer())
    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            if msg_type == "subscribe" and message.get("job_id"):
                ws_subscriptions[websocket].add(message["job_id"])
                job = _find_job(message["job_id"])
                if job:
                    outbox.put_nowait({
                        "jobId": message["job_id"],
                        "status": job.get("status"),
                        "extra": {"snapshot": True},
                    })
            elif msg_type == "unsubscribe":
                ws_subscriptions[websocket].discard(message.get("job_id"))
            elif msg_type == "ping":
                outbox.put_nowait({"jobId": None, "status": "pong"})
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if websocket in ws_clients:
            ws_clients.remove(websocket)
        ws_queues.pop(websocket, None)
        ws_loops.pop(websocket, None)
        ws_subscriptions.pop(websocket, None)
        outbox.put_nowait(None)
        writer_task.cancel()


# ─────────────────────────────────────────────────────────────────────────────
# JOB QUEUE
# ─────────────────────────────────────────────────────────────────────────────


def _backlog_photos() -> int:
    running = job_totals.get(running_job, 0) if running_job else 0
    queued = sum(job_totals.get(j, 0) for j in queue)
    return running + queued


def _release_job(job_id: str) -> None:
    with queue_lock:
        job_totals.pop(job_id, None)
        if job_id in queue:
            queue.remove(job_id)


def _cleanup_job(job_id: str) -> None:
    """Drop all in-memory job state. Free the photo metadata cache."""
    _release_job(job_id)
    with cache_lock:
        job_photos.pop(job_id, None)


def _ensure_queue_worker() -> None:
    global _queue_worker_started
    with _queue_worker_lock:
        if _queue_worker_started:
            return
        _queue_worker_started = True
        threading.Thread(target=_queue_worker_loop, name="queue-worker", daemon=True).start()


def _queue_worker_loop() -> None:
    while True:
        queue_event.wait()
        queue_event.clear()
        with queue_lock:
            job_id = queue.pop(0) if queue else None
        if job_id is None:
            continue
        store = _find_store(job_id)
        if not store:
            _release_job(job_id)
            continue
        with queue_lock:
            global running_job
            running_job = job_id
        try:
            _run_job(job_id)
        except Exception as e:
            store.update_job(job_id, status="error", error=str(e))
            emit_event(job_id, "error", {"error": str(e)})
            _cleanup_job(job_id)
        finally:
            with queue_lock:
                running_job = None
            queue_event.set()


def _run_job(job_id: str) -> None:
    store = _find_store(job_id)
    if not store:
        return
    job = store.get_job(job_id)
    if not job:
        return

    folder = Path(job["folder"])
    mode = job.get("mode", "both")
    threshold = job.get("threshold", 10)
    ai_cull = job.get("ai_cull", False)
    auto_archive = job.get("auto_archive", False)
    images = [Path(meta["path"]) for meta in job_photos.get(job_id, {}).values()]

    def on_progress(done: int, total: int) -> None:
        emit_event(job_id, "photo_done", {"done": done, "total": total})

    ctx = PipelineContext(
        job_id=job_id,
        folder=str(folder),
        mode=mode,
        threshold=threshold,
        ai_cull=ai_cull,
        auto_archive=auto_archive,
        images=images,
        config={
            "store": store,
            "auto_archive": auto_archive,
            "photos": job_photos.get(job_id, {}),
            "cache_lock": cache_lock,
            "on_progress": on_progress,
        },
    )

    stages = [ScanStage(), DedupeStage(), QualityStage()]
    if ai_cull:
        stages.append(LLMReasonStage())

    status_map = {
        "scan": "scanning",
        "dedupes": "processing",
        "quality": "ai_culling",
        "llm": "ai_culling",
    }

    def on_stage_event(stage_name: str, event: dict):
        status = status_map.get(stage_name)
        if status and event.get("status") == "started":
            store.update_job(job_id, status=status)
            emit_event(job_id, status)

    engine = PipelineEngine(stages)
    result = engine.run(ctx, on_event=on_stage_event)

    if not result.success:
        store.update_job(
            job_id,
            status="error",
            error=f"Pipeline failed at {result.stage_name}: {result.error}",
        )
        emit_event(job_id, "error", {"error": result.error})
        _cleanup_job(job_id)
        return

    quality = ctx.results.get("quality")
    dedupes = ctx.results.get("dedupes")
    llm = ctx.results.get("llm")

    details = quality.data.get("details", []) if quality else []
    reasons = llm.data.get("reasons", {}) if llm else {}

    # ponytail: LLM reasons overwrite hybrid explainer in the canonical per-file
    # list so consumers see one row shape. Both remain in the DB for provenance.
    if reasons:
        for detail in details:
            if detail["path"] in reasons:
                detail["reason"] = reasons[detail["path"]]

    report = {
        "jobId": job_id,
        "aiKeep": quality.data.get("keep", []) if quality else [],
        "aiDelete": quality.data.get("delete", []) if quality else [],
        "exactGroups": len(dedupes.data.get("exact", {})) if dedupes else 0,
        "similarGroups": len(dedupes.data.get("perceptual", [])) if dedupes else 0,
        "details": details,
        "reasons": reasons,
    }

    store.update_job(job_id, status="processed", reportData=report)
    emit_event(job_id, "processed", {"total": len(images)})

    if auto_archive:
        _archive_job(job_id)
    _release_job(job_id)


def _archive_job(job_id: str) -> None:
    store = _find_store(job_id)
    if not store:
        return
    job = store.get_job(job_id)
    if not job or job.get("actions", {}).get("archived"):
        return
    with archive_lock:
        if archiving.get(job_id):
            return
        archiving[job_id] = True
    try:
        store.update_job(job_id, status="archiving")
        emit_event(job_id, "archiving")

        ctx = PipelineContext(
            job_id=job_id,
            folder=job["folder"],
            config={
                "store": store,
                "auto_archive": True,
                "photos": job_photos.get(job_id, {}),
                "cache_lock": cache_lock,
            },
        )
        engine = PipelineEngine([ArchiveStage()])
        result = engine.run(ctx)

        if not result.success:
            store.update_job(
                job_id,
                status="error",
                error=f"Archive failed: {result.error}",
            )
            emit_event(job_id, "error", {"error": result.error})
        else:
            store.update_job(
                job_id,
                status="archived",
                archived=True,
                completed_at=ts(),
            )
            emit_event(job_id, "archived", {"archived": result.data.get("archived", 0)})
    finally:
        with archive_lock:
            archiving.pop(job_id, None)
        # ponytail: Archive is terminal; the review cache is no longer needed.
        # Frees job_photos (and any queue budget) so done jobs don't pin memory.
        _cleanup_job(job_id)
        _cleanup_job(job_id)


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────


def _move_to_archive(src: Path) -> dict:
    """Move a single file to _ARCHIVED/ beside its original location."""
    archive_dir = src.parent / "_ARCHIVED"
    archive_dir.mkdir(exist_ok=True)
    dst = archive_dir / src.name
    if dst.exists():
        dst = archive_dir / f"{src.stem}_{int(time.time())}{src.suffix}"
    shutil.move(str(src), str(dst))
    return {"from": str(src), "to": str(dst)}


@app.get("/photos/count")
def photos_count(folder: str = "", recursive: bool = True):
    path = Path(folder).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    try:
        images = scan_images(path, recursive=recursive)
        total = len(images)
        return {"total": total, "processed": 0, "unprocessed": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scan/start")
async def start_scan(req: ScanRequest):
    folder = Path(req.folder).expanduser().resolve()

    if not req.folder or (not req.test_mode and not folder.exists()):
        raise HTTPException(status_code=400, detail="Folder not found or empty")

    job_id = str(uuid.uuid4())
    store_dir = folder if folder.exists() else Path.cwd()
    store = _get_or_create_store(store_dir)

    if req.test_mode:
        job = store.create_job(
            job_id,
            str(folder),
            mode=req.mode,
            threshold=req.threshold,
            test_mode=True,
        )
        job["reportData"] = {
            "jobId": job_id,
            "aiKeep": [],
            "aiDelete": [],
            "exactGroups": 0,
            "similarGroups": 0,
            "testMode": True,
        }
        store.update_job(
            job_id,
            status="processed",
            reportData=job["reportData"],
            completed_at=ts(),
        )
        return {"job_id": job_id}

    images = scan_images(folder, recursive=req.recursive)
    total = len(images)

    # ponytail: Guard before persisting the job so a rejected (503) submission
    # leaves no orphaned 'queued' row behind. The cap counts the EXISTING backlog
    # (running + queued), not the incoming job — a single folder beats the cap.
    with queue_lock:
        backlog = _backlog_photos()
        if backlog >= MAX_QUEUE_PHOTOS:
            raise HTTPException(
                status_code=503,
                detail=f"Queue full — {backlog} ≥ {MAX_QUEUE_PHOTOS} photos already scheduled",
            )

    store.create_job(
        job_id,
        str(folder),
        mode=req.mode,
        threshold=req.threshold,
        recursive=req.recursive,
        ai_cull=req.ai_cull,
        auto_archive=req.auto_archive,
    )

    with queue_lock:
        queue.append(job_id)
        job_totals[job_id] = total

    with cache_lock:
        job_photos[job_id] = {
            photo_id(p): {
                "path": str(p),
                "processed": False,
                "marked_delete": False,
                "moved_to": None,
            }
            for p in images
        }

    emit_event(job_id, "queued", {"total": total})
    queue_event.set()
    _ensure_queue_worker()

    return {"job_id": job_id}


@app.get("/jobs/list")
def jobs_list():
    jobs = []
    for folder_key, store in list(stores.items()):
        try:
            jobs.extend(store.list_jobs())
        except sqlite3.OperationalError:
            # ponytail: The scanned folder was deleted or moved, so its DB is
            # gone. Drop the dead store instead of 500-ing every poll; the job
            # rows are unrecoverable anyway once the folder is gone.
            stores.pop(folder_key, None)
    return {"jobs": jobs, "count": len(jobs)}


@app.get("/jobs/{job_id}/files")
def job_files(
    job_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1),
    keep: str = Query(default=""),
    search: str = Query(default=""),
):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    details = (job.get("reportData") or {}).get("details", [])
    if not isinstance(details, list):
        details = []

    limit = min(limit, 200)
    photos = job_photos.get(job_id, {})

    filtered = details
    if keep in ("true", "false"):
        want = keep == "true"
        filtered = [d for d in filtered if d.get("keep") == want]
    if search:
        q = search.lower()
        filtered = [d for d in filtered if q in Path(d["path"]).name.lower()]

    total = len(filtered)
    start = (page - 1) * limit
    page_items = filtered[start : start + limit]

    rows = []
    for d in page_items:
        pid = photo_id(Path(d["path"]))
        meta = photos.get(pid, {})
        rows.append({
            "id": pid,
            "path": d["path"],
            "keep": d.get("keep", False),
            "overall": d.get("overall", 0),
            "qualityScore": d.get("quality_score", 0),
            "aestheticScore": d.get("aesthetic_score", 0),
            "faceCount": d.get("face_count", 0),
            "reason": d.get("reason"),
            "markedDelete": meta.get("marked_delete", False),
            "movedTo": meta.get("moved_to"),
        })

    return {"rows": rows, "total": total, "page": page, "limit": limit}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # ponytail: details served page-by-page via /jobs/{job_id}/files (B7).
    # Strip here to avoid shipping 10k+ rows per status poll.
    out = dict(job)
    rd = out.get("reportData")
    if isinstance(rd, dict):
        rd = dict(rd)
        rd.pop("details", None)
        out["reportData"] = rd
    return out


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    with queue_lock:
        if job_id not in queue or job_id == running_job:
            raise HTTPException(
                status_code=409,
                detail="Job not cancelled — already running or finished",
            )
        queue.remove(job_id)
    store.update_job(job_id, status="cancelled")
    emit_event(job_id, "cancelled")
    _cleanup_job(job_id)
    return {"status": "cancelled"}


@app.post("/jobs/{job_id}/approve")
async def approve(job_id: str):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("actions", {}).get("archived"):
        return {"status": "approved"}
    store.update_job(job_id, approved=True)
    threading.Thread(target=_archive_job, args=(job_id,), daemon=True).start()
    return {"status": "approved"}


@app.post("/jobs/{job_id}/mark-delete")
def mark_delete(job_id: str, req: MarkDeleteRequest):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    with cache_lock:
        for pid in req.file_ids:
            if pid in job_photos.get(job_id, {}):
                job_photos[job_id][pid]["marked_delete"] = True
    return {"status": "marked", "count": len(req.file_ids)}


@app.post("/jobs/{job_id}/delete")
def delete_files(job_id: str, req: DeleteRequest):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    job = store.get_job(job_id)
    moved = []
    with cache_lock:
        photos = job_photos.get(job_id, {})
    logs = []
    for fid in req.file_ids:
        meta = photos.get(fid)
        if not meta:
            continue
        try:
            src = Path(meta["path"])
            if not src.exists():
                continue
            result = _move_to_archive(src)
            with cache_lock:
                meta["moved_to"] = result["to"]
                meta["marked_delete"] = True
            moved.append(result)
            logs.append({"from": result["from"], "to": result["to"]})
        except Exception as e:
            moved.append({"error": str(e), "file": fid})
    if logs:
        store.update_job(job_id, archive_log=job.get("archive_log", []) + logs)
    return {"moved": moved}


@app.post("/jobs/{job_id}/undo")
async def undo(job_id: str):
    store = _find_store(job_id)
    if not store:
        raise HTTPException(status_code=404, detail="Job not found")
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    restored = []
    for entry in job.get("archive_log", []):
        try:
            src = Path(entry["to"])
            dst = Path(entry["from"])
            if src.exists():
                shutil.move(str(src), str(dst))
                restored.append(entry)
        except Exception:
            pass
    store.update_job(job_id, status="reverted", reverted=True)
    emit_event(job_id, "reverted", {"restored": len(restored)})
    _cleanup_job(job_id)
    return {"restored": restored}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────


def _find_store(job_id: str) -> JobStore | None:
    for store in stores.values():
        if store.get_job(job_id):
            return store
    return None


def _find_job(job_id: str) -> dict | None:
    for store in stores.values():
        job = store.get_job(job_id)
        if job is not None:
            return job
    return None


def _get_or_create_store(folder: Path) -> JobStore:
    key = str(folder)
    if key not in stores:
        store = JobStore(folder)
        stores[key] = store
        _reconcile_store(store)
    return stores[key]


def _reconcile_store(store: JobStore) -> None:
    """Mark persisted 'queued'/'running' jobs cancelled on startup.

    These are leftovers from a crashed process; their in-memory queue and photo
    cache are gone, so they can never resume. Flag them so the UI doesn't show
    hung jobs.
    """
    for job in store.list_jobs():
        if job.get("status") in ("queued", "scanning", "processing", "ai_culling"):
            store.update_job(job["jobId"], status="cancelled")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)