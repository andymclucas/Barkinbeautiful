import { describe, expect, it } from "vitest";
import {
  blockoutDateKey, blockoutDateValue, expandDateRange, rangeLengthInDays,
  timeToMinutes, blockoutCovers, findBlockingBlockout,
  BLOCKOUT_REASONS, MAX_BLOCKOUT_DAYS,
} from "@shared/staffBlockouts";

describe("the stored date is a label, not an instant", () => {
  it("reads back the calendar date that was written", () => {
    // The rows in production are midnight UTC and their UTC date is the
    // Brisbane date. Reading them in local time shifts them ten hours and
    // shows 10:00, which looks like a start time and is not one.
    expect(blockoutDateKey(new Date("2026-10-09T00:00:00.000Z"))).toBe("2026-10-09");
    expect(blockoutDateValue("2026-10-09").toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(blockoutDateKey(blockoutDateValue("2026-12-31"))).toBe("2026-12-31");
  });

  it("matches what Calendar.tsx already does with getUTC*", () => {
    const d = new Date("2026-10-09T00:00:00.000Z");
    const asCalendarDoes = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
    expect(blockoutDateKey(d)).toBe(asCalendarDoes);
  });
});

describe("expanding a range into days", () => {
  it("covers both ends — 9th to 20th is twelve days", () => {
    // Andy's actual case. An exclusive end would leave the groomer
    // bookable on her last day of leave.
    const days = expandDateRange("2026-10-09", "2026-10-20");
    expect(days).toHaveLength(12);
    expect(days[0]).toBe("2026-10-09");
    expect(days[11]).toBe("2026-10-20");
    expect(rangeLengthInDays("2026-10-09", "2026-10-20")).toBe(12);
  });

  it("handles a single day", () => {
    expect(expandDateRange("2026-10-09", "2026-10-09")).toEqual(["2026-10-09"]);
    expect(rangeLengthInDays("2026-10-09", "2026-10-09")).toBe(1);
  });

  it("crosses a month and a year boundary without losing a day", () => {
    expect(expandDateRange("2026-10-30", "2026-11-02"))
      .toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(expandDateRange("2026-12-30", "2027-01-02"))
      .toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("includes 29 February in a leap year", () => {
    expect(expandDateRange("2028-02-27", "2028-03-01"))
      .toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("refuses a backwards range rather than inventing days", () => {
    expect(expandDateRange("2026-10-20", "2026-10-09")).toEqual([]);
    expect(rangeLengthInDays("2026-10-20", "2026-10-09")).toBe(0);
  });

  it("caps a runaway range", () => {
    // A mistyped year would otherwise write thousands of rows, one per day.
    expect(expandDateRange("2026-01-01", "2126-01-01").length).toBeLessThanOrEqual(MAX_BLOCKOUT_DAYS + 1);
  });

  it("returns nothing for an unparseable date", () => {
    expect(expandDateRange("not-a-date", "2026-10-09")).toEqual([]);
  });
});

describe("whether a blockout stops a booking", () => {
  const megs = 2;
  const fullDay = { staffId: megs, blockoutDate: "2026-10-09T00:00:00.000Z", isFullDay: true };
  const morning = {
    staffId: megs, blockoutDate: "2026-10-09T00:00:00.000Z",
    isFullDay: false, startTime: "09:00", endTime: "12:00",
  };
  const slot = (o: Partial<{staffId:number;dateKey:string;startMinutes:number;endMinutes:number}> = {}) => ({
    staffId: megs, dateKey: "2026-10-09", startMinutes: 10 * 60, endMinutes: 11 * 60, ...o,
  });

  it("a full day stops everything that day", () => {
    expect(blockoutCovers(fullDay, slot())).toBe(true);
    expect(blockoutCovers(fullDay, slot({ startMinutes: 7*60, endMinutes: 8*60 }))).toBe(true);
    expect(blockoutCovers(fullDay, slot({ startMinutes: 16*60, endMinutes: 17*60 }))).toBe(true);
  });

  it("stops nobody else and no other day", () => {
    expect(blockoutCovers(fullDay, slot({ staffId: 99 }))).toBe(false);
    expect(blockoutCovers(fullDay, slot({ dateKey: "2026-10-10" }))).toBe(false);
  });

  it("a partial blockout stops only what overlaps it", () => {
    expect(blockoutCovers(morning, slot({ startMinutes: 10*60, endMinutes: 11*60 }))).toBe(true);
    expect(blockoutCovers(morning, slot({ startMinutes: 13*60, endMinutes: 14*60 }))).toBe(false);
    expect(blockoutCovers(morning, slot({ startMinutes: 8*60, endMinutes: 9*60+30 }))).toBe(true);
  });

  it("does not clash on the boundaries", () => {
    // A 09:00-12:00 blockout and a 12:00 groom do not conflict. Treating
    // the touching edge as a clash loses a usable slot every time.
    expect(blockoutCovers(morning, slot({ startMinutes: 12*60, endMinutes: 13*60 }))).toBe(false);
    expect(blockoutCovers(morning, slot({ startMinutes: 8*60, endMinutes: 9*60 }))).toBe(false);
  });

  it("treats unreadable times as the whole day, not as no blockout", () => {
    // Someone recorded that they are away. The safe failure is a booking
    // refused, not a dog arriving to find no groomer.
    for (const bad of [null, "", "nonsense", "25:00", "12:99"]) {
      const row = { ...morning, startTime: bad as string | null };
      expect(blockoutCovers(row, slot({ startMinutes: 15*60, endMinutes: 16*60 })), `startTime ${bad}`).toBe(true);
    }
    // End before start is nonsense too, and gets the same treatment.
    expect(blockoutCovers({ ...morning, startTime: "14:00", endTime: "09:00" }, slot())).toBe(true);
  });

  it("finds the blocking row out of many", () => {
    const rows = [
      { staffId: 99, blockoutDate: "2026-10-09T00:00:00.000Z", isFullDay: true },
      morning,
    ];
    expect(findBlockingBlockout(rows, slot({ startMinutes: 10*60, endMinutes: 11*60 }))).toBe(morning);
    expect(findBlockingBlockout(rows, slot({ startMinutes: 13*60, endMinutes: 14*60 }))).toBeNull();
  });
});

describe("the reasons offered", () => {
  it("are the three asked for, in order", () => {
    expect(BLOCKOUT_REASONS).toEqual(["Annual leave", "Personal leave", "Other"]);
  });
});
