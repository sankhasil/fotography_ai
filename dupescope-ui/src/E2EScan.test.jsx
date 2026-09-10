import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";

// ─────────────────────────────────────────────────────────────────────────────
// Live-backend-shaped E2E for the Hamburg-Foto-Walk folder.
// The UI (real App, real ScannerPanel/ResultsPanel/useJobSocket) is driven by
// mocked fetch + WebSocket that emit the same protocol the FastAPI server
// serves at localhost:5000 — a full queued→scanning→processing→ai_culling→
// processed→approved→archived journey.
// ─────────────────────────────────────────────────────────────────────────────

const HAMBURG = "/Users/A200173944/Pictures/Nikon Transfer 2/Hamburg-Foto-Walk";
const JOB_ID  = "job-e2e-hamburg";

// Survivors of a real HybridScorer run (keep threshold 4.0) — 17 kept, 33 deleted.
const KEPT = [
  ["DSC_0648.NEF", 4.04, 5.73], ["DSC_0650.NEF", 4.41, 6.64], ["DSC_0654.NEF", 4.01, 5.64],
  ["DSC_0656.NEF", 4.09, 5.84], ["DSC_0663.NEF", 4.06, 5.78], ["DSC_0673.NEF", 4.31, 5.77],
  ["DSC_0677.NEF", 4.05, 5.75], ["DSC_0687.NEF", 4.00, 5.63], ["DSC_0688.NEF", 4.04, 5.72],
  ["DSC_0692.NEF", 4.15, 6.02], ["DSC_0695.NEF", 4.07, 5.80], ["DSC_0696.NEF", 4.03, 5.70],
  ["DSC_0697.NEF", 4.42, 6.68], ["DSC_0698.NEF", 4.27, 6.30], ["DSC_0704.NEF", 4.08, 5.83],
  ["DSC_0709.NEF", 4.13, 5.95], ["DSC_0711.NEF", 4.14, 5.97],
].map(([name, overall, quality]) => ({ name, overall, quality, keep: true }));

const DELETED = Array.from({ length: 33 }, (_, i) => ({
  name: `DSC_${String(720 + i).padStart(4, "0")}.NEF`,
  overall: 3.2 + (i % 4) * 0.2,
  quality: 4.0 + (i % 5) * 0.3,
  keep: false,
}));

const row = ({ name, overall, quality, keep }) => ({
  id: name,
  path: `${HAMBURG}/${name}`,
  keep,
  overall,
  qualityScore: quality,
  aestheticScore: 5.0,
  faceCount: 0,
  reason: keep ? "good composite score" : "below threshold",
  markedDelete: false,
  movedTo: null,
});

const FILES = [
  ...DELETED.map(d => row(d)),
  ...KEPT.map(k => row(k)),
];

const reportData = {
  jobId: JOB_ID,
  aiKeep:   KEPT.map(k => `${HAMBURG}/${k.name}`),
  aiDelete: DELETED.map(d => `${HAMBURG}/${d.name}`),
  exactGroups: 0,
  similarGroups: 0,
};

// Mutable job object — handlers read it live, the test advances its status.
const jobState = {
  jobId: JOB_ID,
  folder: HAMBURG,
  status: "queued",
  reportData,
  actions: {},
  archive_log: [],
  error: null,
};

function makeFetch() {
  return vi.fn(async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    const u      = new URL(String(url));
    const json   = data => ({ ok: true, json: async () => data });

    switch (u.pathname) {
      case "/photos/count":
        return json({ total: 50, processed: 0, unprocessed: 50 });
      case "/scan/start":
        return json({ job_id: JOB_ID });
      case `/jobs/${JOB_ID}`:
        return json(jobState);
      case `/jobs/${JOB_ID}/files`: {
        let rows = FILES;
        const keep = u.searchParams.get("keep");
        if (keep === "true")  rows = FILES.filter(r => r.keep);
        if (keep === "false") rows = FILES.filter(r => !r.keep);
        return json({ rows, total: rows.length });
      }
      case `/jobs/${JOB_ID}/approve`:
        jobState.status = "archiving";
        return json({ status: "ok" });
      default:
        throw new Error(`E2E fetch mock: unhandled ${method} ${u.pathname}`);
    }
  });
}

class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }
  send() {}
  close() { this.readyState = 3; }
  simulate(status, extra = {}) {
    this.onmessage?.({ data: JSON.stringify({ jobId: JOB_ID, status, extra }) });
  }
}

describe("App E2E — Hamburg scan lifecycle", () => {
  beforeEach(() => { MockWebSocket.instances = []; });
  afterEach(() => vi.unstubAllGlobals());

  it("scans a folder, shows AI keep/delete results, approves and archives", async () => {
    vi.stubGlobal("fetch", makeFetch());
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<App />);

    // Type the target folder → debounced count fires
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: HAMBURG } });
    await waitFor(() => screen.getByText("Remaining"), { timeout: 2500 });
    expect(screen.getAllByText("50").length).toBeGreaterThan(0);

    // Submit → WebSocket connects for live status
    fireEvent.click(screen.getByRole("button", { name: /RUN SCAN/ }));
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1), { timeout: 3000 });
    const ws = MockWebSocket.instances[0];

    // Live phases stream through the socket
    act(() => {
      ws.simulate("queued");
      ws.simulate("scanning");
      ws.simulate("processing");
      ws.simulate("ai_culling");
    });
    expect(screen.getAllByText("AI culling images…").length).toBeGreaterThan(0);

    // Terminal event → scanner fetches the job and opens the results tab
    jobState.status = "processed";
    await act(async () => { ws.simulate("processed"); });
    await waitFor(() => screen.getByRole("button", { name: /Approve & Archive/ }), { timeout: 4000 });

    // Results table reflects the real 17/33 split
    expect(screen.getByText("AI keep")).toBeInTheDocument();
    expect(screen.getByText("AI delete")).toBeInTheDocument();
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("33").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DELETE").length).toBeGreaterThan(0);

    // Keep filter shows a real survivor with its filename
    fireEvent.click(screen.getByRole("button", { name: /keep \(17\)/ }));
    await waitFor(() => expect(screen.getAllByText("KEEP").length).toBeGreaterThan(0), { timeout: 3000 });
    expect(screen.getByText("DSC_0648.NEF")).toBeInTheDocument();

    // Approve → mock server starts archiving, then finishes
    fireEvent.click(screen.getByRole("button", { name: /Approve & Archive/ }));
    await waitFor(() => expect(screen.getByText(/Approved — archiving started/)).toBeInTheDocument());

    jobState.status = "archived";
    jobState.actions = { approved: true };
    jobState.archive_log = [{ from: `${HAMBURG}/DEL_00.NEF`, to: `${HAMBURG}/_ARCHIVED/DEL_00.NEF` }];

    await waitFor(() => screen.getByRole("button", { name: /Undo Archive/ }), { timeout: 5000 });
    expect(screen.getByText("Done — files archived")).toBeInTheDocument();
  });

  it("surfaces the server's 404 detail when the folder does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const u = new URL(String(url));
      if (u.pathname === "/photos/count") {
        return { ok: false, json: async () => ({ detail: "Folder not found" }) };
      }
      throw new Error(`E2E fetch mock: unhandled ${opts?.method || "GET"} ${u.pathname}`);
    }));
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<App />);
    fireEvent.change(screen.getByLabelText("Folder path"), {
      target: { value: "/Users/A200173944/Pictures/Nikon" },
    });

    await waitFor(() => expect(screen.getByText(/Folder not found/)).toBeInTheDocument, { timeout: 2500 });
  });
});