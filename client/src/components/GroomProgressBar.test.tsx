import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroomProgressBar } from "./GroomProgressBar";

function statuses() {
  return Array.from(screen.getByTestId("groom-progress").querySelectorAll("li")).map((li) => ({
    step: li.getAttribute("data-step"),
    status: li.getAttribute("data-status"),
  }));
}

describe("GroomProgressBar", () => {
  it("draws Andy's six steps, in order", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    expect(statuses().map((s) => s.step)).toEqual([
      "checked_in", "bath", "dry", "groom", "ready", "collected",
    ]);
    for (const label of ["Checked in", "Bathing", "Drying", "Grooming", "Ready for pickup", "Picked up"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks exactly one step current", () => {
    render(<GroomProgressBar workflowState="grooming" petName="Rosie" />);
    const current = statuses().filter((s) => s.status === "current");
    expect(current).toHaveLength(1);
    expect(current[0].step).toBe("groom");
  });

  it("shows a dog in the dryer queue on the Drying step, same as one under the dryer", () => {
    // Andy: the client doesn't need to see the delays between stages. So
    // these two must render identically.
    const { unmount } = render(<GroomProgressBar workflowState="waiting_for_dry" petName="Rosie" />);
    const queued = statuses();
    unmount();
    render(<GroomProgressBar workflowState="drying" petName="Rosie" />);
    expect(queued).toEqual(statuses());
    expect(queued.find((s) => s.status === "current")?.step).toBe("dry");
  });

  it("renders a groomer-queue dog identically to one being groomed", () => {
    const { unmount } = render(<GroomProgressBar workflowState="waiting_for_groom" petName="Rosie" />);
    const queued = statuses();
    unmount();
    render(<GroomProgressBar workflowState="grooming" petName="Rosie" />);
    expect(queued).toEqual(statuses());
  });

  it("ticks off only what is finished", () => {
    render(<GroomProgressBar workflowState="ready" petName="Rosie" />);
    expect(statuses()).toEqual([
      { step: "checked_in", status: "done" },
      { step: "bath", status: "done" },
      { step: "dry", status: "done" },
      { step: "groom", status: "done" },
      // Ready is current, not done: the client has not collected them.
      { step: "ready", status: "current" },
      { step: "collected", status: "upcoming" },
    ]);
  });

  it("marks all six done once the dog is collected", () => {
    render(<GroomProgressBar workflowState="complete" petName="Rosie" />);
    expect(statuses().every((s) => s.status === "done")).toBe(true);
  });

  it("draws nothing before the dog arrives", () => {
    // Six grey dots on the morning of a booking invite "why has nothing
    // started".
    render(<GroomProgressBar workflowState="scheduled" petName="Rosie" />);
    expect(screen.queryByTestId("groom-progress")).not.toBeInTheDocument();
  });

  it("draws nothing for a cancelled or missed appointment", () => {
    for (const state of ["cancelled", "no_show"]) {
      const { unmount } = render(<GroomProgressBar workflowState={state} petName="Rosie" />);
      expect(screen.queryByTestId("groom-progress"), state).not.toBeInTheDocument();
      unmount();
    }
  });

  it("names the dog for a screen reader", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    expect(screen.getByLabelText("Rosie's progress")).toBeInTheDocument();
  });

  it("marks the current step with aria-current", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    const marked = screen.getByTestId("groom-progress").querySelectorAll('[aria-current="step"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute("data-step")).toBe("bath");
  });

  it("shows no times or durations anywhere", () => {
    // The salon runs behind; a promised time that slips is worse than none.
    for (const state of ["checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete"]) {
      const { container, unmount } = render(<GroomProgressBar workflowState={state} petName="Rosie" />);
      expect(container.textContent, state).not.toMatch(/\d{1,2}[:.]\d{2}|minute|hour|\bam\b|\bpm\b/i);
      unmount();
    }
  });
});
