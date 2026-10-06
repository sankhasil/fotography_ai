"""Orchestration: discover -> classify -> copy sidecar -> record.

The main path writes XMP sidecar files next to each NEF so darktable's GUI
loads the preset automatically when the operator opens the NEF. Originals are
never modified. No Docker, no decode, no render in the main path -- the NEF
stays as the master with full raw latitude.

`decode()` and `render()` are retained for optional JPEG preview export but
are not called by `process_one()`. See ADR-0008 (pending).
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
from nef_editor.face import count_faces
from nef_editor.model import Category, PhotoRecord, SubStyle
from nef_editor.preview import mean_luminance
from nef_editor.presets import preset_name, select_sidecar
from nef_editor.store import Store

PIPELINE = "sidecar-copy-v1"
DARKTABLE_IMAGE = "nef-editor-darktable:1"
SOURCE_SUFFIXES = {".nef"}


@dataclass(frozen=True, slots=True)
class Options:
    """Everything the CLI can set. Frozen so a run cannot mutate its own config."""

    source: Path
    category: Category | None = None
    sub_style: SubStyle = SubStyle.NEUTRAL
    recursive: bool = False
    dry_run: bool = False
    force: bool = False
    db: Path | None = None
    only_unclassified: bool = False


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
    """Stage one: HE* NEF -> 16-bit linear TIFF, via Core Image CIRAWFilter.

    The capability is undocumented by Apple, so callers should probe once with
    a single file before committing a batch. See ADR-0006.
    """
    import Quartz
    from Foundation import NSURL

    dest.parent.mkdir(parents=True, exist_ok=True)
    f = Quartz.CIRAWFilter.alloc().initWithImageURL_(NSURL.fileURLWithPath_(str(src)))
    if f is None:
        raise RuntimeError(f"CIRAWFilter cannot decode {src.name}")
    f.setHighlightRecoveryEnabled_(True)
    f.setBoostAmount_(0.0)  # defeat tone curve for linear output
    img = f.outputImage()
    ctx = Quartz.CIContext.context()
    cs = Quartz.CGColorSpaceCreateWithName(Quartz.kCGColorSpaceLinearSRGB)
    ok = ctx.writeTIFFRepresentationOfImage_toURL_format_colorSpace_options_error_(
        img, NSURL.fileURLWithPath_(str(dest)),
        Quartz.kCIFormatRGBAh, cs, None, None)
    if not ok or not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError(f"CIRAWFilter failed for {src.name}")
    return dest


def render(decoded: Path, out_dir: Path, xmp: Path | None) -> Path:
    """Stage two: decoded TIFF -> corrected JPEG, via darktable-cli in Docker.

    If xmp is None, renders without correction (darktable's default development).
    If xmp is provided, it is mounted and passed as the 2nd positional arg.

    ponytail: darktable-cli 5.6.1 has no overwrite flag. Given an existing
    target it writes `name_01.jpg` and exits 0, so a stale file would survive
    and we would hash the *previous* output -- reporting a correction that
    never happened. Removing the target first is the only way to get the name
    we promised.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    written = out_dir / f"{decoded.stem}.jpg"
    written.unlink(missing_ok=True)

    cmd = ["docker", "run", "--rm",
           "-v", f"{decoded.parent}:/in:ro",
           "-v", f"{out_dir}:/out",
           "--entrypoint", "darktable-cli", DARKTABLE_IMAGE]

    if xmp is not None:
        cmd.extend(["-v", f"{xmp}:/preset.xmp:ro"])
        cmd.extend(["/in/" + decoded.name, "/preset.xmp", "/out", "--out-ext", "jpeg"])
    else:
        cmd.extend(["/in/" + decoded.name, "/out", "--out-ext", "jpeg"])

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not written.exists():
        raise RuntimeError(
            f"darktable-cli failed for {decoded.name} (exit {result.returncode}): "
            f"{(result.stderr or result.stdout).strip()[-400:]}"
        )
    return written


def process_one(path: Path, store: Store, opts: Options) -> PhotoRecord | None:
    """Process a single photograph. Returns the record, or None if skipped.

    Writes an XMP sidecar next to the NEF so darktable's GUI loads the preset
    when the operator opens the NEF. The NEF itself is never modified.
    """
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
    face_count = count_faces(path)
    lum = mean_luminance(path)
    result = classify(metadata, category=opts.category, sub_style=opts.sub_style,
                      only_unclassified=opts.only_unclassified,
                      face_count=face_count, luminance=lum)

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

    xmp = select_sidecar(result.category, result.sub_style)
    sidecar_dest: Path | None = None
    sidecar_hash: str | None = None
    reasons = result.reasons

    if xmp is not None:
        sidecar_dest = path.with_suffix(".xmp")
        try:
            shutil.copy(xmp, sidecar_dest)
            sidecar_hash = _sha256(sidecar_dest)
        except Exception as exc:  # noqa: BLE001 - one bad file must not stop the batch
            reasons = reasons + (f"FAILED: {exc}",)
            sidecar_dest, sidecar_hash = None, None

    record = PhotoRecord(
        source_path=path.name,
        source_mtime=stat.st_mtime,
        source_size=stat.st_size,
        category=result.category,
        sub_style=result.sub_style,
        reasons=reasons,
        correction=xmp.name if xmp else "",
        pipeline=PIPELINE,
        output_path=sidecar_dest.name if sidecar_dest else None,
        output_hash=sidecar_hash,
        tool_versions="{}",
        processed_at=_now(),
    )
    store.save(record)
    return record


def run(opts: Options) -> RunResult:
    """Process every discovered photograph."""
    result = RunResult()
    files = discover(opts.source, recursive=opts.recursive)

    db_path = opts.db or (opts.source / ".nef-editor" / "state.db")

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

            record = process_one(path, store, opts)
            if record is None:
                result.skipped += 1
            elif record.output_path is None:
                if record.category is Category.UNCLASSIFIED:
                    result.unclassified += 1
                elif any(r.startswith("FAILED:") for r in record.reasons):
                    result.failed += 1
                    result.errors.append(f"{path.name}: {record.reasons[-1]}")
                else:
                    # Classified but no preset sidecar exists yet. Not a failure.
                    result.processed += 1
            else:
                result.processed += 1

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
            decode(sample, Path(tmp) / "probe.tif")
            return True
    except Exception:  # noqa: BLE001
        return False


# Preset names are referenced by tests and the CLI help; re-export for convenience.
__all__ = [
    "Options",
    "RunResult",
    "decode",
    "discover",
    "preset_name",
    "probe_decoder",
    "process_one",
    "render",
    "run",
    "select_sidecar",
]

# Silence unused-import complaints for names re-exported above.
_ = os