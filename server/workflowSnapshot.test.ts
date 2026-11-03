import { describe, expect, it } from "vitest";
import { describeExtra, workflowSnapshot, WORKFLOW_ORDER } from "../shared/workflowSnapshot";

const dog = (workflowState: string, petName = "Dog") => ({ workflowState, petName });

describe("workflowSnapshot", () => {
  /*
   * The bug this replaces. The card listed six of the twelve states, so
   * every dog waiting for a bath, waiting to dry, drying or waiting for
   * a groomer was invisible — 5 of 37 on the morning it was found.
   */
  it("counts every stage, including the four the old card could not show", () => {
    const snap = workflowSnapshot([
      dog("scheduled"), dog("checked_in"),
      dog("waiting_for_bath"), dog("bathing"),
      dog("waiting_for_dry"), dog("drying"),
      dog("waiting_for_groom"), dog("grooming"),
      dog("ready"), dog("complete"),
    ]);
    expect(snap.expected).toBe(10);
    expect(snap.stages.map((s) => s.stage)).toEqual([...WORKFLOW_ORDER]);
    expect(snap.stages.reduce((n, s) => n + s.count, 0)).toBe(10);
  });

  it("adds up to the day", () => {
    const snap = workflowSnapshot([
      dog("scheduled"), dog("scheduled"),
      dog("drying"), dog("waiting_for_groom"),
      dog("ready"), dog("complete"), dog("cancelled"),
    ]);
    expect(snap.notArrived + snap.inSalon + snap.ready + snap.collected).toBe(snap.expected);
    expect(snap.expected).toBe(6);
    expect(snap.notComing).toBe(1);
  });

  /* A cancelled dog is not part of the day's work and must not drag
     the progress bar down for ever. */
  it("keeps the not-coming out of the total and the progress", () => {
    const snap = workflowSnapshot([dog("complete"), dog("cancelled"), dog("no_show")]);
    expect(snap.expected).toBe(1);
    expect(snap.notComing).toBe(2);
    expect(snap.progress).toBe(1);
  });

  /* Ready counts as done — the groom is finished and the rest is the
     owner's half of the day. */
  it("treats ready as finished for progress", () => {
    const snap = workflowSnapshot([dog("ready"), dog("grooming")]);
    expect(snap.progress).toBe(0.5);
  });

  it("reports no progress on an empty day rather than dividing by zero", () => {
    const snap = workflowSnapshot([]);
    expect(snap.progress).toBe(0);
    expect(snap.expected).toBe(0);
    expect(snap.stages).toEqual([]);
  });

  it("hides stages nobody is in, so the card is not six empty rows", () => {
    const snap = workflowSnapshot([dog("bathing"), dog("bathing")]);
    expect(snap.stages).toHaveLength(1);
    expect(snap.stages[0]).toMatchObject({ stage: "bathing", count: 2 });
  });

  it("names who is in each stage, capped", () => {
    const snap = workflowSnapshot(
      [dog("bathing", "Oakley"), dog("bathing", "Norman"), dog("bathing", "Rommy"), dog("bathing", "Alfie")],
      { names: 3 },
    );
    expect(snap.stages[0].petNames).toEqual(["Oakley", "Norman", "Rommy"]);
    expect(snap.stages[0].count).toBe(4);
  });

  it("copes with a dog that has no name", () => {
    const snap = workflowSnapshot([{ workflowState: "bathing", petName: null }]);
    expect(snap.stages[0].count).toBe(1);
    expect(snap.stages[0].petNames).toEqual([]);
  });

  /*
   * An unknown state is counted nowhere rather than folded into "to
   * come" — that is how a dog ends up shown in a stage it is not in.
   */
  it("ignores a state it does not recognise", () => {
    const snap = workflowSnapshot([dog("scheduled"), dog("teleported")]);
    expect(snap.expected).toBe(1);
    expect(snap.notComing).toBe(0);
  });

  it("keeps the stages in the order a dog moves through them", () => {
    const snap = workflowSnapshot([dog("ready"), dog("checked_in"), dog("grooming")]);
    expect(snap.stages.map((s) => s.stage)).toEqual(["checked_in", "grooming", "ready"]);
  });
});

describe("describeExtra", () => {
  it("says how many were not named", () => {
    expect(describeExtra(5, 3)).toBe("+2 more");
    expect(describeExtra(3, 3)).toBeNull();
    expect(describeExtra(1, 3)).toBeNull();
  });
});
