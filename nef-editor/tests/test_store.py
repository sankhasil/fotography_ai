"""Behaviour of the state store.

Maps to acceptance criteria 5, 6 and 7. One table, one row per photograph,
keyed on mtime + size. See database.md.

The idempotency key is mtime + size rather than a content hash: hashing a 33MB
NEF costs 50-100ms per file on every run and catches nothing that mtime+size
misses in practice. That trade is recorded in database.md.
"""

from __future__ import annotations

from pathlib import Path

from nef_editor.model import Category, PhotoRecord, SubStyle
from nef_editor.store import Store


def _record(path: str = "DSC_0001.NEF", **overrides: object) -> PhotoRecord:
    base: dict[str, object] = {
        "source_path": path,
        "source_mtime": 1_700_000_000.0,
        "source_size": 34_105_856,
        "category": Category.NIGHT,
        "sub_style": SubStyle.NEUTRAL,
        "reasons": ("night: ISO 6400 >= 3200",),
        "correction": "darktable.exposure:exposure=0.1",
        "pipeline": "imageio>darktable-5.6.1",
        "output_path": "night/DSC_0001.jpg",
        "output_hash": "abc123",
        "tool_versions": '{"darktable": "5.6.1"}',
        "processed_at": "2026-10-02T21:00:00+00:00",
    }
    base.update(overrides)
    return PhotoRecord(**base)  # type: ignore[arg-type]


def test_a_fresh_store_has_nothing(tmp_path: Path) -> None:
    with Store(tmp_path / "state.db") as store:
        assert store.needs_processing(_record()) is True


def test_unchanged_file_is_skipped(tmp_path: Path) -> None:
    """Criterion 5: re-running over an unchanged folder processes nothing."""
    with Store(tmp_path / "state.db") as store:
        record = _record()
        store.save(record)
        assert store.needs_processing(record) is False


def test_changed_mtime_forces_reprocessing(tmp_path: Path) -> None:
    with Store(tmp_path / "state.db") as store:
        store.save(_record())
        assert store.needs_processing(_record(source_mtime=1_800_000_000.0)) is True


def test_changed_size_forces_reprocessing(tmp_path: Path) -> None:
    with Store(tmp_path / "state.db") as store:
        store.save(_record())
        assert store.needs_processing(_record(source_size=99_999)) is True


def test_force_overrides_an_unchanged_file(tmp_path: Path) -> None:
    """Criterion 7."""
    with Store(tmp_path / "state.db") as store:
        store.save(_record())
        assert store.needs_processing(_record(), force=True) is True


def test_saving_twice_keeps_one_row(tmp_path: Path) -> None:
    """Reprocessing overwrites in place. There is deliberately no history table."""
    with Store(tmp_path / "state.db") as store:
        store.save(_record())
        store.save(_record(output_hash="def456", category=Category.PORTRAIT))
        rows = store.all_records()
        assert len(rows) == 1
        assert rows[0].output_hash == "def456"
        assert rows[0].category is Category.PORTRAIT


def test_a_failure_is_recorded_with_a_null_output(tmp_path: Path) -> None:
    """Criterion 14: failures are visible, never silently dropped."""
    with Store(tmp_path / "state.db") as store:
        store.save(_record(output_path=None, output_hash=None, correction=""))
        row = store.all_records()[0]
        assert row.output_path is None
        assert row.correction == ""


def test_distinct_files_get_distinct_rows(tmp_path: Path) -> None:
    with Store(tmp_path / "state.db") as store:
        store.save(_record("DSC_0001.NEF"))
        store.save(_record("DSC_0002.NEF"))
        assert len(store.all_records()) == 2


def test_reasons_survive_a_round_trip(tmp_path: Path) -> None:
    """Reasons are what make a run explainable; losing them would be a silent loss."""
    with Store(tmp_path / "state.db") as store:
        reasons = ("night: ISO 6400 >= 3200", "lens: NIKON Z 9, 140mm, f/6.3")
        store.save(_record(reasons=reasons))
        assert store.all_records()[0].reasons == reasons


def test_closing_twice_is_safe(tmp_path: Path) -> None:
    store = Store(tmp_path / "state.db")
    store.close()
    store.close()


def test_the_database_file_is_created_with_its_parent(tmp_path: Path) -> None:
    nested = tmp_path / ".nef-editor" / "state.db"
    with Store(nested) as store:
        store.save(_record())
    assert nested.exists()