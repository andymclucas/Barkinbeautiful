import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STATES, workflowStateLabel, workflowStateShortLabel, isWorkflowState,
} from "@shared/workflowStateLabels";
import { clientFacingStage } from "@shared/groomingStage";

describe("bath prep", () => {
  it("is what staff see, not 'wait for bath'", () => {
    // Andy, 08/10/2026. The dog is not queueing — its nails, pads and
    // sanitary are being done — and calling that waiting made the board
    // read as idle time.
    expect(workflowStateLabel("waiting_for_bath")).toBe("Bath Prep");
    expect(workflowStateShortLabel("waiting_for_bath")).toBe("PREP");
  });

  it("is what the dog's owner sees on the tracker too", () => {
    // One state must not be called two contradictory things.
    const stage = clientFacingStage("waiting_for_bath");
    expect(stage.label).toBe("Bath prep");
    expect(stage.label.toLowerCase()).not.toContain("waiting");
  });

  it("leaves the two genuine queues named as waits", () => {
    // A bathed dog waiting for a dryer really is waiting.
    expect(workflowStateLabel("waiting_for_dry")).toBe("Wait for Dry");
    expect(workflowStateLabel("waiting_for_groom")).toBe("Wait for Groom");
  });

  it("does not change the stored value", () => {
    // 115 workflow_logs rows and six live appointments reference it.
    expect(WORKFLOW_STATES).toContain("waiting_for_bath");
    expect(isWorkflowState("waiting_for_bath")).toBe(true);
    expect(isWorkflowState("bath_prep")).toBe(false);
  });
});

describe("every state has a name", () => {
  it("covers all twelve", () => {
    expect(WORKFLOW_STATES).toHaveLength(12);
    for (const state of WORKFLOW_STATES) {
      expect(workflowStateLabel(state)).not.toBe("");
      expect(workflowStateLabel(state)).not.toContain("_");
    }
  });

  it("tidies an unrecognised value properly, not just its first underscore", () => {
    // The old Calendar dropdown used .replace("_", " "), which replaces one
    // underscore, so waiting_for_dry would have read "Waiting For_dry".
    expect(workflowStateLabel("some_unknown_state")).toBe("Some Unknown State");
  });

  it("says something for nothing at all", () => {
    expect(workflowStateLabel(null)).toBe("Unknown");
    expect(workflowStateShortLabel(undefined)).toBe("—");
  });
});
