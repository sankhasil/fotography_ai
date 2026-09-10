import threading
from pytest_bdd import scenarios, given, when, then, parsers
import pytest

scenarios("queue.feature")


@pytest.fixture(autouse=True)
def _init_context(request, client):
    if not hasattr(pytest, "context"):
        pytest.context = {}
    pytest.context["client"] = client
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from server import app
    return TestClient(app)


# ── Background ────────────────────────────────────────────────────────────────


@given("the DupeScope server is running")
def server_running():
    pass


# ── Given steps ───────────────────────────────────────────────────────────────


@given("a temporary folder with 2 jpg images")
def two_jpg_images(tmp_path):
    for i in range(2):
        (tmp_path / f"img_{i}.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
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


# ── When steps ────────────────────────────────────────────────────────────────


@when("I submit a real scan")
def submit_real_scan(client):
    folder = pytest.context.get("folder", "/tmp/test")
    resp = client.post("/scan/start", json={
        "folder": folder,
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
        "test_mode": False,
    })
    pytest.context["response"] = resp
    if resp.status_code == 200:
        data = resp.json()
        if "job_id" in data:
            pytest.context["job_id"] = data["job_id"]


@when("the queue is blocked with small cap")
def block_queue(monkeypatch):
    import server
    monkeypatch.setattr(server, "MAX_QUEUE_PHOTOS", 3)

    orig = server._run_job
    event = threading.Event()

    def _blocked(job_id):
        event.wait()
        orig(job_id)

    monkeypatch.setattr(server, "_run_job", _blocked)
    pytest.context["_queue_unblock"] = event


@when("I submit a real scan with same folder")
def submit_real_scan_same_folder(client):
    folder = pytest.context.get("folder", "/tmp/test")
    resp = client.post("/scan/start", json={
        "folder": folder,
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
        "test_mode": False,
    })
    pytest.context["second_response"] = resp


@when("I GET \"/jobs/list\"")
def http_get_jobs_list(client):
    resp = client.get("/jobs/list")
    pytest.context["response"] = resp


@when("I subscribe to the job via WebSocket")
def subscribe_ws(client):
    jid = pytest.context.get("job_id")
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "job_id": jid})
        snapshot = ws.receive_json()
        pytest.context["ws_snapshot"] = snapshot


@when("the queue worker is blocked")
def block_queue_worker(monkeypatch):
    import server
    event = threading.Event()

    def _blocked(job_id):
        event.wait()

    monkeypatch.setattr(server, "_run_job", _blocked)
    pytest.context["_queue_unblock"] = event


@when("I cancel the queued job")
def cancel_queued_job(client):
    jid = pytest.context.get("job_id")
    resp = client.post(f"/jobs/{jid}/cancel")
    pytest.context["response"] = resp


# ── Then steps ────────────────────────────────────────────────────────────────


@then(parsers.parse('the response status should be {status:d}'))
def check_status(status):
    resp = pytest.context["response"]
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}: {resp.text}"
    )


@then(parsers.parse('the response should contain "{key}"'))
def check_response_has_key(key):
    resp = pytest.context["response"]
    data = resp.json()
    assert key in data, f"Response missing key '{key}': {data}"


@then(parsers.parse('the job list should include the submitted job'))
def job_list_includes_job():
    data = pytest.context["response"].json()
    jid = pytest.context.get("job_id")
    job_ids = [j.get("jobId") for j in data.get("jobs", [])]
    assert jid in job_ids, f"Job {jid} not found in {job_ids}"


@then(parsers.parse('the second response status should be {status:d}'))
def check_second_status(status):
    resp = pytest.context["second_response"]
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}: {resp.text}"
    )


@then(parsers.parse('the second response body should contain "{text}"'))
def check_second_body_contains(text):
    resp = pytest.context["second_response"]
    assert text in resp.text, f"Expected '{text}' in response body: {resp.text}"


@then("I should receive a snapshot event with status")
def check_snapshot_event():
    snap = pytest.context.get("ws_snapshot", {})
    assert snap.get("status"), f"Snapshot missing status: {snap}"
    assert snap.get("jobId"), f"Snapshot missing jobId: {snap}"


@then(parsers.parse('the cancel response status should be {status:d}'))
def check_cancel_status(status):
    resp = pytest.context["response"]
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}: {resp.text}"
    )


@then(parsers.parse('the cancel response body should be "{status}"'))
def check_cancel_body(status):
    resp = pytest.context["response"]
    assert resp.json().get("status") == status, f"Unexpected body: {resp.text}"


@then(parsers.parse('the job status should be "{status}"'))
def check_job_status(client, status):
    jid = pytest.context.get("job_id")
    resp = client.get(f"/jobs/{jid}")
    assert resp.status_code == 200, resp.text
    assert resp.json().get("status") == status, resp.text


# ── Additional tests (not BDD) ──────────────────────────────────────────────


def test_stale_queued_job_cancelled_on_startup(tmp_path):
    from dupescope.archive.storage import JobStore
    import server

    (tmp_path / "test.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    store = JobStore(tmp_path)
    jid = "stale-001"
    store.create_job(jid, str(tmp_path))
    assert store.get_job(jid)["status"] == "queued"

    server.stores.clear()

    _ = server._get_or_create_store(tmp_path)
    job = server._find_store(jid).get_job(jid)
    assert job["status"] == "cancelled", f"Expected cancelled, got {job['status']}"


def test_auto_archive_job_releases_queue_budget(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    import server

    (tmp_path / "a.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    (tmp_path / "b.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)

    calls = []

    class _FakeEngine:
        def __init__(self, stages):
            self.stages = stages

        def run(self, ctx, on_event=None):
            ctx.results["quality"] = SimpleNamespace(
                data={"keep": [], "delete": [], "details": []}
            )
            ctx.results["dedupes"] = SimpleNamespace(
                data={"exact": {}, "perceptual": []}
            )
            return SimpleNamespace(success=True, stage_name="quality", error="")

    monkeypatch.setattr(server, "ScanStage", lambda *a, **k: object())
    monkeypatch.setattr(server, "DedupeStage", lambda *a, **k: object())
    monkeypatch.setattr(server, "QualityStage", lambda *a, **k: object())
    monkeypatch.setattr(server, "PipelineEngine", _FakeEngine)
    monkeypatch.setattr(server, "_archive_job", lambda jid: calls.append(jid))
    monkeypatch.setattr(server, "_ensure_queue_worker", lambda: None)

    client = TestClient(server.app)
    resp = client.post("/scan/start", json={
        "folder": str(tmp_path),
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": True,
        "test_mode": False,
    })
    jid = resp.json()["job_id"]
    assert jid in server.job_totals

    server._run_job(jid)

    store = server._find_store(jid)
    assert store.get_job(jid)["status"] == "processed"
    assert calls == [jid], "auto_archive should have triggered the archive step"
    assert jid not in server.job_totals, "queue budget must reset once the job is done"
    assert jid not in server.queue


def test_jobs_list_survives_deleted_folder(tmp_path, monkeypatch):
    import shutil
    from fastapi.testclient import TestClient
    import server

    folder = tmp_path / "gone"
    folder.mkdir()
    (folder / "a.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)

    server.stores.clear()
    client = TestClient(server.app)
    resp = client.post("/scan/start", json={
        "folder": str(folder),
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
        "test_mode": True,
    })
    assert resp.status_code == 200, resp.text

    shutil.rmtree(folder)

    resp = client.get("/jobs/list")
    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] == 0


def test_delete_logs_archive_undo_restores(tmp_path):
    from fastapi.testclient import TestClient
    from server import app
    import server

    (tmp_path / "photo.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    client = TestClient(app)
    resp = client.post("/scan/start", json={
        "folder": str(tmp_path),
        "test_mode": True,
        "mode": "exact",
        "recursive": True,
        "ai_cull": False,
        "auto_archive": False,
    })
    jid = resp.json()["job_id"]

    fname = "photo.jpg"
    server.job_photos[jid] = {
        fname: {"path": str(tmp_path / fname), "processed": False,
                "marked_delete": False, "moved_to": None}
    }

    resp = client.post(f"/jobs/{jid}/mark-delete", json={"file_ids": [fname]})
    assert resp.status_code == 200
    resp = client.post(f"/jobs/{jid}/delete", json={"file_ids": [fname]})
    assert resp.status_code == 200

    store = server._find_store(jid)
    job = store.get_job(jid)
    assert len(job["archive_log"]) == 1, f"archive_log: {job['archive_log']}"
    assert not (tmp_path / fname).exists(), "file should have been moved"

    resp = client.post(f"/jobs/{jid}/undo")
    assert resp.status_code == 200
    assert (tmp_path / fname).exists(), "file should be restored after undo"
