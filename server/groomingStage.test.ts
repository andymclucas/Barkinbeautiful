import { describe, expect, it } from "vitest";
import { clientFacingStage, isGroomInProgress, GROOMING_STEPS } from "../shared/groomingStage";

/** Every state the appointments table can hold. */
const ALL_WORKFLOW_STATES = [
  "scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry",
  "drying", "waiting_for_groom", "grooming", "ready", "complete",
  "cancelled", "no_show",
];

describe("clientFacingStage", () => {
  it("covers every workflow state", () => {
    // The tracker used to map six of the twelve, so a dog under the dryer
    // was shown to its owner as "Appointment Booked".
    for (const state of ALL_WORKFLOW_STATES) {
      const stage = clientFacingStage(state);
      expect(stage.label, `${state} has no label`).toBeTruthy();
      if (state !== "scheduled") {
        expect(stage, `${state} falls through to scheduled`).not.toEqual(clientFacingStage("scheduled"));
      }
    }
  });

  it("never sends a dog backwards through the steps", () => {
    const order = ALL_WORKFLOW_STATES.filter(s => !["cancelled", "no_show"].includes(s));
    const steps = order.map(s => clientFacingStage(s).step);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i], `${order[i]} goes back from ${order[i - 1]}`).toBeGreaterThanOrEqual(steps[i - 1]);
    }
  });

  it("distinguishes queued from under way", () => {
    expect(clientFacingStage("waiting_for_bath").waiting).toBe(true);
    expect(clientFacingStage("bathing").waiting).toBe(false);
    expect(clientFacingStage("waiting_for_dry").waiting).toBe(true);
    expect(clientFacingStage("drying").waiting).toBe(false);
    expect(clientFacingStage("waiting_for_groom").waiting).toBe(true);
    expect(clientFacingStage("grooming").waiting).toBe(false);
  });

  it("puts drying on its own step rather than calling it a bath", () => {
    expect(clientFacingStage("drying").stepKey).toBe("dry");
    expect(clientFacingStage("bathing").stepKey).toBe("bath");
  });

  it("treats cancelled and no-show as off the track, not as progress", () => {
    for (const state of ["cancelled", "no_show"]) {
      const stage = clientFacingStage(state);
      expect(stage.offTrack).toBe(true);
      expect(stage.step).toBe(-1);
      expect(stage.stepKey).toBeNull();
    }
  });

  it("marks ready and complete as finished", () => {
    expect(clientFacingStage("ready").finished).toBe(true);
    expect(clientFacingStage("complete").finished).toBe(true);
    expect(clientFacingStage("grooming").finished).toBe(false);
  });

  it("falls back to booked for an unknown or missing state", () => {
    // A workflow state added later must not blank a client's page.
    expect(clientFacingStage("teleported").label).toBe("Booked");
    expect(clientFacingStage(null).label).toBe("Booked");
    expect(clientFacingStage(undefined).label).toBe("Booked");
  });

  it("mentions no times anywhere", () => {
    // The salon runs behind; a promised time that slips is worse than none.
    for (const state of ALL_WORKFLOW_STATES) {
      const { label, description } = clientFacingStage(state);
      expect(`${label} ${description}`).not.toMatch(/\b\d{1,2}[:.]\d{2}\b|\bminute|\bhour|\bam\b|\bpm\b/i);
    }
  });

  it("knows when there is something worth watching", () => {
    expect(isGroomInProgress("scheduled")).toBe(false);
    expect(isGroomInProgress("checked_in")).toBe(true);
    expect(isGroomInProgress("drying")).toBe(true);
    expect(isGroomInProgress("ready")).toBe(false);
    expect(isGroomInProgress("cancelled")).toBe(false);
  });

  it("has a step for every entry in GROOMING_STEPS", () => {
    const used = new Set(ALL_WORKFLOW_STATES.map(s => clientFacingStage(s).stepKey).filter(Boolean));
    for (const step of GROOMING_STEPS) expect(used.has(step.key), `${step.key} unreachable`).toBe(true);
  });
});
