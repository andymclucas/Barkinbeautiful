import { describe, expect, it } from "vitest";
import { changeVersus, previousReportPeriod } from "./reportPreviousPeriod";

const prev = (kind: Parameters<typeof previousReportPeriod>[0]["kind"], fromKey: string, toKey: string) =>
  previousReportPeriod({ kind, fromKey, toKey });

describe("the period a report is compared with", () => {
  it("week to date: the same days of the week before", () => {
    // Mon 16 to Tue 17 Nov -> Mon 9 to Tue 10 Nov.
    expect(prev("wtd", "2026-11-16", "2026-11-17")).toEqual({ fromKey: "2026-11-09", toKey: "2026-11-10", name: "previous week" });
  });

  it("month to date: the 1st to the same day of the month before", () => {
    expect(prev("mtd", "2026-11-01", "2026-11-17")).toEqual({ fromKey: "2026-10-01", toKey: "2026-10-17", name: "previous month" });
    // January looks back into December of the year before.
    expect(prev("mtd", "2026-01-01", "2026-01-20")).toMatchObject({ fromKey: "2025-12-01", toKey: "2025-12-20" });
    // The 31st has no twin in a shorter month: it stops at that month's end.
    expect(prev("mtd", "2026-03-01", "2026-03-31")).toMatchObject({ fromKey: "2026-02-01", toKey: "2026-02-28" });
  });

  it("year to date: 1 January to the same date the year before", () => {
    expect(prev("ytd", "2026-01-01", "2026-11-17")).toEqual({ fromKey: "2025-01-01", toKey: "2025-11-17", name: "previous year" });
    // Leap day has no twin the year before.
    expect(prev("ytd", "2028-01-01", "2028-02-29")).toMatchObject({ toKey: "2027-02-28" });
  });

  it("a rolling window: the same number of days, ending the day before", () => {
    expect(prev("d7", "2026-11-11", "2026-11-17")).toEqual({ fromKey: "2026-11-04", toKey: "2026-11-10", name: "previous 7 days" });
    expect(prev("d30", "2026-10-19", "2026-11-17")).toEqual({ fromKey: "2026-09-19", toKey: "2026-10-18", name: "previous 30 days" });
    expect(prev("y1", "2025-11-18", "2026-11-17")).toMatchObject({ fromKey: "2024-11-18", toKey: "2025-11-17", name: "previous 12 months" });
  });

  it("a whole year picked by hand is compared with the whole year before", () => {
    expect(prev("custom", "2026-01-01", "2026-12-31")).toEqual({ fromKey: "2025-01-01", toKey: "2025-12-31", name: "previous year" });
  });

  it("a whole month picked by hand is compared with the whole month before", () => {
    expect(prev("custom", "2026-03-01", "2026-03-31")).toEqual({ fromKey: "2026-02-01", toKey: "2026-02-28", name: "previous month" });
    expect(prev("custom", "2026-01-01", "2026-01-31")).toMatchObject({ fromKey: "2025-12-01", toKey: "2025-12-31" });
  });

  it("any other hand-picked range: the same length, straight before it", () => {
    expect(prev("custom", "2026-11-03", "2026-11-12")).toEqual({ fromKey: "2026-10-24", toKey: "2026-11-02", name: "previous 10 days" });
    expect(prev("custom", "2026-11-17", "2026-11-17")).toEqual({ fromKey: "2026-11-16", toKey: "2026-11-16", name: "previous 1 day" });
    // Typed back to front.
    expect(prev("custom", "2026-11-12", "2026-11-03")).toMatchObject({ fromKey: "2026-10-24", toKey: "2026-11-02" });
  });
});

describe("how a figure moved", () => {
  it("gives the direction and the size", () => {
    expect(changeVersus(110, 100)).toEqual({ direction: "up", percent: 10 });
    expect(changeVersus(87.5, 100)).toEqual({ direction: "down", percent: 12.5 });
    expect(changeVersus(100, 100)).toEqual({ direction: "flat", percent: 0 });
  });

  it("gives no percentage against nothing", () => {
    expect(changeVersus(500, 0)).toEqual({ direction: "up", percent: null });
    expect(changeVersus(0, 0)).toEqual({ direction: "flat", percent: null });
  });
});
