import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { THEMES } from "./theme";

vi.mock("../api", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  PHASE_LABELS: {},
  PIPELINE_STEPS: [],
}));

describe("App", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the header with the DupeScope wordmark", () => {
    render(<App />);
    expect(screen.getByText("DupeScope")).toBeInTheDocument();
    expect(screen.getByText("Privacy-first · fully offline")).toBeInTheDocument();
  });

  it("renders all three tabs", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /SCANNER/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RESULTS/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JOBS/ })).toBeInTheDocument();
  });

  it("shows the scanner panel by default", () => {
    render(<App />);
    expect(screen.getByLabelText("Folder path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RUN SCAN/ })).toBeInTheDocument();
  });

  it("switches the accent-coloured surfaces when toggling dark/light", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: /Light|Dark/ });
    const logo = screen.getByText("◈");

    expect(logo).toHaveStyle({ background: THEMES.dark.accent });

    fireEvent.click(toggle);
    expect(logo).toHaveStyle({ background: THEMES.light.accent });

    fireEvent.click(toggle);
    expect(logo).toHaveStyle({ background: THEMES.dark.accent });
  });

  it("switching to the jobs tab renders the queue empty state", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /JOBS/ }));
    expect(screen.getByText(/No jobs yet/)).toBeInTheDocument();
  });
});
