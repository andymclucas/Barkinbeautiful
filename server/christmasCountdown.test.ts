import { describe, it, expect } from "vitest";
import {
  christmasCountdown, christmasSeason, seasonYearFor, countdownHeadline, countdownSubtitle,
} from "@shared/christmasCountdown";

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("seasonYearFor", () => {
  it("runs from 1 November to Christmas Eve", () => {
    expect(seasonYearFor(day(2026, 11, 1))).toBe(2026);
    expect(seasonYearFor(day(2026, 12, 24))).toBe(2026);
  });

  /**
   * Christmas Day onward is out. Nobody is grooming, and a countdown
   * frozen at "0 to go" for ten months is clutter nobody reads.
   */
  it("is over on Christmas Day and stays over", () => {
    expect(seasonYearFor(day(2026, 12, 25))).toBeNull();
    expect(seasonYearFor(day(2026, 12, 31))).toBeNull();
    expect(seasonYearFor(day(2027, 1, 2))).toBeNull();
    expect(seasonYearFor(day(2027, 6, 15))).toBeNull();
    expect(seasonYearFor(day(2026, 10, 31))).toBeNull();
  });

  it("picks up again the next November", () => {
    expect(seasonYearFor(day(2027, 11, 1))).toBe(2027);
    expect(christmasSeason(2027).end).toEqual(day(2027, 12, 24));
  });
});

describe("christmasCountdown", () => {
  it("counts the dogs and the days left", () => {
    const c = christmasCountdown({ today: day(2026, 11, 2), completed: 6542, remaining: 498 })!;
    expect(c.remaining).toBe(498);
    expect(c.completed).toBe(6542);
    expect(c.percent).toBe(93);
    expect(c.daysLeft).toBe(52);
  });

  it("returns nothing out of season", () => {
    expect(christmasCountdown({ today: day(2026, 7, 1), completed: 10, remaining: 5 })).toBeNull();
  });

  /**
   * A salon with nothing booked and nothing done is at 0%, not 100%.
   * Dividing by zero would read as "all finished" on the quietest
   * possible day, which is the opposite of the truth.
   */
  it("shows 0% on an empty season rather than claiming it is finished", () => {
    const c = christmasCountdown({ today: day(2026, 11, 2), completed: 0, remaining: 0 })!;
    expect(c.percent).toBe(0);
  });

  it("reaches 100% only when nothing is left", () => {
    expect(christmasCountdown({ today: day(2026, 12, 24), completed: 40, remaining: 0 })!.percent).toBe(100);
    expect(christmasCountdown({ today: day(2026, 12, 24), completed: 40, remaining: 1 })!.percent).toBe(98);
  });

  it("never goes negative on junk counts", () => {
    const c = christmasCountdown({ today: day(2026, 11, 2), completed: -5, remaining: -2 })!;
    expect(c.completed).toBe(0);
    expect(c.remaining).toBe(0);
    expect(c.daysLeft).toBeGreaterThanOrEqual(0);
  });

  it("is zero days left on Christmas Eve itself", () => {
    expect(christmasCountdown({ today: day(2026, 12, 24), completed: 1, remaining: 1 })!.daysLeft).toBe(0);
  });
});

describe("wording", () => {
  it("says pet, not pets, when there is one", () => {
    expect(countdownHeadline(1)).toBe("pet to groom till Christmas");
    expect(countdownHeadline(498)).toBe("pets to groom till Christmas");
    expect(countdownHeadline(0)).toBe("pets to groom till Christmas");
  });

  it("says something true on the last day and when it is done", () => {
    const base = { today: day(2026, 12, 24), completed: 6542 };
    expect(countdownSubtitle(christmasCountdown({ ...base, remaining: 0 })!)).toContain("that's the lot");
    expect(countdownSubtitle(christmasCountdown({ ...base, remaining: 3 })!)).toContain("last day before Christmas");
    expect(countdownSubtitle(christmasCountdown({ today: day(2026, 12, 20), completed: 10, remaining: 3 })!))
      .toContain("4 days to go");
  });
});
