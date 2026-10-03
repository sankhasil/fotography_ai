---
type: reference
title: NEF Photo Editor CLI — Database Schema
status: draft
date: 2026-10-02
part_of: ./plan.md
---

# Database Schema

SQLite via the standard library's `sqlite3`. No ORM, no migration framework, no second dependency.
The database is state for a single-operator tool on a single machine, not a service.

Location: `.nef-editor/state.db` inside the processed folder by default, overridable with `--db`.

## One table

There is one concept in this system — a photograph that has been processed — so there is one table.

```sql
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
```

| Column | Purpose |
|---|---|
| `source_path` | Path relative to the processed folder, so the database survives the folder being moved. |
| `source_mtime`, `source_size` | The idempotency key. Together they answer "has this file changed since we last processed it?" |
| `reasons` | JSON array of the signals that fired during classification, in evaluation order. This is what makes a run explainable. For an operator-assigned category it records the assignment and its source. |
| `correction` | The `--core` parameter set actually applied. Recorded rather than recomputed so a later preset change does not falsify history. |
| `pipeline` | The conversion path used, e.g. `imageio>darktable-5.6.1`. Makes a degraded or changed render identifiable after the fact. |
| `output_path` | Null when rendering failed. A failed photograph is recorded, not dropped. |
| `output_hash` | Hash of the written JPEG. Null on failure. |
| `tool_versions` | JSON object of tool versions, e.g. `{"imageio": "macos-26.6.2", "darktable": "5.6.1", "python": "3.11.9"}`. |
| `processed_at` | ISO 8601, UTC. |

`reasons` and `tool_versions` are stored as JSON text. SQLite's JSON functions are not required to
read them, and TEXT keeps the schema portable.

### Columns removed in revision 2

| Dropped | Why |
|---|---|
| `picture_control` | Lives in Nikon's proprietary `MakerNote`. Reading it required exiftool, which was deleted. See [ADR-0004](../../adr/0004-read-exif-in-pure-python.md). |
| `mode` | Revision 1 offered `sidecar` or `original`. Revision 2 always writes to a separate export folder and never touches the source, so there is no mode to record. |
| `engine` | Became `pipeline`, which records both stages rather than only the renderer. |

## Idempotency

The rule: **a photograph whose `source_mtime` and `source_size` match its recorded values is
skipped.**

```sql
SELECT source_mtime, source_size
FROM photos
WHERE source_path = ?;
```

Match both → skip, before any metadata read, classification, or render. Mismatch → reprocess and
overwrite the row. `--force` skips this check.

`ponytail:` `mtime` + `size` rather than a content hash. Hashing a 25 MB `.nef` costs 50–100 ms per
file on every run, and mtime + size catches every realistic edit — a changed photograph is rewritten
by the camera or an editor, which changes both. The failure mode is a deliberately preserved timestamp
on an edited file, which is not a workflow anyone has. Replace with a content hash only if that
workflow ever appears.

`processed_at` is a human-facing column only. Nothing depends on it: there is no run history, no
"processed yesterday" query, and no scheduled re-processing.

## Upsert, not append

Reprocessing overwrites the row in place. There is deliberately **no history table**.

The consequence, stated plainly: after a photograph is reprocessed, the record of its previous
processing is gone. If you need to answer "what did the first run decide, before I corrected the
preset?", this schema cannot answer it.

`ponytail:` a single table is the smallest thing that satisfies "record what happened". History is
added when someone actually asks the question above, not before. If it is added, it is a `runs` table
plus a foreign key — not a schema rewrite.

## Indexes

One index: the `UNIQUE` constraint on `source_path`, which already serves the only lookup this tool
performs. Queries here are single-row point lookups by path; no other index earns its write cost on a
table that will hold thousands of rows.

## Failure recording

A photograph that fails is written with `output_path` and `output_hash` null and the failure reason
appended to `reasons`. Failures are visible in the database and in the run summary.

This is deliberate. A photograph silently missing from the database is indistinguishable from a
photograph that was never in the folder — and the operator cannot tell whether the tool lost a file
or never saw it.

**Contract:** the batch never aborts because one photograph failed. Processing continues, and the
summary reports failures by count and by path.