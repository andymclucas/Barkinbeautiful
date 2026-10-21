import { describe, expect, it } from "vitest";
import {
  clientFacingStage, isGroomInProgress, stepStatus, GROOMING_STEPS,
} from "../shared/groomingStage";

/** Every state the appointments table can hold. */
const ALL_WORKFLOW_STATES = [
  "scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry",
  "drying", "waiting_for_groom", "grooming", "ready", "complete",
  "cancelled", "no_show",
];

const WAITING_STATES = ["waiting_for_bath", "waiting_for_dry", "waiting_for_groom"];

describe("the six steps a client sees", () => {
  it("is exactly the list Andy named, in order", () => {
    // 21/10/2026. Six, not seven: "Booked" is not a stage of the grooming
    // cycle and six grey dots on the morning of a booking invite the
    // question "why has nothing started".
    expect(GROOMING_STEPS.map((s) => s.label)).toEqual([
      "Checked in", "Bathing", "Drying", "Grooming", "Ready for pickup", "Picked up",
    ]);
  });

  it("has a state that reaches every step, so none is dead", () => {
    const used = new Set(ALL_WORKFLOW_STATES.map((s) => clientFacingStage(s).stepKey).filter(Boolean));
    for (const step of GROOMING_STEPS) expect(used.has(step.key), `${step.key} unreachable`).toBe(true);
  });
});

describe("the delays between stages are hidden", () => {
  /**
   * Andy, 21/10/2026: "Client doesn't need to see the potential delays in
   * between each stage of the grooming cycle though."
   */
  it("shows a dog in the dryer queue as being dried", () => {
    expect(clientFacingStage("waiting_for_dry").label).toBe("Being dried");
    expect(clientFacingStage("waiting_for_dry").stepKey).toBe("dry");
  });

  it("shows a dog in the groomer queue as with the groomer", () => {
    expect(clientFacingStage("waiting_for_groom").label).toBe("With the groomer");
    expect(clientFacingStage("waiting_for_groom").stepKey).toBe("groom");
  });

  it("makes a queued dog indistinguishable from one under way", () => {
    // The whole requirement in one assertion. If these ever diverge, the
    // client can read the queue off the page.
    expect(clientFacingStage("waiting_for_dry").step).toBe(clientFacingStage("drying").step);
    expect(clientFacingStage("waiting_for_dry").label).toBe(clientFacingStage("drying").label);
    expect(clientFacingStage("waiting_for_groom").step).toBe(clientFacingStage("grooming").step);
    expect(clientFacingStage("waiting_for_groom").label).toBe(clientFacingStage("grooming").label);
  });

  it("never uses the word waiting about a queue", () => {
    // "Waiting to be dried" and "Waiting for the groomer" are what this
    // replaced. "Waiting for you" on the ready step is a different thing
    // and is fine, so only the queue states are checked.
    for (const state of WAITING_STATES) {
      const { label, description } = clientFacingStage(state);
      expect(`${label} ${description}`, state).not.toMatch(/\bwait/i);
      expect(`${label} ${description}`, state).not.toMatch(/\bqueue/i);
      expect(`${label} ${description}`, state).not.toMatch(/\bdelay/i);
    }
  });

  it("keeps bath prep described as the work it is", () => {
    // Not a queue: the dog's nails, pads and sanitary are being done.
    // Telling an owner their dog is waiting while somebody is working on
    // it undersells the salon and reads as a delay.
    const stage = clientFacingStage("waiting_for_bath");
    expect(stage.label).toBe("Bath prep");
    expect(stage.description).toMatch(/nails/i);
    expect(stage.stepKey).toBe("bath");
  });
});

describe("completed versus in progress", () => {
  /**
   * Andy flagged this may flip: "This may change to show when these
   * things are completed rather than in progress."
   */
  it("counts a step done only once it is actually finished", () => {
    // A dog being bathed has finished Checked in and nothing else.
    const bathing = clientFacingStage("bathing");
    expect(bathing.completedThrough).toBe(0);
    expect(stepStatus(bathing, 0)).toBe("done");
    expect(stepStatus(bathing, 1)).toBe("current");
    expect(stepStatus(bathing, 2)).toBe("upcoming");
  });

  it("treats a dog in a queue as having finished the previous step", () => {
    // waiting_for_dry: the bath IS done, the dryer has not started.
    const waiting = clientFacingStage("waiting_for_dry");
    expect(stepStatus(waiting, 1)).toBe("done");
    expect(stepStatus(waiting, 2)).toBe("current");
  });

  it("marks all six done once the dog has gone home", () => {
    const collected = clientFacingStage("complete");
    expect(collected.completedThrough).toBe(GROOMING_STEPS.length - 1);
    for (let i = 0; i < GROOMING_STEPS.length; i++) {
      expect(stepStatus(collected, i), GROOMING_STEPS[i].key).toBe("done");
    }
  });

  it("does not mark the ready step done while the dog is still there", () => {
    // It is current, not finished — the client has not collected them.
    const ready = clientFacingStage("ready");
    expect(stepStatus(ready, 4)).toBe("current");
    expect(stepStatus(ready, 3)).toBe("done");
    expect(stepStatus(ready, 5)).toBe("upcoming");
  });

  it("marks nothing done before the dog arrives", () => {
    const booked = clientFacingStage("scheduled");
    expect(booked.completedThrough).toBe(-1);
    for (let i = 0; i < GROOMING_STEPS.length; i++) {
      expect(stepStatus(booked, i)).toBe("upcoming");
    }
  });
});

describe("the live card", () => {
  it("shows a dog that is ready for pickup", () => {
    // This is the regression that was pinned the other way. `ready`
    // carries finished: true, and the old check tested that flag, so a
    // dog on the bench waiting to be collected dropped off the client's
    // live card at the exact moment they most want to see it.
    expect(isGroomInProgress("ready")).toBe(true);
  });

  it("shows a dog at every stage inside the salon", () => {
    for (const state of ["checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready"]) {
      expect(isGroomInProgress(state), state).toBe(true);
    }
  });

  it("drops it once the dog has gone home, or never arrived", () => {
    for (const state of ["scheduled", "complete", "cancelled", "no_show"]) {
      expect(isGroomInProgress(state), state).toBe(false);
    }
  });
});

describe("clientFacingStage, generally", () => {
  it("covers every workflow state", () => {
    for (const state of ALL_WORKFLOW_STATES) {
      const stage = clientFacingStage(state);
      expect(stage.label, `${state} has no label`).toBeTruthy();
      expect(stage.description, `${state} has no description`).toBeTruthy();
    }
  });

  it("never sends a dog backwards through the steps", () => {
    const order = ALL_WORKFLOW_STATES.filter((s) => !["cancelled", "no_show"].includes(s));
    const steps = order.map((s) => clientFacingStage(s).step);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i], `${order[i]} goes back from ${order[i - 1]}`).toBeGreaterThanOrEqual(steps[i - 1]);
    }
  });

  it("never sends the completed count backwards either", () => {
    const order = ALL_WORKFLOW_STATES.filter((s) => !["cancelled", "no_show"].includes(s));
    const done = order.map((s) => clientFacingStage(s).completedThrough);
    for (let i = 1; i < done.length; i++) {
      expect(done[i], `${order[i]} un-completes a step`).toBeGreaterThanOrEqual(done[i - 1]);
    }
  });

  it("keeps a booked dog off the bar", () => {
    expect(clientFacingStage("scheduled").onBar).toBe(false);
    expect(clientFacingStage("scheduled").step).toBe(-1);
    expect(clientFacingStage("checked_in").onBar).toBe(true);
  });

  it("treats cancelled and no-show as off the track, not as progress", () => {
    for (const state of ["cancelled", "no_show"]) {
      const stage = clientFacingStage(state);
      expect(stage.offTrack).toBe(true);
      expect(stage.step).toBe(-1);
      expect(stage.stepKey).toBeNull();
      expect(stage.onBar).toBe(false);
    }
  });

  it("falls back to booked for an unknown or missing state", () => {
    // A workflow state added later must not blank a client's page.
    for (const bad of ["teleported", null, undefined, ""]) {
      expect(clientFacingStage(bad).label).toBe("Booked");
    }
  });

  it("mentions no times anywhere", () => {
    // The salon runs behind; a promised time that slips is worse than none.
    for (const state of ALL_WORKFLOW_STATES) {
      const { label, description } = clientFacingStage(state);
      expect(`${label} ${description}`).not.toMatch(/\b\d{1,2}[:.]\d{2}\b|\bminute|\bhour|\bam\b|\bpm\b/i);
    }
  });
});
