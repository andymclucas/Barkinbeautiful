import { describe, expect, it } from "vitest";
import { collectByStatus, formatCollectBy, RISK_ORDER } from "@shared/collectBy";

/** Midday Brisbane on 8 October 2026, as the instant it happens. */
const NOON = new Date("2026-10-08T02:00:00Z");
const at = (brisbaneHour: number, minute = 0) =>
  new Date(Date.UTC(2026, 9, 8, brisbaneHour - 10, minute));

describe("showing the deadline", () => {
  it("reads it in the salon's timezone, not the server's", () => {
    // Render runs UTC. A midday Brisbane deadline is 02:00 UTC, and a
    // server-local clock would put it on the board as 02:00.
    expect(formatCollectBy(NOON)).toBe("12:00");
  });

  it("says nothing for a dog with no deadline", () => {
    expect(formatCollectBy(null)).toBeNull();
    expect(collectByStatus({ collectBy: null, workflowState: "bathing" }).risk).toBe("none");
  });
});

describe("whether a dog will make it", () => {
  it("warns while there is still something to do about it", () => {
    // The whole point. A giant still in Bath Prep at 11:00 needs three
    // hours and has one — a bather should see that at 11:00, not at 12:01.
    const status = collectByStatus({
      collectBy: NOON, workflowState: "waiting_for_bath",
      sizeBand: "giant", now: at(11),
    });
    expect(status.risk).toBe("at_risk");
    expect(status.minutesLeft).toBe(60);
    expect(status.minutesNeeded).toBe(171);
  });

  it("leaves a small dog with hours to spare alone", () => {
    const status = collectByStatus({
      collectBy: NOON, workflowState: "waiting_for_bath",
      sizeBand: "small", now: at(9),
    });
    expect(status.risk).toBe("comfortable");
  });

  it("calls it tight when the slack is under half an hour", () => {
    // Small dog, 57 minutes of work left, 80 minutes on the clock.
    const status = collectByStatus({
      collectBy: NOON, workflowState: "waiting_for_bath",
      sizeBand: "small", now: at(10, 40),
    });
    expect(status.risk).toBe("tight");
  });

  it("does not panic about a dog that is already finished", () => {
    // Ready with ten minutes to go is fine, however close the deadline.
    const status = collectByStatus({
      collectBy: NOON, workflowState: "ready", sizeBand: "giant", now: at(11, 50),
    });
    expect(status.risk).toBe("comfortable");
    expect(status.minutesNeeded).toBe(0);
  });

  it("says overdue once the time has passed", () => {
    expect(collectByStatus({ collectBy: NOON, workflowState: "grooming", now: at(12, 30) }).risk)
      .toBe("overdue");
    // Even a finished dog is overdue if nobody has collected it.
    expect(collectByStatus({ collectBy: NOON, workflowState: "ready", now: at(12, 30) }).risk)
      .toBe("overdue");
  });

  it("assumes an hour for a dog with no size recorded", () => {
    // 54 of the salon's active dogs have no band. Assuming nothing would
    // mean never warning about them.
    const status = collectByStatus({
      collectBy: NOON, workflowState: "checked_in", now: at(11, 30),
    });
    expect(status.minutesNeeded).toBe(60);
    expect(status.risk).toBe("at_risk");
  });

  it("accounts for how far through the groom the dog is", () => {
    const common = { collectBy: NOON, sizeBand: "large" as const, now: at(11) };
    const early = collectByStatus({ ...common, workflowState: "checked_in" });
    const late = collectByStatus({ ...common, workflowState: "grooming" });
    expect(early.minutesNeeded).toBeGreaterThan(late.minutesNeeded);
    expect(early.risk).toBe("at_risk");
    expect(late.risk).toBe("comfortable");
  });
});

describe("ordering the board", () => {
  it("puts the dog in most trouble first", () => {
    const order = (["none", "comfortable", "tight", "at_risk", "overdue"] as const)
      .slice().sort((a, b) => RISK_ORDER[a] - RISK_ORDER[b]);
    expect(order).toEqual(["overdue", "at_risk", "tight", "comfortable", "none"]);
  });
});
