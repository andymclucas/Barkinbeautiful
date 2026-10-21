import { describe, expect, it } from "vitest";
import { brisbaneDay, collectByInstant, collectByStatus, collectByTone, formatCollectBy, RISK_ORDER } from "@shared/collectBy";
import type { CollectByRisk } from "@shared/collectBy";

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

describe("collectByInstant", () => {
  it("reads a Brisbane wall clock as UTC+10", () => {
    // Midday in Brisbane is 02:00Z the same day.
    expect(collectByInstant("2026-10-13", "12:00")?.toISOString()).toBe("2026-10-13T02:00:00.000Z");
    expect(collectByInstant("2026-10-13", "09:30")?.toISOString()).toBe("2026-10-12T23:30:00.000Z");
  });

  it("holds the offset across a southern-hemisphere DST changeover", () => {
    // Brisbane does not observe daylight saving, which is the only reason a
    // fixed offset is safe. A salon in Sydney would need a real library.
    expect(collectByInstant("2026-01-15", "12:00")?.toISOString()).toBe("2026-01-15T02:00:00.000Z");
    expect(collectByInstant("2026-07-15", "12:00")?.toISOString()).toBe("2026-07-15T02:00:00.000Z");
  });

  it("round trips with the formatter staff actually read", () => {
    const instant = collectByInstant("2026-10-13", "12:00");
    expect(formatCollectBy(instant)).toBe("12:00");
  });

  it("clears rather than storing an Invalid Date", () => {
    expect(collectByInstant(null, "12:00")).toBeNull();
    expect(collectByInstant("2026-10-13", null)).toBeNull();
    expect(collectByInstant("2026-10-13", "")).toBeNull();
    expect(collectByInstant("13/10/2026", "12:00")).toBeNull();
    expect(collectByInstant("2026-10-13", "25:00")).toBeNull();
    expect(collectByInstant("2026-10-13", "noon")).toBeNull();
  });
});

describe("brisbaneDay", () => {
  it("gives the salon's own calendar day, not UTC's", () => {
    // 23:30Z on the 12th is already 09:30 on the 13th in the salon.
    expect(brisbaneDay(new Date("2026-10-12T23:30:00Z"))).toBe("2026-10-13");
    expect(brisbaneDay(new Date("2026-10-13T02:00:00Z"))).toBe("2026-10-13");
  });

  it("returns null for an unreadable value", () => {
    expect(brisbaneDay("not a date")).toBeNull();
  });
});

describe("the out-time sticker is red at every risk level", () => {
  /**
   * Lauren, 22/10/2026: "Love the time out note but need BRIGHT RED
   * STICKER." It used to be slate when comfortable, which on a board of
   * thirty dogs is a badge nobody sees.
   */
  const ALL: CollectByRisk[] = ["comfortable", "tight", "at_risk", "overdue"];

  it("is red even when the dog is comfortably on track", () => {
    expect(collectByTone("comfortable")).toContain("bg-red-");
  });

  it("is red for every risk level, with no amber or slate anywhere", () => {
    for (const risk of ALL) {
      const tone = collectByTone(risk);
      expect(tone, risk).toContain("bg-red-");
      expect(tone, risk).not.toMatch(/amber|slate|yellow|gray|grey/);
    }
  });

  it("escalates by volume rather than by changing colour", () => {
    // A ring when the sums stop working; a pulse and nothing quieter
    // once the time has actually gone.
    expect(collectByTone("comfortable")).not.toContain("ring");
    expect(collectByTone("at_risk")).toContain("ring");
    expect(collectByTone("overdue")).toContain("ring");
    expect(collectByTone("overdue")).toContain("animate-pulse");
    expect(collectByTone("at_risk")).not.toContain("animate-pulse");
  });

  it("only animates for viewers who allow motion", () => {
    expect(collectByTone("overdue")).toContain("motion-safe:animate-pulse");
    expect(collectByTone("overdue")).not.toMatch(/(^|\s)animate-pulse/);
  });

  it("keeps white text on every variant, so it stays legible", () => {
    for (const risk of ALL) expect(collectByTone(risk), risk).toContain("text-white");
  });
});
