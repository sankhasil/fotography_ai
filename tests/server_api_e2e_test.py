#!/usr/bin/env python3

import subprocess
import sys
import time
import requests
import threading
import os
import pytest
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
cwd=str(ROOT / "dupescope-backend")

BASE = "http://localhost:5000"


# ─────────────────────────────────────────────
# SERVER CONTAINER
# ─────────────────────────────────────────────
class ServerContainer:
    def __init__(self):
        self.proc = None

    def start(self):
        print("[test] starting server...")

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        self.proc = subprocess.Popen(
            [sys.executable, "server.py"],
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env
        )

        # stream logs
        def logs():
            for line in self.proc.stdout:
                print("[server]", line.strip())

        threading.Thread(target=logs, daemon=True).start()

        self._wait_ready()

    def _wait_ready(self):
        print("[test] waiting for /health ...")

        for i in range(120):
            try:
                r = requests.get(f"{BASE}/health", timeout=1)
                if r.status_code == 200:
                    print("[test] server READY")
                    return
            except Exception:
                pass

            time.sleep(0.5)

        self.stop()
        raise RuntimeError("❌ server failed to start (no /health response)")

    def stop(self):
        if self.proc:
            print("[test] stopping server...")
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            finally:
                if self.proc.poll() is None:
                    self.proc.kill()


# ─────────────────────────────────────────────
# CONTEXT MANAGER
# ─────────────────────────────────────────────
def run_server():
    return ServerContainer()



@pytest.fixture(scope="function")
def server():
    s = ServerContainer()
    s.start()
    yield s
    s.stop()

def test_health(server):
    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200

def test_scan_start(server):
    payload = {
        "folder": "/tmp/test",
        "mode": "both",
        "test_mode": True
    }

    r = requests.post(f"{BASE}/scan/start", json=payload)
    print(r)
    assert r.status_code == 200
    job_id = r.json()["job_id"]

    job = requests.get(f"{BASE}/jobs/{job_id}").json()

    assert job["status"] == "processed"
    assert job["reportData"]["testMode"] is True