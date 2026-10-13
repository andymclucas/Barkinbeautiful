import { describe, it, expect } from "vitest";
import { fillDailySeries } from "@shared/dailySeries";
import { brisbaneDay } from "@shared/collectBy";

describe("fillDailySeries", () => {
  it("fills every day in the range, in order", () => {
    const out = fillDailySeries("2026-10-01", "2026-10-05", new Map([["2026-10-03", 250]]));
    expect(out.map((p) => p.date)).toEqual([
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
    ]);
    // A quiet day is a real zero. A gap would let the line interpolate
    // across a closed Saturday and invent trade that never happened.
    expect(out.map((p) => p.net)).toEqual([0, 0, 250, 0, 0]);
  });

  it("uses the salon's day, not UTC's", () => {
    // This is the bug. The month tile asks for 30 Sep 14:00 UTC, which is
    // 1 October in Brisbane, and the query buckets on Brisbane days. Built
    // from the UTC date the axis began on 30 Sep — a label that can never
    // hold a bucket, so always zero — and stopped a day short at the end.
    const monthStart = new Date("2026-09-30T14:00:00.000Z");
    const tomorrow = new Date("2026-10-13T14:00:00.000Z");
    expect(brisbaneDay(monthStart)).toBe("2026-10-01");
    expect(brisbaneDay(tomorrow)).toBe("2026-10-14");

    const out = fillDailySeries(brisbaneDay(monthStart)!, brisbaneDay(tomorrow)!, new Map());
    expect(out[0].date).toBe("2026-10-01");
    expect(out.at(-1)!.date).toBe("2026-10-14");
    expect(out.map((p) => p.date)).not.toContain("2026-09-30");
  });

  it("crosses a month end", () => {
    const out = fillDailySeries("2026-10-30", "2026-11-02", new Map());
    expect(out.map((p) => p.date)).toEqual([
      "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02",
    ]);
  });

  it("crosses a leap day", () => {
    const out = fillDailySeries("2028-02-27", "2028-03-01", new Map());
    expect(out.map((p) => p.date)).toEqual([
      "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01",
    ]);
  });

  it("returns one point for a single day", () => {
    expect(fillDailySeries("2026-10-01", "2026-10-01", new Map([["2026-10-01", 9]])))
      .toEqual([{ date: "2026-10-01", net: 9 }]);
  });

  it("returns nothing for a backwards range rather than looping forever", () => {
    expect(fillDailySeries("2026-10-05", "2026-10-01", new Map())).toEqual([]);
  });

  it("returns nothing for a key that is not a day", () => {
    // brisbaneDay returns null for an unreadable date and the caller passes
    // "" — which must not become an infinite loop on a dashboard.
    expect(fillDailySeries("", "2026-10-05", new Map())).toEqual([]);
    expect(fillDailySeries("2026-10-01", "", new Map())).toEqual([]);
    expect(fillDailySeries("01/10/2026", "05/10/2026", new Map())).toEqual([]);
  });

  it("ignores buckets outside the range rather than dropping them in", () => {
    const out = fillDailySeries("2026-10-01", "2026-10-02", new Map([["2026-09-30", 999]]));
    expect(out.map((p) => p.net)).toEqual([0, 0]);
  });
});
