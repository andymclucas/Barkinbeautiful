import { describe, expect, it } from "vitest";
import {
  isTerminalWorkflowState,
  shouldShowWorkflowRow,
} from "../client/src/lib/workflowTerminalStates";

describe("terminal workflow states", () => {
  it("classifies completed, cancelled and no-show appointments as terminal", () => {
    expect(isTerminalWorkflowState("complete")).toBe(true);
    expect(isTerminalWorkflowState("cancelled")).toBe(true);
    expect(isTerminalWorkflowState("no_show")).toBe(true);
    expect(isTerminalWorkflowState("drying")).toBe(false);
  });

  it("keeps terminal outcomes out of the active controller register unless explicitly reviewed", () => {
    expect(shouldShowWorkflowRow({ state: "bathing", showCompleted: false, stageFilter: "__all__" })).toBe(true);
    expect(shouldShowWorkflowRow({ state: "complete", showCompleted: false, stageFilter: "__all__" })).toBe(false);
    expect(shouldShowWorkflowRow({ state: "cancelled", showCompleted: false, stageFilter: "__all__" })).toBe(false);
    expect(shouldShowWorkflowRow({ state: "no_show", showCompleted: false, stageFilter: "__all__" })).toBe(false);
    expect(shouldShowWorkflowRow({ state: "complete", showCompleted: false, stageFilter: "complete" })).toBe(true);
    expect(shouldShowWorkflowRow({ state: "cancelled", showCompleted: false, stageFilter: "cancelled" })).toBe(true);
    expect(shouldShowWorkflowRow({ state: "no_show", showCompleted: false, stageFilter: "no_show" })).toBe(true);
  });
});
