"""Behaviour of the pipeline: discover, decode, render, batch.

Maps to acceptance criteria 5, 6, 8, 9, 10, 13 and 14.

These tests substitute `decode` and `render` so the orchestration logic runs
without sips or Docker. The real binaries are exercised by
tests/test_integration.py, which skips when they are unavailable.
"""

from __future__ import annotations

import base64
import hashlib
from pathlib import Path

import pytest

from nef_editor import pipeline
from nef_editor.model import Category, PhotoRecord, SubStyle
from nef_editor.pipeline import Options, discover, process_one, run

#: A genuinely valid 1x1 baseline JPEG, so write_category can operate on it.
JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
)


def _nef(path: Path, *, iso_bytes: int = 2048) -> Path:
    """A stand-in source file. Content is irrelevant; only stat data is used."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"NEF" + bytes([iso_bytes % 251]) * 512)
    return path


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def fake_stages(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict:
    """Replace both subprocess stages with local fakes that record their calls."""
    calls: dict[str, list] = {"decode": [], "render": []}

    def fake_decode(src: Path, dest: Path) -> Path:
        calls["decode"].append((src, dest))
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(JPEG)
        return dest

    def fake_render(src: Path, out_dir: Path, correction: str) -> Path:
        calls["render"].append((src, out_dir, correction))
        out_dir.mkdir(parents=True, exist_ok=True)
        written = out_dir / f"{src.stem}.jpg"
        written.write_bytes(JPEG)
        return written

    monkeypatch.setattr(pipeline, "decode", fake_decode)
    monkeypatch.setattr(pipeline, "render", fake_render)
    return calls


# --- discovery ------------------------------------------------------------------


def test_discover_finds_nef_files(tmp_path: Path) -> None:
    _nef(tmp_path / "a.NEF")
    _nef(tmp_path / "b.nef")
    (tmp_path / "notes.txt").write_text("ignore me")
    assert len(discover(tmp_path, recursive=False)) == 2


def test_discover_skips_subfolders_by_default(tmp_path: Path) -> None:
    _nef(tmp_path / "a.NEF")
    _nef(tmp_path / "sub" / "b.NEF")
    assert len(discover(tmp_path, recursive=False)) == 1
    assert len(discover(tmp_path, recursive=True)) == 2


# --- criterion 8: output location ------------------------------------------------


def test_output_goes_to_a_category_folder(fake_stages: dict, tmp_path: Path) -> None:
    src = _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", out=tmp_path / "exported",
                category=Category.PORTRAIT))
    assert (tmp_path / "exported" / "portrait" / "a.jpg").exists()


def test_nothing_is_written_beside_the_original(fake_stages: dict, tmp_path: Path) -> None:
    """The originals folder must gain no files at all."""
    srcdir = tmp_path / "src"
    src = _nef(srcdir / "a.NEF")
    run(Options(source=srcdir, out=tmp_path / "exported", category=Category.NIGHT))
    assert sorted(p.name for p in srcdir.iterdir()) == ["a.NEF"]


# --- criterion 9: the original is untouched --------------------------------------


def test_source_file_is_byte_identical_after_a_run(fake_stages: dict, tmp_path: Path) -> None:
    srcdir = tmp_path / "src"
    src = _nef(srcdir / "a.NEF")
    before = _sha(src)
    run(Options(source=srcdir, out=tmp_path / "exported", category=Category.NIGHT))
    assert _sha(src) == before


# --- criterion 13: the correction reaches the renderer ----------------------------


def test_render_receives_a_non_empty_core_string(fake_stages: dict, tmp_path: Path) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", out=tmp_path / "exported",
                category=Category.NIGHT, sub_style=SubStyle.VIVID))
    _, _, correction = fake_stages["render"][0]
    assert "darktable." in correction


def test_one_core_string_not_several(fake_stages: dict, tmp_path: Path) -> None:
    """darktable-cli rejects repeated --core flags; the string must be one blob."""
    _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", out=tmp_path / "exported",
                category=Category.MACRO))
    _, _, correction = fake_stages["render"][0]
    assert correction.count("darktable.exposure") <= 1


def test_monochrome_is_applied_last(fake_stages: dict, tmp_path: Path) -> None:
    """Otherwise a residual tint survives the desaturation."""
    _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", out=tmp_path / "exported",
                category=Category.PORTRAIT, sub_style=SubStyle.MONOCHROME))
    _, _, correction = fake_stages["render"][0]
    assert correction.rstrip().split(";")[-1].startswith("darktable.mono")


# --- criterion 14: unclassified files are recorded, batch continues ---------------


def test_unclassified_is_not_rendered(fake_stages: dict, tmp_path: Path) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    result = run(Options(source=tmp_path / "src", out=tmp_path / "exported"))
    assert fake_stages["render"] == []
    assert result.unclassified == 1


def test_unclassified_files_do_not_stop_the_batch(fake_stages: dict, tmp_path: Path) -> None:
    """One file with no category must not abandon the others."""
    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    _nef(srcdir / "b.NEF")
    run(Options(source=srcdir, out=tmp_path / "exported", category=Category.LANDSCAPE))
    assert len(fake_stages["render"]) == 2


def test_a_render_failure_is_recorded_not_raised(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def boom(src: Path, dest: Path) -> Path:
        raise RuntimeError("sips exploded")

    monkeypatch.setattr(pipeline, "decode", boom)
    _nef(tmp_path / "src" / "a.NEF")
    result = run(Options(source=tmp_path / "src", out=tmp_path / "exported",
                         category=Category.NIGHT))
    assert result.failed == 1


def test_a_failed_file_is_still_written_to_the_database(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def boom(src: Path, dest: Path) -> Path:
        raise RuntimeError("sips exploded")

    monkeypatch.setattr(pipeline, "decode", boom)
    _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", out=tmp_path / "exported", category=Category.NIGHT))
    from nef_editor.store import Store

    with Store(tmp_path / "exported" / ".nef-editor" / "state.db") as store:
        rows = store.all_records()
    assert len(rows) == 1
    assert rows[0].output_path is None


# --- criteria 5, 6, 7: idempotency and dry-run ------------------------------------


def test_second_run_processes_nothing(fake_stages: dict, tmp_path: Path) -> None:
    opts = Options(source=tmp_path / "src", out=tmp_path / "exported",
                   category=Category.NIGHT)
    _nef(tmp_path / "src" / "a.NEF")
    run(opts)
    assert len(fake_stages["render"]) == 1
    run(opts)
    assert len(fake_stages["render"]) == 1, "unchanged file was reprocessed"


def test_force_reprocesses(fake_stages: dict, tmp_path: Path) -> None:
    opts = Options(source=tmp_path / "src", out=tmp_path / "exported",
                   category=Category.NIGHT, force=True)
    _nef(tmp_path / "src" / "a.NEF")
    run(opts)
    run(opts)
    assert len(fake_stages["render"]) == 2


def test_dry_run_writes_no_image_and_no_row(fake_stages: dict, tmp_path: Path) -> None:
    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    out = tmp_path / "exported"
    run(Options(source=srcdir, out=out, category=Category.NIGHT, dry_run=True))

    assert fake_stages["decode"] == []
    assert not (out / "night").exists()
    from nef_editor.store import Store

    with Store(out / ".nef-editor" / "state.db") as store:
        assert store.all_records() == []


def test_dry_run_still_reports_what_it_would_do(fake_stages: dict, tmp_path: Path) -> None:
    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    result = run(Options(source=srcdir, out=tmp_path / "exported",
                         category=Category.NIGHT, dry_run=True))
    assert result.would_process == 1


# --- record shape -----------------------------------------------------------------


def test_recorded_category_is_readable_from_the_output(
    fake_stages: dict, tmp_path: Path
) -> None:
    """Criterion 10: the category is in the exported file, not only the database."""
    import piexif

    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    out = tmp_path / "exported"
    run(Options(source=srcdir, out=out, category=Category.MACRO))

    written = out / "macro" / "a.jpg"
    assert written.exists()

    exif = piexif.load(str(written))
    assert exif["0th"][piexif.ImageIFD.ImageDescription] == b"nef-editor: macro"
    assert exif["Exif"][piexif.ExifIFD.UserComment][8:] == b"macro"


def test_exported_output_hash_is_recorded(
    fake_stages: dict, tmp_path: Path
) -> None:
    """A recorded hash that does not match the file would be worse than none."""
    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    out = tmp_path / "exported"
    run(Options(source=srcdir, out=out, category=Category.MACRO))

    from nef_editor.store import Store

    with Store(out / ".nef-editor" / "state.db") as store:
        row = store.all_records()[0]
    assert row.output_hash == _sha(out / "macro" / "a.jpg")
    assert row.output_path == "macro/a.jpg"

# --- regression: darktable renames its output when the target exists -----------


def test_render_removes_a_stale_output_before_rendering(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """darktable-cli has no overwrite flag; it writes `name_01.jpg` instead.

    If the stale file survives, we hash the *old* output and silently report a
    correction that never happened. Regression test for that.
    """
    decoded = tmp_path / "work" / "a.jpg"
    decoded.parent.mkdir(parents=True)
    decoded.write_bytes(JPEG)
    out_dir = tmp_path / "exported" / "night"
    out_dir.mkdir(parents=True)
    stale = out_dir / "a.jpg"
    stale.write_bytes(JPEG)

    seen: dict[str, object] = {}

    def fake_run(cmd: list[str], **kw: object) -> object:
        seen["stale_existed_during_call"] = stale.exists()
        # emulate darktable writing the exact expected name
        stale.write_bytes(JPEG + b"x")
        class R:
            returncode = 0
            stdout = ""
            stderr = ""
        return R()

    monkeypatch.setattr(pipeline.subprocess, "run", fake_run)
    written = pipeline.render(decoded, out_dir, "darktable.contrast:contrast=1.0")

    assert seen["stale_existed_during_call"] is False, "stale output was left in place"
    assert written == stale
