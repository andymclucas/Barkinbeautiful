import { describe, expect, it } from "vitest";
import { deriveWorkflowTimingUpdate } from "./workflowTiming";

describe("deriveWorkflowTimingUpdate", () => {
  it("records bath completion and dry start at the same transition time", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "bathing", bathingStartedAt: 1_000 },
      "drying",
      2_000,
    );

    expect(result).toMatchObject({
      stageStartedAt: 2_000,
      bathingCompletedAt: 2_000,
      dryingStartedAt: 2_000,
    });
  });

  it("pauses between bath and dry without starting the dry timer", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "bathing", bathingStartedAt: 1_000, bathingCompletedAt: null },
      "waiting_for_dry",
      2_000,
    );

    expect(result).toMatchObject({
      stageStartedAt: null,
      bathingCompletedAt: 2_000,
    });
    expect(result).not.toHaveProperty("dryingStartedAt");
  });

  it("starts the next active stage after an inter-stage pause without rewriting the prior completed timer", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "waiting_for_dry", bathingCompletedAt: 2_000, dryingStartedAt: null },
      "drying",
      4_000,
    );

    expect(result).toMatchObject({
      stageStartedAt: 4_000,
      dryingStartedAt: 4_000,
    });
    expect(result).not.toHaveProperty("bathingCompletedAt");
  });

  it("preserves first pass stage start times when a pet returns to that stage", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "ready", groomingStartedAt: 1_000 },
      "grooming",
      3_000,
    );

    expect(result).toMatchObject({
      stageStartedAt: 3_000,
      groomingStartedAt: 1_000,
    });
  });

  it("records total completion timing once", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "ready", completedAt: null, actualEnd: null },
      "complete",
      5_000,
    );

    expect(result.completedAt).toBe(5_000);
    expect(result.actualEnd).toEqual(new Date(5_000));
  });

  it("stops the active stage timer even when staff drag directly to a later stage", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "bathing", bathingStartedAt: 1_000, bathingCompletedAt: null },
      "grooming",
      4_000,
    );

    expect(result).toMatchObject({
      stageStartedAt: 4_000,
      bathingCompletedAt: 4_000,
      groomingStartedAt: 4_000,
    });
  });

  it("supports waiting for bath and waiting for groom as non-active inter-stage pauses", () => {
    const waitingForBath = deriveWorkflowTimingUpdate(
      { workflowState: "checked_in", checkedInAt: 1_000 },
      "waiting_for_bath",
      2_000,
    );
    const waitingForGroom = deriveWorkflowTimingUpdate(
      { workflowState: "drying", dryingStartedAt: 3_000, dryingCompletedAt: null },
      "waiting_for_groom",
      5_000,
    );

    expect(waitingForBath).toMatchObject({ stageStartedAt: null });
    expect(waitingForGroom).toMatchObject({ stageStartedAt: null, dryingCompletedAt: 5_000 });
  });

  it("records timing when an administrator manually selects any later workflow stage", () => {
    const result = deriveWorkflowTimingUpdate(
      { workflowState: "drying", dryingStartedAt: 1_000, dryingCompletedAt: null },
      "ready",
      6_000,
    );

    expect(result).toMatchObject({
      stageStartedAt: 6_000,
      dryingCompletedAt: 6_000,
      readyAt: 6_000,
    });
  });

  it("stops the visible stage timer when a booking is cancelled or marked no-show", () => {
    const cancelled = deriveWorkflowTimingUpdate(
      { workflowState: "bathing", bathingStartedAt: 100 },
      "cancelled",
      200,
    );
    const noShow = deriveWorkflowTimingUpdate({ workflowState: "scheduled" }, "no_show", 200);

    expect(cancelled).toMatchObject({ stageStartedAt: null, bathingCompletedAt: 200 });
    expect(noShow).toMatchObject({ stageStartedAt: null });
  });
});
