import os
import re
import hashlib
from pathlib import Path
from pytest_bdd import scenarios, given, when, then, parsers
import pytest

scenarios("foundation.feature")


# ── Background fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def base_dir():
    return Path(__file__).resolve().parent.parent


# ── Scenario: Dead files are removed ──────────────────────────────────────────

@then(parsers.parse('the file "{filename}" should not exist'))
def file_should_not_exist(base_dir, filename):
    path = base_dir / filename
    assert not path.exists(), f"{filename} should have been deleted but still exists"


@then(parsers.parse('the directory "{dirname}" should exist'))
def dir_should_exist(base_dir, dirname):
    path = base_dir / dirname
    assert path.is_dir(), f"{dirname} should exist as a directory"


@then(parsers.parse('the file "{filepath}" should exist'))
def file_should_exist(base_dir, filepath):
    path = base_dir / filepath
    assert path.is_file(), f"{filepath} should exist as a file"


# ── Scenario: ssim_similarity count ───────────────────────────────────────────

@when(parsers.parse('I count definitions of "{func_name}" in "{filename}"'))
def count_definitions(base_dir, func_name, filename):
    filepath = base_dir / filename
    content = filepath.read_text()
    pattern = rf"^def {func_name}\s*\("
    matches = re.findall(pattern, content, re.MULTILINE)
    pytest.context = {"ssim_count": len(matches)}


@then(parsers.parse('there should be exactly {count:d} definition'))
def check_count(count):
    actual = pytest.context["ssim_count"]
    assert actual == count, f"Expected {count} definition(s) of ssim_similarity, found {actual}"


# ── Scenario: Server signal handlers ──────────────────────────────────────────

@when(parsers.parse('I check signal handler registration in "{filename}"'))
def check_signal_handlers(base_dir, filename):
    filepath = base_dir / filename
    content = filepath.read_text()
    lines = content.split("\n")

    signal_import_line = None
    signal_register_lines = []
    in_main_block = False

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('if __name__'):
            in_main_block = True
        if "signal.signal(" in stripped:
            signal_register_lines.append({"line_num": i + 1, "line": stripped, "in_main": in_main_block})

    pytest.context = {"signal_lines": signal_register_lines}


@then("signal handlers should be inside the __main__ block")
def verify_signal_in_main():
    lines = pytest.context["signal_lines"]
    for entry in lines:
        assert entry["in_main"], (
            f"signal.signal() at line {entry['line_num']} is outside __main__ block: {entry['line']}"
        )


# ── Scenario: Server uses threading.Event ─────────────────────────────────────

@when(parsers.parse('I check the worker function in "{filename}"'))
def check_worker_function(base_dir, filename):
    filepath = base_dir / filename
    content = filepath.read_text()
    pytest.context = {"server_content": content}


@then("the worker should use threading.Event for approval wait")
def verify_event_used():
    content = pytest.context["server_content"]
    assert "threading.Event" in content or "Event()" in content, (
        "Worker should use threading.Event for approval wait"
    )


@then('the worker should not have a "while True" + "time.sleep" busy-wait loop')
def verify_no_busy_wait():
    content = pytest.context["server_content"]
    lines = content.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == "while True:":
            for j in range(i + 1, min(i + 5, len(lines))):
                if "time.sleep" in lines[j]:
                    pytest.fail(
                        f"Busy-wait detected: 'while True' at line {i+1} "
                        f"with 'time.sleep' at line {j+1}"
                    )


# ── Scenario: scan_images ─────────────────────────────────────────────────────

@given("a temporary folder with 3 jpg images")
def create_test_images(tmp_path):
    for i in range(3):
        (tmp_path / f"photo_{i}.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    pytest.context = {"folder": tmp_path}


@when("I call scan_images on the folder recursively")
def call_scan_images():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from dupescope import scan_images
    folder = pytest.context["folder"]
    pytest.context["result"] = scan_images(folder, recursive=True)


@then(parsers.parse("{count:d} images should be returned"))
def check_scan_count(count):
    result = pytest.context["result"]
    assert len(result) == count, f"Expected {count} images, got {len(result)}"


# ── Scenario: find_exact_dupes ────────────────────────────────────────────────

@given("a temporary folder with 2 identical images and 1 unique image")
def create_duplicate_images(tmp_path):
    data = b"\xff\xd8\xff\xe0" + b"\x00" * 200
    (tmp_path / "dup_a.jpg").write_bytes(data)
    (tmp_path / "dup_b.jpg").write_bytes(data)
    (tmp_path / "unique.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x01" * 200)
    pytest.context = {"folder": tmp_path}


@when("I call find_exact_dupes on all images")
def call_find_exact_dupes():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from dupescope import find_exact_dupes
    from dupescope import scan_images
    folder = pytest.context["folder"]
    images = scan_images(folder)
    pytest.context["dupes"] = find_exact_dupes(images)


@then("1 group of exact duplicates should be found")
def check_dupe_groups():
    dupes = pytest.context["dupes"]
    assert len(dupes) == 1, f"Expected 1 dupe group, got {len(dupes)}"
    group = list(dupes.values())[0]
    assert len(group) == 2, f"Expected 2 files in dupe group, got {len(group)}"


# ── Scenario: fmt_bytes ───────────────────────────────────────────────────────

@when(parsers.parse("I call fmt_bytes with {size:d}"))
def call_fmt_bytes(size):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from dupescope import fmt_bytes
    pytest.context["fmt_result"] = fmt_bytes(size)


@then(parsers.parse('the result should be "{expected}"'))
def check_fmt_bytes(expected):
    result = pytest.context["fmt_result"]
    assert result == expected, f"Expected '{expected}', got '{result}'"
