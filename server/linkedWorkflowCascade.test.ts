import { describe, it, expect } from "vitest";
import { cascades, shouldCascadeTo, cascadeEligible, CASCADING_STAGES } from "../shared/linkedWorkflowCascade";

describe("which stages cascade", () => {
  it("is check-in and complete, and nothing in between", () => {
    // Moving one dog into the bath says nothing about the other: they
    // share a car, not a bath.
    expect(CASCADING_STAGES).toEqual(["checked_in", "complete"]);
    for (const s of ["bathing", "drying", "grooming", "ready", "waiting_for_bath"]) {
      expect(cascades(s)).toBe(false);
    }
    expect(cascades("checked_in")).toBe(true);
    expect(cascades("complete")).toBe(true);
  });
});

describe("shouldCascadeTo", () => {
  it("checks in a dog that has not arrived yet", () => {
    // Charlie and Ruby Blackaby arrive in one car.
    expect(shouldCascadeTo("checked_in", "scheduled")).toBe(true);
  });

  it("NEVER drags a dog backwards out of the bath", () => {
    // Pulling Ruby back to checked_in would lose her bath timings and
    // take her off the bather's queue mid-wash.
    for (const state of ["checked_in", "waiting_for_bath", "bathing", "drying", "grooming", "ready", "complete"]) {
      expect(shouldCascadeTo("checked_in", state)).toBe(false);
    }
  });

  it("completes anything not already complete", () => {
    // The party leaving is the party leaving, whatever stage each dog
    // happened to reach.
    for (const state of ["scheduled", "checked_in", "bathing", "ready"]) {
      expect(shouldCascadeTo("complete", state)).toBe(true);
    }
    expect(shouldCascadeTo("complete", "complete")).toBe(false);
  });
});

describe("cascadeEligible", () => {
  it("leaves cancelled and no-show dogs alone", () => {
    expect(cascadeEligible("cancelled", "scheduled")).toBe(false);
    expect(cascadeEligible("confirmed", "cancelled")).toBe(false);
    expect(cascadeEligible("confirmed", "no_show")).toBe(false);
    expect(cascadeEligible("confirmed", "scheduled")).toBe(true);
  });
});
