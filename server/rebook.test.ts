import { describe, expect, it } from "vitest";
import {
  addWeeks, DEFAULT_REBOOK_WEEKS, gapInWeeks, gapsBetween, rebookInterval,
} from "@shared/rebook";

const d = (iso: string) => new Date(`${iso}T09:00:00+10:00`);

describe("addWeeks", () => {
  it("keeps the same weekday and the same clock time", () => {
    const from = d("2026-11-03"); // a Tuesday
    const to = addWeeks(from, 6);
    expect(to.toISOString()).toBe(new Date("2026-12-15T09:00:00+10:00").toISOString());
  });

  it("is exact across the whole year, because Brisbane has no DST", () => {
    // The same arithmetic in a DST zone would drift an hour here.
    const to = addWeeks(d("2026-03-31"), 8);
    expect(to.toISOString()).toBe(new Date("2026-05-26T09:00:00+10:00").toISOString());
  });
});

describe("rebookInterval", () => {
  it("trusts the membership above everything — it is what they pay for", () => {
    const r = rebookInterval({ membershipTierWeeks: 4, recentGapWeeks: [9, 9, 9] });
    expect(r.weeks).toBe(4);
    expect(r.source).toBe("membership");
    expect(r.reason).toMatch(/membership/);
  });

  it("reads the dog's own rhythm when there is no membership", () => {
    const r = rebookInterval({ recentGapWeeks: [7, 7, 8] });
    expect(r.weeks).toBe(7);
    expect(r.source).toBe("history");
    expect(r.reason).toMatch(/usually about every 7 weeks/);
  });

  /** One long gap over Christmas must not drag the rhythm out. */
  it("uses the median, so one outlier does not move it", () => {
    expect(rebookInterval({ recentGapWeeks: [6, 6, 6, 14] }).weeks).toBe(6);
  });

  it("will not read a rhythm from a single visit", () => {
    const r = rebookInterval({ recentGapWeeks: [7] });
    expect(r.source).toBe("default");
    expect(r.weeks).toBe(DEFAULT_REBOOK_WEEKS);
  });

  /** A year away is a lapsed client, not a cadence worth repeating. */
  it("ignores gaps too long to be a cadence", () => {
    const r = rebookInterval({ recentGapWeeks: [52, 40] });
    expect(r.source).toBe("default");
  });

  it("ignores gaps too short to be a groom cycle", () => {
    const r = rebookInterval({ recentGapWeeks: [1, 1, 1] });
    expect(r.source).toBe("default");
  });

  it("falls back to the house interval with nothing to go on", () => {
    const r = rebookInterval({});
    expect(r.weeks).toBe(DEFAULT_REBOOK_WEEKS);
    expect(r.reason).toMatch(/no pattern yet/);
  });

  it("ignores a membership interval of zero rather than booking today", () => {
    expect(rebookInterval({ membershipTierWeeks: 0 }).source).toBe("default");
  });
});

describe("reading a rhythm", () => {
  it("rounds, because a booking moved a day is the same cadence", () => {
    expect(gapInWeeks(d("2026-01-01"), d("2026-02-11"))).toBe(6); // 41 days
    expect(gapInWeeks(d("2026-01-01"), d("2026-02-13"))).toBe(6); // 43 days
  });

  it("returns gaps most recent first, whatever order it is given", () => {
    const gaps = gapsBetween([d("2026-01-01"), d("2026-04-23"), d("2026-02-12"), d("2026-03-19")]);
    // Jan 1 -> Feb 12 -> Mar 19 -> Apr 23 is 6, 5, 5; newest first.
    expect(gaps).toEqual([5, 5, 6]);
  });

  it("has nothing to say about a single visit", () => {
    expect(gapsBetween([d("2026-01-01")])).toEqual([]);
    expect(gapsBetween([])).toEqual([]);
  });
});
