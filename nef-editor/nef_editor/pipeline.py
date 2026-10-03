"""Orchestration: discover -> decode -> render -> stamp -> record.

Two subprocess stages and the bookkeeping around them. No engine abstraction:
`sips` and `darktable-cli` are called directly, and each is a plain function so
tests can substitute it with monkeypatch.

Stage one runs on the host because macOS ImageIO decodes HE* natively and no
open-source decoder exists. Stage two runs in Docker where darktable 5.6.1 is
pinned. See ADR-0006 and ADR-0003.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from nef_editor.classify import classify
from nef_editor.exif import read_metadata, write_category
from nef_editor.model import Category, PhotoRecord, SubStyle
from nef_editor.presets import build_correction, preset_name
from nef_editor.store import Store

PIPELINE = "imageio>darktable-5.6.1"
DARKTABLE_IMAGE = "nef-editor-darktable:1"
SOURCE_SUFFIXES = {".nef"}


@dataclass(frozen=True, slots=True)
class Options:
    """Everything the CLI can set. Frozen so a run cannot mutate its own config."""

    source: Path
    out: Path
    category: Category | None = None
    sub_style: SubStyle = SubStyle.NEUTRAL
    recursive: bool = False
    dry_run: bool = False
    force: bool = False
    db: Path | None = None
    keep_intermediates: bool = False
    work: Path | None = None


@dataclass(slots=True)
class RunResult:
    processed: int = 0
    skipped: int = 0
    unclassified: int = 0
    failed: int = 0
    would_process: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        if self.dry_run_probe():
            return (
                f"would process {self.would_process}, "
                f"skip {self.skipped}, unclassified {self.unclassified}"
            )
        return (
            f"processed {self.processed}, skipped {self.skipped}, "
            f"unclassified {self.unclassified}, failed {self.failed}"
        )

    def dry_run_probe(self) -> bool:
        return self.processed == 0 and self.would_process > 0


def discover(source: Path, *, recursive: bool) -> list[Path]:
    """Find .nef files, sorted for deterministic runs."""
    pattern = "**/*" if recursive else "*"
    found = (
        p for p in source.glob(pattern)
        if p.is_file() and p.suffix.lower() in SOURCE_SUFFIXES
    )
    return sorted(found)


def decode(src: Path, dest: Path) -> Path:
    """Stage one: HE* NEF -> rendered JPEG, via macOS ImageIO.

    The capability is undocumented by Apple, so callers should probe once with
    a single file before committing a batch. See ADR-0006.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["sips", "-s", "format", "jpeg", str(src), "--out", str(dest)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError(
            f"sips failed for {src.name} (exit {result.returncode}): "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )
    return dest


def render(decoded: Path, out_dir: Path, correction: str) -> Path:
    """Stage two: decoded JPEG -> corrected JPEG, via darktable-cli in Docker.

    `correction` is a single `--core` string. Multiple `--core` flags are
    rejected by darktable-cli, so modules are semicolon-separated.

    ponytail: darktable-cli 5.6.1 has no overwrite flag. Given an existing
    target it writes `name_01.jpg` and exits 0, so a stale file would survive
    and we would hash the *previous* output — reporting a correction that never
    happened. Removing the target first is the only way to get the name we
    promised.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    written = out_dir / f"{decoded.stem}.jpg"
    written.unlink(missing_ok=True)
    result = subprocess.run(
        [
            "docker", "run", "--rm",
            "-v", f"{decoded.parent}:/in:ro",
            "-v", f"{out_dir}:/out",
            "--entrypoint", "sh", DARKTABLE_IMAGE, "-c",
            f'darktable-cli "/in/{decoded.name}" /out --core "{correction}"',
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not written.exists():
        raise RuntimeError(
            f"darktable-cli failed for {decoded.name} (exit {result.returncode}): "
            f"{(result.stderr or result.stdout).strip()[-400:]}"
        )
    return written


def process_one(path: Path, store: Store, opts: Options, work: Path) -> PhotoRecord | None:
    """Process a single photograph. Returns the record, or None if skipped."""
    stat = path.stat()
    probe = PhotoRecord(
        source_path=path.name,
        source_mtime=stat.st_mtime,
        source_size=stat.st_size,
        category=Category.UNCLASSIFIED,
        sub_style=opts.sub_style,
        reasons=(),
        correction="",
        pipeline=PIPELINE,
    )
    if not store.needs_processing(probe, force=opts.force):
        return None

    metadata = read_metadata(path)
    result = classify(metadata, category=opts.category, sub_style=opts.sub_style)

    if result.category is Category.UNCLASSIFIED:
        record = PhotoRecord(
            source_path=path.name,
            source_mtime=stat.st_mtime,
            source_size=stat.st_size,
            category=result.category,
            sub_style=result.sub_style,
            reasons=result.reasons,
            correction="",
            pipeline=PIPELINE,
            processed_at=_now(),
        )
        store.save(record)
        return record

    correction = build_correction(result.category, result.sub_style)
    decoded = work / f"{path.stem}.jpg"
    output: Path | None = None
    output_hash: str | None = None
    reasons = result.reasons

    try:
        decode(path, decoded)
        output = render(decoded, opts.out / result.category.value, correction)
        write_category(output, result.category.value)
        output_hash = _sha256(output)
    except Exception as exc:  # noqa: BLE001 - one bad file must not stop the batch
        reasons = reasons + (f"FAILED: {exc}",)
        output, output_hash = None, None

    record = PhotoRecord(
        source_path=path.name,
        source_mtime=stat.st_mtime,
        source_size=stat.st_size,
        category=result.category,
        sub_style=result.sub_style,
        reasons=reasons,
        correction=correction if output else "",
        pipeline=PIPELINE,
        output_path=_relative(output, opts.out),
        output_hash=output_hash,
        tool_versions=json.dumps(_tool_versions()),
        processed_at=_now(),
    )
    store.save(record)

    if not opts.keep_intermediates:
        decoded.unlink(missing_ok=True)
    return record


def run(opts: Options) -> RunResult:
    """Process every discovered photograph."""
    result = RunResult()
    files = discover(opts.source, recursive=opts.recursive)
    opts.out.mkdir(parents=True, exist_ok=True)
    db_path = opts.db or (opts.out / ".nef-editor" / "state.db")

    work_ctx = (
        tempfile.TemporaryDirectory(prefix="nef-editor-")
        if opts.work is None
        else None
    )
    work_root = Path(opts.work) if opts.work else Path(work_ctx.name)  # type: ignore[union-attr]
    work_root.mkdir(parents=True, exist_ok=True)

    try:
        with Store(db_path) as store:
            for path in files:
                if opts.dry_run:
                    stat = path.stat()
                    probe = PhotoRecord(
                        source_path=path.name,
                        source_mtime=stat.st_mtime,
                        source_size=stat.st_size,
                        category=Category.UNCLASSIFIED,
                        sub_style=opts.sub_style,
                        reasons=(),
                        correction="",
                        pipeline=PIPELINE,
                    )
                    if store.needs_processing(probe, force=opts.force):
                        result.would_process += 1
                    else:
                        result.skipped += 1
                    continue

                record = process_one(path, store, opts, work_root)
                if record is None:
                    result.skipped += 1
                elif record.output_path is None:
                    # An unclassified file was never renderable by design; any
                    # other file with no output is a genuine failure.
                    if record.category is Category.UNCLASSIFIED:
                        result.unclassified += 1
                    else:
                        result.failed += 1
                        result.errors.append(f"{path.name}: {record.reasons[-1]}")
                else:
                    result.processed += 1
    finally:
        if work_ctx is not None:
            work_ctx.cleanup()

    return result


# --- helpers ---------------------------------------------------------------------


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _relative(path: Path | None, root: Path) -> str | None:
    if path is None:
        return None
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _tool_versions() -> dict[str, str]:
    versions = {"python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"}
    for name, cmd in (("darktable", ["docker", "run", "--rm", "--entrypoint",
                                      "darktable-cli", DARKTABLE_IMAGE, "--version"]),
                      ("sips", ["sips", "--version"])):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            versions[name] = (out.stdout or out.stderr).strip().splitlines()[0]
        except Exception:  # noqa: BLE001 - version reporting must never fail a run
            versions[name] = "unknown"
    return versions


def probe_decoder(sample: Path) -> bool:
    """Can this machine decode a HE* file at all?

    The capability is undocumented by Apple and could be withdrawn. Checked once
    per run so the failure is loud and early rather than 209 identical errors.
    """
    if shutil.which("sips") is None:
        return False
    try:
        with tempfile.TemporaryDirectory(prefix="nef-probe-") as tmp:
            decode(sample, Path(tmp) / "probe.jpg")
            return True
    except Exception:  # noqa: BLE001
        return False


# Preset names are referenced by tests and the CLI help; re-export for convenience.
__all__ = [
    "Options",
    "RunResult",
    "build_correction",
    "decode",
    "discover",
    "preset_name",
    "probe_decoder",
    "process_one",
    "render",
    "run",
]

# Silence unused-import complaints for names re-exported above.
_ = os