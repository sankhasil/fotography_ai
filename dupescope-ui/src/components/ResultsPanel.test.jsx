import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResultsPanel from "./ResultsPanel";
import { THEMES } from "../theme";

const T = THEMES.dark;

vi.mock("../api", () => ({
  apiFetch: vi.fn(),
  PHASE_LABELS: { processed: "Ready for review", archived: "Done", archiving: "Archiving" },
  PIPELINE_STEPS: [],
}));

import { apiFetch } from "../api";

const baseJob = (over) => ({
  status: "processed",
  reportData: { exactGroups: 3, similarGroups: 5, aiKeep: ["a.jpg"], aiDelete: ["b.jpg"] },
  actions: {},
  archive_log: [],
  ...over,
});

describe("ResultsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], total: 0 });
  });

  it("renders the summary stats from report data", () => {
    render(<ResultsPanel job={baseJob()} jobId="j1" onApprove={vi.fn()} onUndo={vi.fn()} T={T} />);
    expect(screen.getByText("Exact dupes")).toBeInTheDocument();
    expect(screen.getByText("Similar groups")).toBeInTheDocument();
    expect(screen.getByText("AI keep")).toBeInTheDocument();
    expect(screen.getByText("AI delete")).toBeInTheDocument();
  });

  it("shows the approve button for a processed, unapproved job", () => {
    render(<ResultsPanel job={baseJob()} jobId="j1" onApprove={vi.fn()} onUndo={vi.fn()} T={T} />);
    expect(screen.getByRole("button", { name: /Approve & Archive/ })).toBeInTheDocument();
  });

  it("does not show approve when already approved", () => {
    render(<ResultsPanel job={baseJob({ actions: { approved: true } })} jobId="j1" onApprove={vi.fn()} onUndo={vi.fn()} T={T} />);
    expect(screen.queryByRole("button", { name: /Approve & Archive/ })).not.toBeInTheDocument();
  });

  it("shows undo button and calls onUndo for an archived job", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue({ restored: ["a.jpg"], rows: [], total: 0 });
    const onUndo = vi.fn();
    render(<ResultsPanel job={baseJob({ status: "archived" })} jobId="j1" onApprove={vi.fn()} onUndo={onUndo} T={T} />);
    fireEvent.click(screen.getByRole("button", { name: /Undo Archive/ }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith("j1"));
  });

  it("renders empty state when no job is provided", () => {
    render(<ResultsPanel job={null} jobId={null} onApprove={vi.fn()} onUndo={vi.fn()} T={T} />);
    expect(screen.getByText(/Run a scan first/)).toBeInTheDocument();
  });
});
