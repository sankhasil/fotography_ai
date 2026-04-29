#!/usr/bin/env python3
"""
DupeScope API Server (Unified Async + AI + Archive + Undo)
===========================================================

Pipeline:
  scanning → processing → ai_culling → processed → archiving → archived

Features:
  - Async job system
  - WebSocket live updates
  - AI culling integration
  - Manual approval gate
  - Safe archiving (_ARCHIVED next to files)
  - Undo system (restore moved files)
"""

import os
import signal
import sys
import uuid
import json
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO

from dupescope import (
    scan_images,
    find_exact_dupes,
    find_perceptual_dupes,
    ai_cull,
    fmt_bytes,
)

# ─────────────────────────────────────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

cache_lock = threading.Lock()

cache = {
    "photos": {},
    "jobs": {}
}

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def ts():
    return datetime.now().isoformat()


def photo_id(p: Path):
    return p.name


def scan(folder: Path, recursive=True):
    return scan_images(folder, recursive=recursive)


def emit(job_id, status, extra=None):
    socketio.emit("job_update", {
        "jobId": job_id,
        "status": status,
        "extra": extra or {}
    })


def update_cache(images, job_id):
    with cache_lock:
        for p in images:
            pid = photo_id(p)
            if pid not in cache["photos"]:
                cache["photos"][pid] = {
                    "path": str(p),
                    "processed": False,
                    "job_id": job_id,
                    "marked_delete": False,
                    "moved_to": None
                }


def mark_processed(images, job_id):
    with cache_lock:
        for p in images:
            pid = photo_id(p)
            if pid in cache["photos"]:
                cache["photos"][pid]["processed"] = True
                cache["photos"][pid]["job_id"] = job_id


# ─────────────────────────────────────────────────────────────────────────────
# JOB START
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/scan/start", methods=["POST"])
def start_scan():
    body = request.json or {}

    folder = Path(body.get("folder", "")).expanduser().resolve()
    mode = body.get("mode", "both")
    threshold = int(body.get("threshold", 10))
    recursive = body.get("recursive", True)
    run_ai = bool(body.get("ai_cull", False))
    auto_archive = bool(body.get("auto_archive", False))
    limit = int(body.get("limit", 100))
    offset = int(body.get("offset", 0))

    is_test_mode = body.get("test_mode", False)

    job_id = str(uuid.uuid4())
    
    if is_test_mode:
        job = {}
        fake_report = {
            "jobId": job_id,
            "aiKeep": [],
            "aiDelete": [],
            "exactGroups": 0,
            "similarGroups": 0,
            "testMode": True
        }
        
        with cache_lock:
            cache["jobs"][job_id] = job
            cache["jobs"][job_id]["status"] = "processed"
            cache["jobs"][job_id]["reportData"] = fake_report
            cache["jobs"][job_id]["completedAt"] = ts()

        emit(job_id, "processed")

        return jsonify({"job_id": job_id})
    
    if not folder.exists():
        return jsonify({"error": "Folder not found"}), 404

    images = scan(folder, recursive)
    total = len(images)

    start = offset * limit
    batch = images[start:start + limit]


    job = {
        "jobId": job_id,
        "status": "queued",
        "folder": str(folder),
        "mode": mode,
        "threshold": threshold,
        "is_test_mode" : is_test_mode,
        "ai_cull": run_ai,
        "auto_archive": auto_archive,
        "offset": offset,
        "limit": limit,
        "total": total,
        "startedAt": ts(),

        "actions": {
            "approved": False,
            "archived": False,
            "reverted": False
        },

        "reportData": None,
        "archive_log": [],
        "undo_log": [],
        "error": None
    }

    with cache_lock:
        cache["jobs"][job_id] = job
    
    update_cache(images, job_id)

    # ─────────────────────────────────────────────────────────────────────────
    # WORKER
    # ─────────────────────────────────────────────────────────────────────────

    def worker():
        try:
            emit(job_id, "scanning")
            with cache_lock:
                cache["jobs"][job_id]["status"] = "scanning"

            work = batch

            emit(job_id, "processing")
            with cache_lock:
                cache["jobs"][job_id]["status"] = "processing"

            exact = {}
            perceptual = []

            if mode in ("exact", "both"):
                exact = find_exact_dupes(work)

            if mode in ("perceptual", "both"):
                perceptual = find_perceptual_dupes(work, threshold)

            emit(job_id, "ai_culling")
            with cache_lock:
                cache["jobs"][job_id]["status"] = "ai_culling"

            ai_keep, ai_delete = [], []

            if run_ai:
                res = ai_cull(work)
                ai_keep = [r for r in res if r.get("keep")]
                ai_delete = [r for r in res if not r.get("keep")]

            # ─────────────────────────────────────────────────────────────
            # processed (REVIEW GATE)
            # ─────────────────────────────────────────────────────────────

            report = {
                "jobId": job_id,
                "aiKeep": ai_keep,
                "aiDelete": ai_delete,
                "exactGroups": len(exact),
                "similarGroups": len(perceptual)
            }

            with cache_lock:
                cache["jobs"][job_id]["status"] = "processed"
                cache["jobs"][job_id]["reportData"] = report

            emit(job_id, "processed")

            # ─────────────────────────────────────────────────────────────
            # WAIT FOR APPROVAL (unless auto_archive)
            # ─────────────────────────────────────────────────────────────

            while True:
                with cache_lock:
                    approved = cache["jobs"][job_id]["actions"]["approved"]
                    auto = cache["jobs"][job_id]["auto_archive"]

                if approved or auto:
                    break

                time.sleep(1)

            # ─────────────────────────────────────────────────────────────
            # ARCHIVING
            # ─────────────────────────────────────────────────────────────

            emit(job_id, "archiving")

            archive_log = []

            for item in ai_delete:
                try:
                    src = Path(item["path"])
                    if not src.exists():
                        continue

                    archive_dir = src.parent / "_ARCHIVED"
                    archive_dir.mkdir(exist_ok=True)

                    dst = archive_dir / src.name

                    if dst.exists():
                        dst = archive_dir / f"{src.stem}_{int(time.time())}{src.suffix}"

                    shutil.move(str(src), str(dst))

                    archive_log.append({"from": str(src), "to": str(dst)})

                    with cache_lock:
                        pid = photo_id(src)
                        if pid in cache["photos"]:
                            cache["photos"][pid]["moved_to"] = str(dst)

                except Exception as e:
                    archive_log.append({"error": str(e)})

            with cache_lock:
                cache["jobs"][job_id]["archive_log"] = archive_log
                cache["jobs"][job_id]["status"] = "archived"
                cache["jobs"][job_id]["actions"]["archived"] = True
                cache["jobs"][job_id]["completedAt"] = ts()

            emit(job_id, "archived")

        except Exception as e:
            with cache_lock:
                cache["jobs"][job_id]["status"] = "error"
                cache["jobs"][job_id]["error"] = str(e)

            emit(job_id, "error", {"error": str(e)})

    threading.Thread(target=worker, daemon=True).start()

    return jsonify({"job_id": job_id})


# ─────────────────────────────────────────────────────────────────────────────
# JOB STATUS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/jobs/<job_id>", methods=["GET"])
def job_status(job_id):
    with cache_lock:
        job = cache["jobs"].get(job_id)

    if not job:
        return jsonify({"error": "not found"}), 404

    return jsonify(job)


# ─────────────────────────────────────────────────────────────────────────────
# APPROVE JOB
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/jobs/<job_id>/approve", methods=["POST"])
def approve(job_id):
    with cache_lock:
        if job_id in cache["jobs"]:
            cache["jobs"][job_id]["actions"]["approved"] = True

    return jsonify({"status": "approved"})



# ─────────────────────────────────────────────────────────────────────────────
# JOB REPORT
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/jobs/<job_id>/report", methods=["GET"])
def get_report(job_id):
    with cache_lock:
        job = cache["jobs"].get(job_id)

    if not job:
        return jsonify({"error": "not found"}), 404

    if not job.get("reportData"):
        return jsonify({"error": "report not ready"}), 400

    return jsonify(job["reportData"])


# ─────────────────────────────────────────────────────────────────────────────
# MARK DELETE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/jobs/<job_id>/mark-delete", methods=["POST"])
def mark_delete(job_id):
    body = request.json or {}
    file_ids = body.get("file_ids", [])

    with cache_lock:
        job = cache["jobs"].get(job_id)
        if not job:
            return jsonify({"error": "not found"}), 404

        # mark files in cache
        for pid, meta in cache["photos"].items():
            if pid in file_ids:
                meta["marked_delete"] = True

    return jsonify({"status": "marked", "count": len(file_ids)})

# ─────────────────────────────────────────────────────────────────────────────
# DELETE / ARCHIVE
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/jobs/<job_id>/delete", methods=["POST"])
def delete_files(job_id):
    body = request.json or {}
    file_ids = body.get("file_ids", [])

    moved = []

    for fid in file_ids:
        with cache_lock:
            meta = cache["photos"].get(fid)

        if not meta:
            continue

        try:
            src = Path(meta["path"])
            if not src.exists():
                continue

            archive_dir = src.parent / "_ARCHIVED"
            archive_dir.mkdir(exist_ok=True)

            dst = archive_dir / src.name
            if dst.exists():
                dst = archive_dir / f"{src.stem}_{int(time.time())}{src.suffix}"

            shutil.move(str(src), str(dst))

            with cache_lock:
                meta["moved_to"] = str(dst)
                meta["marked_delete"] = True

            moved.append({"from": str(src), "to": str(dst)})

        except Exception as e:
            moved.append({"error": str(e), "file": fid})

    return jsonify({"moved": moved})

# ─────────────────────────────────────────────────────────────────────────────
# UNDO ARCHIVE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/jobs/<job_id>/undo", methods=["POST"])
def undo(job_id):
    with cache_lock:
        job = cache["jobs"].get(job_id)

    if not job:
        return jsonify({"error": "not found"}), 404

    restored = []

    for entry in job.get("archive_log", []):
        try:
            src = Path(entry["to"])
            dst = Path(entry["from"])

            if src.exists():
                shutil.move(str(src), str(dst))
                restored.append(entry)

        except:
            pass

    with cache_lock:
        job["status"] = "reverted"
        job["actions"]["reverted"] = True

    return jsonify({"restored": restored})


# ─────────────────────────────────────────────────────────────────────────────
# SOCKET HEALTH
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok", "time": ts()})


# ─────────────────────────────────────────────────────────────────────────────
# PHOTO COUNT
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/photos/count", methods=["GET","OPTIONS"])
def photos_count():
    folder = request.args.get("folder", "")
    recursive = request.args.get("recursive", "true") == "true"

    path = Path(folder).expanduser()

    if not path.exists():
        return jsonify({"error": "Folder not found"}), 404

    try:
        images = scan(path, recursive)

        total = len(images)

        # simple mock for now
        processed = 0
        unprocessed = total

        return jsonify({
            "total": total,
            "processed": processed,
            "unprocessed": unprocessed
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# RUN SERVER
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("DupeScope Unified Server running...")
    socketio.run(app, port=5000, debug=False)


def handle_exit(sig, frame):
    print("\n[server] shutting down...")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)