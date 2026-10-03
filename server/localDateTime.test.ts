import { describe, expect, it } from "vitest";
import { parseBrisbaneLocalDateTime, brisbaneDateKey, brisbaneCalendarPeriod, brisbaneExplicitRange, wholeCalendarYear, yearOptions, MAX_YEARS_OFFERED, localCalendarDay, localCalendarDayKey } from "../shared/localDateTime";

describe("parseBrisbaneLocalDateTime", () => {
  it("interprets a naive datetime-local string as Brisbane (UTC+10) time", () => {
    // 10:30am Brisbane time on 3 Sept 2026 should be 00:30 UTC the same day.
    const result = parseBrisbaneLocalDateTime("2026-09-03T10:30");
    expect(result.toISOString()).toBe("2026-09-03T00:30:00.000Z");
  });

  it("handles naive strings that include seconds", () => {
    const result = parseBrisbaneLocalDateTime("2026-09-03T10:30:15");
    expect(result.toISOString()).toBe("2026-09-03T00:30:15.000Z");
  });

  it("rolls over correctly for times that cross midnight UTC", () => {
    // 5:00am Brisbane is still the previous UTC day.
    const result = parseBrisbaneLocalDateTime("2026-09-03T05:00");
    expect(result.toISOString()).toBe("2026-09-02T19:00:00.000Z");
  });

  it("does NOT re-shift a fully-qualified UTC ISO string (Z suffix)", () => {
    const input = "2026-09-03T00:30:00.000Z";
    const result = parseBrisbaneLocalDateTime(input);
    expect(result.toISOString()).toBe(input);
  });

  it("does NOT re-shift a fully-qualified ISO string with an explicit offset", () => {
    const result = parseBrisbaneLocalDateTime("2026-09-03T10:30:00+10:00");
    expect(result.toISOString()).toBe("2026-09-03T00:30:00.000Z");
  });

  it("throws a clear error for unparseable input", () => {
    expect(() => parseBrisbaneLocalDateTime("not-a-date")).toThrow();
  });
});

describe("the salon day boundary (regression, 30/09/2026)", () => {
  // The dashboard asked the server for "today" with `new Date().setHours(0,0,0,0)`.
  // Render runs UTC, so between 10:00 and 23:59 Brisbane that window covered the
  // WRONG DAY: at 08:51 Brisbane on 30 Sept the board listed 29 Sept's dogs from
  // 10am alongside 30 Sept's up to 10am, and disagreed with both the calendar and
  // the workflow board.
  const brisbaneMidnightUtc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return {
      start: new Date(Date.UTC(y, m - 1, d - 1, 14, 0, 0, 0)),
      endExclusive: new Date(Date.UTC(y, m - 1, d, 14, 0, 0, 0)),
    };
  };

  it("treats 22:51 UTC as the NEXT Brisbane day", () => {
    // The exact moment the bug was reported: 08:51 Brisbane on 30 Sept.
    expect(brisbaneDateKey(new Date("2026-09-29T22:51:00Z"))).toBe("2026-09-30");
  });

  it("does not roll over until 14:00 UTC", () => {
    expect(brisbaneDateKey(new Date("2026-09-29T13:59:59Z"))).toBe("2026-09-29");
    expect(brisbaneDateKey(new Date("2026-09-29T14:00:00Z"))).toBe("2026-09-30");
  });

  it("spans exactly one Brisbane day from midnight to midnight", () => {
    const { start, endExclusive } = brisbaneMidnightUtc("2026-09-30");
    expect(start.toISOString()).toBe("2026-09-29T14:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-09-30T14:00:00.000Z");
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("includes an 07:30 Brisbane appointment on its own day, not the day before", () => {
    const { start, endExclusive } = brisbaneMidnightUtc("2026-09-30");
    const appt = new Date("2026-09-29T21:30:00Z"); // 07:30 Brisbane, 30 Sept
    expect(appt >= start && appt < endExclusive).toBe(true);
    const yesterday = brisbaneMidnightUtc("2026-09-29");
    expect(appt >= yesterday.start && appt < yesterday.endExclusive).toBe(false);
  });
});

describe("brisbaneCalendarPeriod", () => {
  // 3 October 2026 is a Saturday. Brisbane is UTC+10.
  const onThirdOct = new Date("2026-10-02T23:00:00Z"); // 3 Oct 09:00 Brisbane

  it("month means the 1st of this month, not 30 days ago", () => {
    // The actual bug: "This Month" on 3 Oct was showing 3 September.
    const { from, to } = brisbaneCalendarPeriod("month", onThirdOct);
    expect(from.toISOString()).toBe("2026-09-30T14:00:00.000Z"); // 1 Oct 00:00 +10
    expect(to.toISOString()).toBe("2026-10-03T13:59:59.000Z");   // 3 Oct 23:59 +10
  });

  it("year means 1 January", () => {
    const { from } = brisbaneCalendarPeriod("year", onThirdOct);
    expect(from.toISOString()).toBe("2025-12-31T14:00:00.000Z"); // 1 Jan 00:00 +10
  });

  it("week starts Monday, so a trading week is not split in two", () => {
    const { from } = brisbaneCalendarPeriod("week", onThirdOct);
    expect(from.toISOString()).toBe("2026-09-27T14:00:00.000Z"); // Mon 28 Sep 00:00 +10
  });

  it("on a Monday the week starts that same day", () => {
    const monday = new Date("2026-10-04T23:00:00Z"); // Mon 5 Oct 09:00 Brisbane
    const { from } = brisbaneCalendarPeriod("week", monday);
    expect(from.toISOString()).toBe("2026-10-04T14:00:00.000Z");
  });

  it("on the 1st, the month holds a single day", () => {
    const first = new Date("2026-10-31T23:00:00Z"); // 1 Nov 09:00 Brisbane
    const { from, to } = brisbaneCalendarPeriod("month", first);
    expect(from.toISOString()).toBe("2026-10-31T14:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-01T13:59:59.000Z");
  });
});

describe("brisbaneExplicitRange", () => {
  it("covers both days in full", () => {
    const { from, to } = brisbaneExplicitRange("2026-01-01", "2026-12-31");
    expect(from.toISOString()).toBe("2025-12-31T14:00:00.000Z"); // 1 Jan 00:00 +10
    expect(to.toISOString()).toBe("2026-12-31T13:59:59.000Z");   // 31 Dec 23:59 +10
  });

  it("swaps a reversed pair rather than returning nothing", () => {
    // A date picker makes this easy to do by accident.
    const a = brisbaneExplicitRange("2026-12-31", "2026-01-01");
    const b = brisbaneExplicitRange("2026-01-01", "2026-12-31");
    expect(a).toEqual(b);
  });

  it("handles a single day", () => {
    const { from, to } = brisbaneExplicitRange("2026-10-03", "2026-10-03");
    expect(from.toISOString()).toBe("2026-10-02T14:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-03T13:59:59.000Z");
  });

  it("falls back to today rather than producing an invalid range", () => {
    const { from, to } = brisbaneExplicitRange("not-a-date", "2026-10-03");
    expect(Number.isNaN(from.getTime())).toBe(false);
    expect(Number.isNaN(to.getTime())).toBe(false);
  });
});

describe("wholeCalendarYear", () => {
  it("recognises a range that is exactly one calendar year", () => {
    expect(wholeCalendarYear("2024-01-01", "2024-12-31")).toBe("2024");
  });

  it("reports nothing for a part-year, so picking that year still changes something", () => {
    // Month to date in October 2026. If this said "2026", choosing 2026
    // from the year picker would be a no-op and the range would stay on
    // the three days of October.
    expect(wholeCalendarYear("2026-10-01", "2026-10-03")).toBe("");
    expect(wholeCalendarYear("2026-01-01", "2026-10-03")).toBe("");
  });

  it("reports nothing for a range spanning two years", () => {
    expect(wholeCalendarYear("2024-01-01", "2026-12-31")).toBe("");
  });
});

describe("yearOptions", () => {
  const oct2026 = new Date("2026-10-03T04:00:00Z"); // 2pm Brisbane

  it("offers every year the salon has bookings in, newest first", () => {
    expect(yearOptions(2024, 2027, oct2026)).toEqual([2027, 2026, 2025, 2024]);
  });

  it("offers the current year on an empty database", () => {
    expect(yearOptions(null, null, oct2026)).toEqual([2026]);
  });

  it("includes the current year even when the bookings stop short of it", () => {
    expect(yearOptions(2024, 2024, oct2026)).toEqual([2026, 2025, 2024]);
  });

  it("ignores a rogue date rather than listing fifty years", () => {
    // One bad import row with a 1970 timestamp must not swamp the dropdown.
    expect(yearOptions(1970, 2026, oct2026)).toEqual([2026]);
    expect(yearOptions(1900, 2026, oct2026).length).toBeLessThanOrEqual(MAX_YEARS_OFFERED);
  });

  it("caps a long history at MAX_YEARS_OFFERED", () => {
    const years = yearOptions(1990, 2026, oct2026);
    expect(years.length).toBe(MAX_YEARS_OFFERED);
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(2026 - (MAX_YEARS_OFFERED - 1));
  });

  it("uses the Brisbane year, not the machine's", () => {
    // 11pm UTC on 31 December is already 9am on 1 January in Brisbane.
    expect(yearOptions(null, null, new Date("2026-12-31T23:00:00Z"))).toEqual([2027]);
  });
});

describe("localCalendarDay / localCalendarDayKey", () => {
  it("round-trips a day exactly", () => {
    for (const key of ["2024-01-01", "2024-02-29", "2026-10-03", "2027-12-31"]) {
      expect(localCalendarDayKey(localCalendarDay(key))).toBe(key);
    }
  });

  it("lands on the calendar square the key names, not an instant", () => {
    // The whole point: the Brisbane instant for 1 Jan is 31 Dec 14:00 UTC,
    // and a calendar grid that read that would draw the wrong square.
    const day = localCalendarDay("2026-01-01");
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(0);
    expect(day.getDate()).toBe(1);
    expect(day.getHours()).toBe(0);
  });

  it("pads single digits", () => {
    expect(localCalendarDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("normalises a day that does not exist", () => {
    // 2026 is not a leap year. Both callers — brisbaneDateKey and a date
    // input — only ever produce real days, so rolling forward is fine;
    // what matters is that it does not produce an Invalid Date.
    expect(localCalendarDayKey(localCalendarDay("2026-02-29"))).toBe("2026-03-01");
  });
});
