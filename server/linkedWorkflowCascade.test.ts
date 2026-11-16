import { describe, it, expect } from "vitest";
import {
  stageCanCascade, cascadesAutomatically, shouldCascadeTo, cascadeEligible, describeCascadePrompt, shouldAskAboutLinkedCheckIn,
} from "../shared/linkedWorkflowCascade";

describe("which stages may cascade", () => {
  it("is check-in and complete, and NOTHING in the grooming cycle", () => {
    // Andy, 27/10/2026: "They need to be bathed, dryed etc separately."
    // Two dogs share a car, not a bath.
    for (const s of ["bathing", "drying", "grooming", "ready", "waiting_for_bath", "waiting_for_dry", "waiting_for_groom", "scheduled"]) {
      expect(stageCanCascade(s)).toBe(false);
    }
    expect(stageCanCascade("checked_in")).toBe(true);
    expect(stageCanCascade("complete")).toBe(true);
  });
});

describe("cascadesAutomatically", () => {
  it("asks before checking in, but not before completing", () => {
    // Check-in happens dozens of times a day; silently moving another
    // dog each time is how staff stop trusting the board. Collection
    // happens once and the party leaves together.
    expect(cascadesAutomatically("checked_in")).toBe(false);
    expect(cascadesAutomatically("complete")).toBe(true);
  });
});

describe("shouldCascadeTo", () => {
  it("checks in a dog that has not arrived yet", () => {
    expect(shouldCascadeTo("checked_in", "scheduled")).toBe(true);
  });

  it("NEVER drags a dog backwards out of the bath", () => {
    // That would lose its timings and pull it off the bather's queue.
    for (const state of ["checked_in", "waiting_for_bath", "bathing", "drying", "grooming", "ready", "complete"]) {
      expect(shouldCascadeTo("checked_in", state)).toBe(false);
    }
  });

  it("completes anything not already complete", () => {
    for (const state of ["scheduled", "checked_in", "bathing", "ready"]) {
      expect(shouldCascadeTo("complete", state)).toBe(true);
    }
    expect(shouldCascadeTo("complete", "complete")).toBe(false);
  });
});

describe("cascadeEligible", () => {
  it("leaves cancelled and no-show dogs alone", () => {
    expect(cascadeEligible("cancelled", "scheduled")).toBe(false);
    expect(cascadeEligible("confirmed", "no_show")).toBe(false);
    expect(cascadeEligible("confirmed", "scheduled")).toBe(true);
  });
});

describe("describeCascadePrompt", () => {
  it("names the dogs, so nobody confirms blind", () => {
    expect(describeCascadePrompt(["Ruby"])).toBe("Also check in Ruby?");
    expect(describeCascadePrompt(["Ruby", "Bella"])).toBe("Also check in Ruby and Bella?");
    expect(describeCascadePrompt(["Ruby", "Bella", "Max"])).toBe("Also check in Ruby, Bella and Max?");
  });

  it("says nothing when there is nobody to add", () => {
    expect(describeCascadePrompt([])).toBeNull();
    expect(describeCascadePrompt(["  "])).toBeNull();
  });
});

describe("asking about the rest of the party on check-in", () => {
  it("asks when nobody has answered yet and somebody is still to arrive", () => {
    expect(shouldAskAboutLinkedCheckIn({ workflowState: "checked_in" }, 1)).toBe(true);
  });

  it("does not ask again once the answer is 'just this dog'", () => {
    // 17/11/2026: false was read as 'not asked', so the dialog reopened forever.
    expect(shouldAskAboutLinkedCheckIn({ workflowState: "checked_in", alsoCheckInLinked: false }, 1)).toBe(false);
  });

  it("does not ask again once the answer is 'check in all'", () => {
    expect(shouldAskAboutLinkedCheckIn({ workflowState: "checked_in", alsoCheckInLinked: true }, 2)).toBe(false);
  });

  it("does not ask when there is nobody to add, or the change is not a check-in", () => {
    expect(shouldAskAboutLinkedCheckIn({ workflowState: "checked_in" }, 0)).toBe(false);
    expect(shouldAskAboutLinkedCheckIn({ workflowState: "bathing" }, 3)).toBe(false);
    expect(shouldAskAboutLinkedCheckIn({}, 3)).toBe(false);
  });
});
