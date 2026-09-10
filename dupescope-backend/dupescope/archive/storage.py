import sqlite3
import json
from datetime import datetime
from pathlib import Path
from threading import Lock


class JobStore:
    """SQLite-backed job persistence. One DB per scanned folder in .dupescope/."""

    def __init__(self, folder: Path):
        db_dir = folder / ".dupescope"
        db_dir.mkdir(exist_ok=True)
        self.db_path = db_dir / "history.db"
        self._lock = Lock()
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    folder TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',
                    mode TEXT DEFAULT 'both',
                    threshold INTEGER DEFAULT 10,
                    recursive INTEGER DEFAULT 1,
                    ai_cull INTEGER DEFAULT 0,
                    auto_archive INTEGER DEFAULT 0,
                    test_mode INTEGER DEFAULT 0,
                    approved INTEGER DEFAULT 0,
                    archived INTEGER DEFAULT 0,
                    reverted INTEGER DEFAULT 0,
                    report_data TEXT,
                    archive_log TEXT DEFAULT '[]',
                    undo_log TEXT DEFAULT '[]',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.db_path))

    def create_job(self, job_id: str, folder: str, **kwargs) -> dict:
        now = datetime.now().isoformat()
        job = {
            "jobId": job_id,
            "folder": folder,
            "status": "queued",
            "mode": kwargs.get("mode", "both"),
            "threshold": kwargs.get("threshold", 10),
            "recursive": kwargs.get("recursive", True),
            "ai_cull": kwargs.get("ai_cull", False),
            "auto_archive": kwargs.get("auto_archive", False),
            "test_mode": kwargs.get("test_mode", False),
            "reportData": None,
            "archive_log": [],
            "undo_log": [],
            "error": None,
            "created_at": now,
            "completed_at": None,
            "actions": {"approved": False, "archived": False, "reverted": False},
        }
        with self._lock, self._conn() as conn:
            conn.execute(
                """INSERT INTO jobs
                   (job_id, folder, status, mode, threshold, recursive, ai_cull,
                    auto_archive, test_mode, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (job_id, folder, "queued", job["mode"], job["threshold"],
                 int(job["recursive"]), int(job["ai_cull"]),
                 int(job["auto_archive"]), int(job["test_mode"]), now),
            )
        return job

    def get_job(self, job_id: str) -> dict | None:
        with self._lock, self._conn() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if not row:
                return None
            return self._row_to_dict(row)

    def update_job(self, job_id: str, **updates) -> dict | None:
        sets = []
        values = []
        for key, val in updates.items():
            db_key = self._python_to_db_key(key)
            if db_key:
                if isinstance(val, (dict, list)):
                    val = json.dumps(val)
                elif isinstance(val, bool):
                    val = int(val)
                sets.append(f"{db_key} = ?")
                values.append(val)
        if not sets:
            return self.get_job(job_id)
        values.append(job_id)
        with self._lock, self._conn() as conn:
            conn.execute(
                f"UPDATE jobs SET {', '.join(sets)} WHERE job_id = ?",
                values,
            )
        return self.get_job(job_id)

    def list_jobs(self, limit: int = 50, terminal_limit: int = 10) -> list[dict]:
        # ponytail: Active jobs always surface (live queue); done jobs are
        # capped so a long history can't bury the queue. Rows only drop off
        # the listing, never the DB — undo/reopen still works.
        with self._lock, self._conn() as conn:
            conn.row_factory = sqlite3.Row
            active = conn.execute(
                "SELECT * FROM jobs WHERE status NOT IN "
                "('processed','archived','reverted','error','cancelled') "
                "ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            terminal = conn.execute(
                "SELECT * FROM jobs WHERE status IN "
                "('processed','archived','reverted','error','cancelled') "
                "ORDER BY created_at DESC LIMIT ?",
                (terminal_limit,),
            ).fetchall()
            return (
                [self._row_to_dict(r) for r in active]
                + [self._row_to_dict(r) for r in terminal]
            )

    def _row_to_dict(self, row: sqlite3.Row) -> dict:
        d = dict(row)
        job_id = d.pop("job_id", None)
        d["jobId"] = job_id
        for field in ("report_data", "archive_log", "undo_log"):
            python_key = self._db_to_python_key(field)
            val = d.pop(field, None)
            if val and isinstance(val, str):
                d[python_key] = json.loads(val)
            else:
                d[python_key] = json.loads(val) if val else ([] if "log" in field else None)
        d["actions"] = {
            "approved": bool(d.pop("approved", False)),
            "archived": bool(d.pop("archived", False)),
            "reverted": bool(d.pop("reverted", False)),
        }
        for bool_field in ("recursive", "ai_cull", "auto_archive", "test_mode"):
            if bool_field in d:
                d[bool_field] = bool(d[bool_field])
        return d

    @staticmethod
    def _python_to_db_key(key: str) -> str | None:
        mapping = {
            "status": "status",
            "reportData": "report_data",
            "archive_log": "archive_log",
            "undo_log": "undo_log",
            "error": "error",
            "completed_at": "completed_at",
            "approved": "approved",
            "archived": "archived",
            "reverted": "reverted",
        }
        return mapping.get(key)

    @staticmethod
    def _db_to_python_key(db_key: str) -> str:
        mapping = {
            "report_data": "reportData",
            "archive_log": "archive_log",
            "undo_log": "undo_log",
        }
        return mapping.get(db_key, db_key)
