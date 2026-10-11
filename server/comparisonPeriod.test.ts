import { describe, expect, it } from "vitest";
import {
  comparisonRange,
  inclusiveDayCount,
  percentChange,
} from "@shared/comparisonPeriod";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("inclusiveDayCount", () => {
  it("counts both ends", () => {
    expect(inclusiveDayCount(utc("2026-10-05"), utc("2026-10-11"))).toBe(7);
    expect(inclusiveDayCount(utc("2026-10-05"), utc("2026-10-05"))).toBe(1);
  });

  it("ignores the time of day", () => {
    const from = new Date("2026-10-05T23:59:00.000Z");
    const to = new Date("2026-10-06T00:01:00.000Z");
    expect(inclusiveDayCount(from, to)).toBe(2);
  });
});

describe("comparisonRange — prior period", () => {
  it("is the same length, ending the day before", () => {
    const { from, to } = comparisonRange(utc("2026-10-05"), utc("2026-10-11"), "prior_period");
    expect([iso(from), iso(to)]).toEqual(["2026-09-28", "2026-10-04"]);
  });

  it("matches what MoeGo showed for the same week", () => {
    // The screenshot's own comparison line: 05–11 Oct against 28 Sep–04 Oct.
    const { from, to } = comparisonRange(utc("2026-10-05"), utc("2026-10-11"), "prior_period");
    expect(`${iso(from)} - ${iso(to)}`).toBe("2026-09-28 - 2026-10-04");
  });

  it("gives both series the same number of days, so a chart lines up", () => {
    const from = utc("2026-03-01"), to = utc("2026-03-31");
    const prior = comparisonRange(from, to, "prior_period");
    expect(inclusiveDayCount(prior.from, prior.to)).toBe(inclusiveDayCount(from, to));
  });

  it("does not care that the previous calendar month is shorter", () => {
    // 31 days back from 28 Feb lands in January, which is the point: a
    // like-for-like length beats a like-for-like month name.
    const { from, to } = comparisonRange(utc("2026-03-01"), utc("2026-03-31"), "prior_period");
    expect([iso(from), iso(to)]).toEqual(["2026-01-29", "2026-02-28"]);
  });

  it("handles a single day", () => {
    const { from, to } = comparisonRange(utc("2026-10-05"), utc("2026-10-05"), "prior_period");
    expect([iso(from), iso(to)]).toEqual(["2026-10-04", "2026-10-04"]);
  });
});

describe("comparisonRange — prior year", () => {
  it("shifts both ends back a year", () => {
    const { from, to } = comparisonRange(utc("2026-10-05"), utc("2026-10-11"), "prior_year");
    expect([iso(from), iso(to)]).toEqual(["2025-10-05", "2025-10-11"]);
  });

  it("clamps 29 February rather than rolling into March", () => {
    // 2024 was a leap year, 2023 was not. Date would silently make this
    // 1 March, which is not the day anyone means.
    const { from } = comparisonRange(utc("2024-02-29"), utc("2024-03-05"), "prior_year");
    expect(iso(from)).toBe("2023-02-28");
  });

  it("always clamps 29 February, because the year before a leap year never is one", () => {
    // Leap years are four apart, so a 29 February can never have a 29
    // February a year before it. Every leap day clamps.
    for (const leap of ["2024-02-29", "2028-02-29", "2032-02-29"]) {
      const { from } = comparisonRange(utc(leap), utc(leap), "prior_year");
      expect(iso(from)).toBe(`${Number(leap.slice(0, 4)) - 1}-02-28`);
    }
  });

  it("leaves an ordinary date alone", () => {
    const { from, to } = comparisonRange(utc("2026-03-01"), utc("2026-03-31"), "prior_year");
    expect([iso(from), iso(to)]).toEqual(["2025-03-01", "2025-03-31"]);
  });
});

describe("percentChange", () => {
  it("reports a rise and a fall", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(90, 100)).toBeCloseTo(-10);
  });

  it("matches the figure on the screenshot", () => {
    // $16,465.80 against the prior week read -8.83%.
    expect(percentChange(16465.8, 18059.5)!).toBeCloseTo(-8.83, 1);
  });

  it("is null against a zero baseline rather than Infinity", () => {
    // A salon that was shut last January must not read as infinite growth.
    expect(percentChange(500, 0)).toBeNull();
  });

  it("is null when either side is not a number", () => {
    expect(percentChange(NaN, 100)).toBeNull();
    expect(percentChange(100, Infinity)).toBeNull();
  });
});
