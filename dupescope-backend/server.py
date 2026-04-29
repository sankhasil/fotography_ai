# server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
from dupescope import find_exact_dupes, find_perceptual_dupes, scan_images
import threading
import uuid

jobs = {}


app = Flask(__name__)
CORS(app)          # allow the React dev server to call this

@app.errorhandler(Exception)
def handle_error(e):
    return jsonify({
        "error": str(e),
        "type": e.__class__.__name__
    }), 500


@app.route("/scan/start", methods=["POST"])
def start_scan():
    body = request.json
    job_id = str(uuid.uuid4())

    jobs[job_id] = {
        "progress": 0,
        "status": "running",
        "result": None,
        "error": None
    }

    def worker():
        try:
            folder = Path(body.get("folder", "")).expanduser().resolve()
            mode = body.get("mode", "both")
            threshold = int(body.get("threshold", 10))
            recursive = body.get("recursive", True)

            images = scan_images(folder, recursive=recursive)

            total = len(images)

            # ---- simulate progress hooks ----
            def update(p):
                jobs[job_id]["progress"] = p

            # EXACT
            exact = {}
            if mode in ("exact", "both"):
                for i, (h, paths) in enumerate(find_exact_dupes(images).items()):
                    update(int((i / max(1, total)) * 50))

                exact = find_exact_dupes(images)

            # PERCEPTUAL
            perceptual = []
            if mode in ("perceptual", "both"):
                perceptual = find_perceptual_dupes(images, threshold)
                update(90)

            # build response
            def finfo(p):
                s = p.stat()
                return {
                    "name": p.name,
                    "path": str(p),
                    "size": f"{s.st_size / 1_048_576:.1f} MB",
                    "date": str(p.stat().st_mtime)[:10],
                }

            groups = []
            gid = 1

            for h, paths in exact.items():
                groups.append({
                    "id": gid,
                    "type": "exact",
                    "files": [finfo(p) for p in paths]
                })
                gid += 1

            for cluster in perceptual:
                groups.append({
                    "id": gid,
                    "type": "similar",
                    "files": [finfo(p) for p in cluster]
                })
                gid += 1

            jobs[job_id]["result"] = {
                "groups": groups,
                "total": len(images)
            }
            jobs[job_id]["progress"] = 100
            jobs[job_id]["status"] = "done"

        except Exception as e:
            jobs[job_id]["error"] = str(e)
            jobs[job_id]["status"] = "error"

    threading.Thread(target=worker).start()

    return jsonify({"job_id": job_id})

@app.route("/scan/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)

    if not job:
        return jsonify({"error": "Invalid job id"}), 404

    return jsonify(job)

@app.route("/scan/result/<job_id>")
def result(job_id):
    job = jobs.get(job_id)

    if not job:
        return jsonify({"error": "Invalid job id"}), 404

    if job["status"] != "done":
        return jsonify({"error": "Not ready"}), 400

    return jsonify(job["result"])

@app.route("/scan", methods=["POST"])
def scan():
    try:
        body    = request.json
        folder  = body.get("folder", "")
        mode    = body.get("mode", "both")
        threshold = int(body.get("threshold", 10))
        recursive = body.get("recursive", True)

        folder_path = Path(folder).expanduser().resolve()
        if not folder_path.exists():
            return jsonify({"error": f"Folder not found: {folder}"}), 400

        images = scan_images(folder_path, recursive=recursive)

        exact      = find_exact_dupes(images)      if mode in ("exact", "both")      else {}
        perceptual = find_perceptual_dupes(images, threshold) if mode in ("perceptual", "both") else []

        # Shape the response to match what the React UI expects
        def finfo(p):
            s = p.stat()
            return {
                "name": p.name,
                "path": str(p),
                "size": f"{s.st_size / 1_048_576:.1f} MB",
                "date": str(p.stat().st_mtime)[:10],
            }

        groups = []
        gid = 1
        for h, paths in exact.items():
            groups.append({"id": gid, "type": "exact", "hash": h[:20]+"…",
                        "files": [finfo(p) for p in paths]})
            gid += 1
        for cluster in perceptual:
            groups.append({"id": gid, "type": "similar", "similarity": 90,
                        "files": [finfo(p) for p in cluster]})
            gid += 1

        return jsonify({"groups": groups, "total": len(images)})

    except Exception as e:
         return jsonify({
            "error": str(e),
            "type": e.__class__.__name__
        }), 500

if __name__ == "__main__":
    app.run(port=5000)