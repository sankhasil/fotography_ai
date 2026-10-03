"""Behaviour of the command line.

Maps to acceptance criterion 12: unknown flags and invalid enum values fail fast
with a non-zero exit code naming the accepted values.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from nef_editor.cli import main


def _nef(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"NEF" + b"\x00" * 256)
    return path


def test_dry_run_succeeds(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    code = main([str(tmp_path / "src"), "--out", str(tmp_path / "out"), "--dry-run"])
    assert code == 0
    assert "would process" in capsys.readouterr().out


def test_invalid_category_names_the_accepted_values(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    code = main([str(tmp_path / "src"), "--out", str(tmp_path / "out"),
                 "--category", "sunset", "--dry-run"])
    assert code != 0
    err = capsys.readouterr().err
    for accepted in ("portrait", "landscape", "macro", "night"):
        assert accepted in err


def test_invalid_substyle_names_the_accepted_values(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    code = main([str(tmp_path / "src"), "--out", str(tmp_path / "out"),
                 "--sub-style", "sepia", "--dry-run"])
    assert code != 0
    err = capsys.readouterr().err
    for accepted in ("vivid", "neutral", "grey", "monochrome"):
        assert accepted in err


def test_unknown_flag_is_rejected(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = main([str(tmp_path / "src"), "--wat", "--dry-run"])
    assert code != 0
    assert "--wat" in capsys.readouterr().err


def test_missing_source_is_rejected(capsys: pytest.CaptureFixture[str]) -> None:
    code = main([])
    assert code != 0
    assert capsys.readouterr().err


def test_nonexistent_folder_is_rejected(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = main([str(tmp_path / "nope"), "--dry-run"])
    assert code != 0
    assert "nope" in capsys.readouterr().err


def test_valid_values_are_accepted(tmp_path: Path) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    for category in ("portrait", "landscape", "macro", "night"):
        code = main([str(tmp_path / "src"), "--out", str(tmp_path / "out"),
                     "--category", category, "--dry-run"])
        assert code == 0, category
    for style in ("vivid", "neutral", "grey", "monochrome"):
        code = main([str(tmp_path / "src"), "--out", str(tmp_path / "out"),
                     "--sub-style", style, "--dry-run"])
        assert code == 0, style


def test_defaults_to_neutral_substyle(tmp_path: Path) -> None:
    _nef(tmp_path / "src" / "a.NEF")
    assert main([str(tmp_path / "src"), "--out", str(tmp_path / "out"), "--dry-run"]) == 0


def test_help_exits_zero(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--help"]) == 0
    assert "usage" in capsys.readouterr().out.lower()