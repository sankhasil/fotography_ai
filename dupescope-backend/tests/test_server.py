import json
from pathlib import Path
from pytest_bdd import scenarios, given, when, then, parsers
import pytest

scenarios("server.feature")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from server import app
    return TestClient(app)


@pytest.fixture(autouse=True)
def _init_context(request, client):
    if not hasattr(pytest, "context"):
        pytest.context = {}
    pytest.context["client"] = client
    yield


# ── Background ────────────────────────────────────────────────────────────────

@given("the DupeScope server is running")
def server_running():
    pass


# ── Given steps ───────────────────────────────────────────────────────────────

@given("a temporary folder with 5 jpg images")
def five_jpg_images(tmp_path):
    for i in range(5):
        (tmp_path / f"img_{i}.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    pytest.context["folder"] = str(tmp_path)


@given("a temporary folder with 3 jpg images")
def three_jpg_images(tmp_path):
    for i in range(3):
        (tmp_path / f"photo_{i}.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    pytest.context["folder"] = str(tmp_path)


@given("a scan job has been started in test mode")
def start_test_job(client):
    resp = client.post("/scan/start", json={
        "folder": "/tmp/test",
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
        "test_mode": True,
    })
    data = resp.json()
    pytest.context["job_id"] = data["job_id"]


@given("a scan job with archived files")
def start_and_archive(client, tmp_path):
    for i in range(2):
        (tmp_path / f"arch_{i}.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    resp = client.post("/scan/start", json={
        "folder": str(tmp_path),
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
        "test_mode": True,
    })
    data = resp.json()
    pytest.context["job_id"] = data["job_id"]


# ── When steps ────────────────────────────────────────────────────────────────

@when(parsers.parse('I GET "/photos/count?folder={folder}&recursive={recursive}"'))
def http_get_photo_count(client, folder, recursive):
    if folder == "{folder}":
        folder = pytest.context.get("folder", "/tmp")
    resp = client.get(f"/photos/count?folder={folder}&recursive={recursive}")
    pytest.context["response"] = resp


@when(parsers.parse('I GET "/photos/count?folder=/nonexistent/path&recursive=true"'))
def http_get_missing_folder(client):
    resp = client.get("/photos/count?folder=/nonexistent/path&recursive=true")
    pytest.context["response"] = resp


@when("I GET \"/jobs/{job_id}\"")
def http_get_job(client):
    jid = pytest.context.get("job_id", "nonexistent-id")
    resp = client.get(f"/jobs/{jid}")
    pytest.context["response"] = resp


@when("I GET \"/jobs/nonexistent-id\"")
def http_get_unknown_job(client):
    resp = client.get("/jobs/nonexistent-id")
    pytest.context["response"] = resp


@when("I GET \"/jobs/list\"")
def http_get_jobs_list(client):
    resp = client.get("/jobs/list")
    pytest.context["response"] = resp


@when("I start a scan in test mode")
def start_scan_test_mode(client):
    folder = pytest.context.get("folder", "/tmp/test")
    resp = client.post("/scan/start", json={
        "folder": folder,
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
        "test_mode": True,
    })
    pytest.context["response"] = resp
    if resp.status_code == 200:
        data = resp.json()
        if "job_id" in data:
            pytest.context["job_id"] = data["job_id"]


@when("I start a scan with empty folder")
def start_scan_empty_folder(client):
    resp = client.post("/scan/start", json={
        "folder": "",
        "mode": "exact",
    })
    pytest.context["response"] = resp


@when(parsers.parse('I POST "/jobs/{job_id}/approve"'))
def http_post_approve(client):
    jid = pytest.context.get("job_id")
    resp = client.post(f"/jobs/{jid}/approve")
    pytest.context["response"] = resp


@when(parsers.parse('I POST "/jobs/{job_id}/undo"'))
def http_post_undo(client):
    jid = pytest.context.get("job_id")
    resp = client.post(f"/jobs/{jid}/undo")
    pytest.context["response"] = resp


# ── Then steps ────────────────────────────────────────────────────────────────

@then(parsers.parse('the response status should be {status:d}'))
def check_status(status):
    resp = pytest.context["response"]
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}: {resp.text}"
    )


@then(parsers.parse('the response should contain "{key}" equal to {value}'))
def check_response_value(key, value):
    resp = pytest.context["response"]
    data = resp.json()
    assert key in data, f"Response missing key '{key}': {data}"
    actual = data[key]
    if isinstance(actual, bool):
        expected = value.lower() == "true"
    elif isinstance(actual, int):
        expected = int(value)
    else:
        expected = value.strip('"')
    assert actual == expected, f"Expected {key}={expected}, got {actual}"


@then(parsers.parse('the response should contain "{key}"'))
def check_response_has_key(key):
    resp = pytest.context["response"]
    data = resp.json()
    assert key in data, f"Response missing key '{key}': {data}"
