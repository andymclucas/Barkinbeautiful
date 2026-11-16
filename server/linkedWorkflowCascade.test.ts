import { describe, it, expect } from "vitest";
import {
  stageCanCascade, cascadesAutomatically, shouldCascadeTo, cascadeEligible, describeCascadePrompt, shouldAskAboutLinkedCheckIn, partyKeyOf, inSameParty,
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

describe("what makes dogs one party", () => {
  const nine = new Date("2026-11-17T23:00:00Z");

  it("is the booking session first", () => {
    expect(partyKeyOf({ sessionId: "s1", petFamilyGroupId: 4, scheduledStart: nine })).toEqual({ kind: "session", sessionId: "s1" });
    expect(inSameParty({ sessionId: "s1" }, { sessionId: "s1" })).toBe(true);
    expect(inSameParty({ sessionId: "s1" }, { sessionId: "s2" })).toBe(false);
  });

  it("else the same family at the same time", () => {
    const a = { petFamilyGroupId: 4, scheduledStart: nine };
    expect(inSameParty(a, { petFamilyGroupId: 4, scheduledStart: new Date(nine) })).toBe(true);
    expect(inSameParty(a, { petFamilyGroupId: 4, scheduledStart: nine.toISOString() })).toBe(true);
    expect(inSameParty(a, { petFamilyGroupId: 4, scheduledStart: new Date("2026-11-18T01:00:00Z") })).toBe(false);
    expect(inSameParty(a, { petFamilyGroupId: 5, scheduledStart: nine })).toBe(false);
  });

  it("a dog on a session is not matched to family dogs outside it", () => {
    expect(inSameParty(
      { sessionId: "s1", petFamilyGroupId: 4, scheduledStart: nine },
      { sessionId: null, petFamilyGroupId: 4, scheduledStart: nine },
    )).toBe(false);
  });

  it("a dog that came alone has no party", () => {
    expect(partyKeyOf({ sessionId: null, petFamilyGroupId: null, scheduledStart: nine })).toBeNull();
    expect(partyKeyOf({ sessionId: "  ", petFamilyGroupId: null })).toBeNull();
    expect(inSameParty({}, {})).toBe(false);
  });

  it("a shared bath is not a party", () => {
    // Olive and Lulu, 17/11/2026: two households linked only to share a bath.
    const olive = { bathGroupId: "bath-x", sessionId: null, petFamilyGroupId: null, scheduledStart: nine };
    const lulu = { bathGroupId: "bath-x", sessionId: null, petFamilyGroupId: 9, scheduledStart: nine };
    expect(partyKeyOf(olive)).toBeNull();
    expect(inSameParty(olive, lulu)).toBe(false);
    expect(inSameParty(lulu, olive)).toBe(false);
  });

  it("a bath of its own does not take a dog out of its family", () => {
    const ruby = { bathGroupId: "bath-solo", petFamilyGroupId: 4, scheduledStart: nine };
    const charlie = { bathGroupId: null, petFamilyGroupId: 4, scheduledStart: nine };
    expect(inSameParty(ruby, charlie)).toBe(true);
  });
});
