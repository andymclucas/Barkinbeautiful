import { describe, expect, it } from "vitest";
import {
  QUICK_SERVICES, QUICK_WORKFLOW_STATES, isQuickService, isQuickWorkflowState,
  nextQuickWorkflowState, quickBoardLabel, quickServiceLabel,
} from "../shared/quickAppointment";

describe("a walk-in nail clip or quick bath", () => {
  it("offers exactly the two services Andy asked for", () => {
    expect(QUICK_SERVICES.map(s => s.label)).toEqual(["Nail Clip", "Quick Bath & Dry"]);
  });

  it("reuses existing service types rather than adding enum values", () => {
    /*
     * The expensive alternative. appointments.service_type is named in 54
     * places across client, server and shared, and CLAUDE.md is explicit
     * that adding a value means auditing every switch and map over it or
     * the UI silently renders nothing. nail_trim IS a nail clip and
     * bath_only IS a bath; what was missing is "and it is a ten-minute
     * walk-in", which is one boolean.
     */
    expect(QUICK_SERVICES.map(s => s.value)).toEqual(["nail_trim", "bath_only"]);
    expect(isQuickService("classic_groom")).toBe(false);
    expect(isQuickService("deshed")).toBe(false);
    expect(isQuickService(null)).toBe(false);
  });

  it("reads on the board the way Andy asked for it", () => {
    expect(quickBoardLabel("nail_trim")).toBe("Walk-In: Nail Clip");
    expect(quickBoardLabel("bath_only")).toBe("Walk-In: Quick Bath & Dry");
  });

  it("does not pretend to know a service it was not given", () => {
    expect(quickServiceLabel("classic_groom")).toBe("Quick appointment");
  });
});

describe("it does not go through the grooming stages", () => {
  it("has three steps and the two endings, and no bath queue", () => {
    // A nail clip does not wait for a bath, get dried, then wait for a
    // groom. Put one through those and it sits in a queue it does not
    // belong to all morning, and the bath priority list counts a dog
    // that needs no bath.
    expect([...QUICK_WORKFLOW_STATES].sort())
      .toEqual(["cancelled", "checked_in", "complete", "no_show", "scheduled"]);
    for (const grooming of ["waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready"]) {
      expect(isQuickWorkflowState(grooming), grooming).toBe(false);
    }
  });

  it("walks forward in three and then stops", () => {
    expect(nextQuickWorkflowState("scheduled")).toBe("checked_in");
    expect(nextQuickWorkflowState("checked_in")).toBe("complete");
    expect(nextQuickWorkflowState("complete")).toBeNull();
    expect(nextQuickWorkflowState("cancelled")).toBeNull();
  });
});
