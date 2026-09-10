import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QueuePanel from "./QueuePanel";
import { THEMES } from "../theme";

const T = THEMES.dark;

vi.mock("../api", () => ({
  apiFetch: vi.fn(),
  PHASE_LABELS: { queued: "Queued", archived: "Done", error: "Error" },
  PIPELINE_STEPS: [],
}));

import { apiFetch } from "../api";

describe("QueuePanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state when there are no jobs", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ jobs: [] });
    render(<QueuePanel onOpenJob={vi.fn()} T={T} />);
    expect(await screen.findByText(/No jobs yet/)).toBeInTheDocument();
  });

  it("renders job rows and their status labels", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      jobs: [
        { jobId: "j1", folder: "/data/pics", status: "archived", created_at: new Date().toISOString() },
      ],
    });
    render(<QueuePanel onOpenJob={vi.fn()} T={T} />);
    expect(await screen.findByText("pics")).toBeInTheDocument();
    expect(screen.getByText(/Done/)).toBeInTheDocument();
  });

  it("calls onOpenJob when a job row is clicked", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      jobs: [{ jobId: "j1", folder: "/a/b", status: "queued", created_at: new Date().toISOString() }],
    });
    const onOpenJob = vi.fn();
    render(<QueuePanel onOpenJob={onOpenJob} T={T} />);
    fireEvent.click(await screen.findByText("b"));
    expect(onOpenJob).toHaveBeenCalledWith("j1");
  });

  it("shows a cancel button for a queued job and surfaces cancel errors inline", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ jobs: [{ jobId: "j1", folder: "/a/b", status: "queued", created_at: new Date().toISOString() }] })
      .mockRejectedValueOnce(new Error("already running"));
    render(<QueuePanel onOpenJob={vi.fn()} T={T} />);
    const cancelBtn = await screen.findByRole("button", { name: /cancel/ });
    fireEvent.click(cancelBtn);
    expect(await screen.findByText("✗ already running")).toBeInTheDocument();
  });
});
