"""Behaviour of the pipeline: discover, classify, copy sidecar, record.

The main path writes XMP sidecars next to NEFs -- no decode, no render, no
Docker. Tests substitute `select_sidecar` so no real preset files are needed.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from nef_editor import pipeline
from nef_editor.model import Category, SubStyle
from nef_editor.pipeline import Options, discover, run

FAKE_XMP = b"""<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:darktable="http://darktable.sf.net/">
   <darktable:version>4</darktable:version>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
"""


def _nef(path: Path) -> Path:
    """A stand-in source file. Content is irrelevant; only stat data is used."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"NEF" + bytes(512))
    return path


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def fake_sidecar(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Provide a fake preset XMP and make select_sidecar return it."""
    preset = tmp_path / "fake-preset.xmp"
    preset.write_bytes(FAKE_XMP)

    def fake_select(category: Category, sub_style: SubStyle) -> Path | None:
        if category is Category.UNCLASSIFIED:
            return None
        return preset

    monkeypatch.setattr(pipeline, "select_sidecar", fake_select)
    return preset


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


# --- sidecar writing -------------------------------------------------------------


def test_sidecar_written_next_to_nef(fake_sidecar: Path, tmp_path: Path) -> None:
    src = _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", category=Category.NIGHT))
    sidecar = src.with_suffix(".xmp")
    assert sidecar.exists()
    assert sidecar.read_bytes() == FAKE_XMP


def test_no_sidecar_when_unclassified(fake_sidecar: Path, tmp_path: Path) -> None:
    src = _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src"))
    assert not src.with_suffix(".xmp").exists()


def test_no_sidecar_when_preset_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When select_sidecar returns None (no preset authored yet), no sidecar is written."""
    monkeypatch.setattr(pipeline, "select_sidecar", lambda c, s: None)
    src = _nef(tmp_path / "src" / "a.NEF")
    result = run(Options(source=tmp_path / "src", category=Category.NIGHT))
    assert not src.with_suffix(".xmp").exists()
    assert result.failed == 0
    assert result.processed == 1  # classified and recorded, just no sidecar to write


def test_source_nef_is_byte_identical_after_a_run(fake_sidecar: Path, tmp_path: Path) -> None:
    srcdir = tmp_path / "src"
    src = _nef(srcdir / "a.NEF")
    before = _sha(src)
    run(Options(source=srcdir, category=Category.NIGHT))
    assert _sha(src) == before


def test_sidecar_hash_is_recorded(fake_sidecar: Path, tmp_path: Path) -> None:
    from nef_editor.store import Store

    _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", category=Category.NIGHT))

    with Store(tmp_path / "src" / ".nef-editor" / "state.db") as store:
        row = store.all_records()[0]
    assert row.output_hash == _sha(tmp_path / "src" / "a.xmp")
    assert row.output_path == "a.xmp"


# --- unclassified and failures ---------------------------------------------------


def test_unclassified_files_do_not_stop_the_batch(fake_sidecar: Path, tmp_path: Path) -> None:
    """One unclassified file must not abandon the others."""
    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    _nef(srcdir / "b.NEF")
    result = run(Options(source=srcdir, category=Category.LANDSCAPE))
    assert result.processed == 2


def test_failed_sidecar_copy_is_recorded_not_raised(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A sidecar copy failure is recorded, not raised."""
    preset = tmp_path / "preset.xmp"
    preset.write_bytes(FAKE_XMP)
    monkeypatch.setattr(pipeline, "select_sidecar", lambda c, s: preset)
    monkeypatch.setattr(pipeline, "shutil", type("M", (), {"copy": staticmethod(lambda *a: (_ for _ in ()).throw(RuntimeError("disk full")))}))
    _nef(tmp_path / "src" / "a.NEF")
    result = run(Options(source=tmp_path / "src", category=Category.NIGHT))
    assert result.failed == 1


def test_failed_file_is_still_written_to_the_database(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from nef_editor.store import Store

    preset = tmp_path / "preset.xmp"
    preset.write_bytes(FAKE_XMP)
    monkeypatch.setattr(pipeline, "select_sidecar", lambda c, s: preset)
    monkeypatch.setattr(pipeline, "shutil", type("M", (), {"copy": staticmethod(lambda *a: (_ for _ in ()).throw(RuntimeError("disk full")))}))
    _nef(tmp_path / "src" / "a.NEF")
    run(Options(source=tmp_path / "src", category=Category.NIGHT))

    with Store(tmp_path / "src" / ".nef-editor" / "state.db") as store:
        rows = store.all_records()
    assert len(rows) == 1
    assert rows[0].output_path is None


# --- idempotency and dry-run -----------------------------------------------------


def test_second_run_processes_nothing(fake_sidecar: Path, tmp_path: Path) -> None:
    opts = Options(source=tmp_path / "src", category=Category.NIGHT)
    _nef(tmp_path / "src" / "a.NEF")
    run(opts)
    result = run(opts)
    assert result.processed == 0
    assert result.skipped == 1


def test_force_reprocesses(fake_sidecar: Path, tmp_path: Path) -> None:
    opts = Options(source=tmp_path / "src", category=Category.NIGHT, force=True)
    _nef(tmp_path / "src" / "a.NEF")
    run(opts)
    run(opts)
    assert (tmp_path / "src" / "a.xmp").exists()


def test_dry_run_writes_no_sidecar_and_no_row(fake_sidecar: Path, tmp_path: Path) -> None:
    from nef_editor.store import Store

    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    run(Options(source=srcdir, category=Category.NIGHT, dry_run=True))

    assert not (srcdir / "a.xmp").exists()
    with Store(srcdir / ".nef-editor" / "state.db") as store:
        assert store.all_records() == []


def test_dry_run_still_reports_what_it_would_do(fake_sidecar: Path, tmp_path: Path) -> None:
    srcdir = tmp_path / "src"
    _nef(srcdir / "a.NEF")
    result = run(Options(source=srcdir, category=Category.NIGHT, dry_run=True))
    assert result.would_process == 1
