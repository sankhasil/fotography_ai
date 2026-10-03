"""SQLite state for processed photographs.

One table, one row per photograph, keyed on source mtime + size. See
database.md for the schema and the reasoning.

Standard library only. No ORM, no migration framework — this is state for a
single-operator tool on one machine, not a service.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from nef_editor.model import Category, PhotoRecord, SubStyle

_SCHEMA = """
CREATE TABLE IF NOT EXISTS photos (
    id               INTEGER PRIMARY KEY,
    source_path      TEXT    NOT NULL UNIQUE,
    source_mtime     REAL    NOT NULL,
    source_size      INTEGER NOT NULL,

    category         TEXT    NOT NULL,
    sub_style        TEXT    NOT NULL,
    reasons          TEXT    NOT NULL,

    correction       TEXT    NOT NULL,
    pipeline         TEXT    NOT NULL,

    output_path      TEXT,
    output_hash      TEXT,
    tool_versions    TEXT    NOT NULL,

    processed_at     TEXT    NOT NULL
);
"""

_COLUMNS = (
    "source_path, source_mtime, source_size, category, sub_style, reasons, "
    "correction, pipeline, output_path, output_hash, tool_versions, processed_at"
)


class Store:
    """Persistence for processed photographs.

    Use as a context manager, or call close() explicitly.
    """

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def __enter__(self) -> Store:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        """Idempotent — closing twice is not an error."""
        if self._conn is not None:
            self._conn.commit()
            self._conn.close()
            self._conn = None  # type: ignore[assignment]

    def needs_processing(self, record: PhotoRecord, *, force: bool = False) -> bool:
        """Has this file changed since we last processed it?

        Both mtime and size must match. `force` skips the check entirely.
        """
        if force:
            return True
        row = self._conn.execute(
            "SELECT source_mtime, source_size FROM photos WHERE source_path = ?",
            (record.source_path,),
        ).fetchone()
        if row is None:
            return True
        return (
            float(row["source_mtime"]) != record.source_mtime
            or int(row["source_size"]) != record.source_size
        )

    def save(self, record: PhotoRecord) -> None:
        """Insert or overwrite one photograph."""
        self._conn.execute(
            f"INSERT OR REPLACE INTO photos ({_COLUMNS}) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                record.source_path,
                record.source_mtime,
                record.source_size,
                record.category.value,
                record.sub_style.value,
                json.dumps(list(record.reasons)),
                record.correction,
                record.pipeline,
                record.output_path,
                record.output_hash,
                record.tool_versions,
                record.processed_at,
            ),
        )
        self._conn.commit()

    def all_records(self) -> list[PhotoRecord]:
        """Every row, ordered by source path for stable output."""
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM photos ORDER BY source_path"
        ).fetchall()
        return [_to_record(row) for row in rows]


def _to_record(row: sqlite3.Row) -> PhotoRecord:
    return PhotoRecord(
        source_path=row["source_path"],
        source_mtime=float(row["source_mtime"]),
        source_size=int(row["source_size"]),
        category=Category(row["category"]),
        sub_style=SubStyle(row["sub_style"]),
        reasons=tuple(json.loads(row["reasons"])),
        correction=row["correction"],
        pipeline=row["pipeline"],
        output_path=row["output_path"],
        output_hash=row["output_hash"],
        tool_versions=row["tool_versions"],
        processed_at=row["processed_at"],
    )