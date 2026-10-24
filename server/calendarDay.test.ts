import { describe, it, expect } from "vitest";
import { dayInZone, addCalendarDays, isDayBefore, timeOfDayInZone } from "../shared/calendarDay";

describe("addCalendarDays", () => {
  it("actually advances a day — the bug this replaces did not", () => {
    // The wall display's resetForTomorrow parsed "2026-10-23T00:00:00" as
    // LOCAL time, added a day, then read it back as UTC. In Brisbane the
    // two conversions cancel exactly and every date mapped to itself.
    expect(addCalendarDays("2026-10-23", 1)).toBe("2026-10-24");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-10-24", -1)).toBe("2026-10-23");
  });

  it("is immune to the machine's own timezone", () => {
    // The old version's answer depended on where the browser was. This
    // one does UTC arithmetic on a date with no time, so there is no
    // offset to apply.
    const original = process.env.TZ;
    for (const tz of ["Australia/Brisbane", "America/Los_Angeles", "Europe/London", "Pacific/Auckland", "UTC"]) {
      process.env.TZ = tz;
      expect(addCalendarDays("2026-10-23", 1)).toBe("2026-10-24");
    }
    process.env.TZ = original;
  });

  it("rolls month, year and leap-year boundaries", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
    expect(addCalendarDays("2027-02-28", 1)).toBe("2027-03-01"); // 2027 is not
    expect(addCalendarDays("2026-10-23", 365)).toBe("2027-10-23");
  });

  it("refuses anything that is not a plain date", () => {
    for (const bad of [null, undefined, "", "23/10/2026", "2026-10", "not a date"]) {
      expect(addCalendarDays(bad, 1)).toBeNull();
    }
    expect(addCalendarDays("2026-10-23", NaN)).toBeNull();
  });
});

describe("dayInZone", () => {
  it("gives the local calendar day, not the UTC one", () => {
    // 13:00 UTC on 23 Oct is already the 23rd in Brisbane (+10) but still
    // the 23rd in London — and 14:00 UTC is the 24th in Brisbane.
    const at = Date.parse("2026-10-23T14:30:00Z");
    expect(dayInZone(at, "Australia/Brisbane")).toBe("2026-10-24");
    expect(dayInZone(at, "Europe/London")).toBe("2026-10-23");
    expect(dayInZone(at, "UTC")).toBe("2026-10-23");
  });

  it("handles a zone that observes daylight saving", () => {
    // The hardcoded +10 the old code used would be an hour out here for
    // half the year, which is enough to report the wrong day near midnight.
    const at = Date.parse("2026-01-15T13:30:00Z"); // Sydney is +11 in January
    expect(dayInZone(at, "Australia/Sydney")).toBe("2026-01-16");
    expect(dayInZone(at, "Australia/Brisbane")).toBe("2026-01-15");
  });

  it("returns null rather than an Invalid Date string", () => {
    expect(dayInZone(Number.NaN, "UTC")).toBeNull();
    expect(dayInZone("rubbish", "UTC")).toBeNull();
    expect(dayInZone(Date.now(), "Not/AZone")).toBeNull();
  });
});

describe("isDayBefore", () => {
  it("compares plain dates as strings, which sort correctly", () => {
    expect(isDayBefore("2026-10-23", "2026-10-24")).toBe(true);
    expect(isDayBefore("2026-10-24", "2026-10-23")).toBe(false);
    expect(isDayBefore("2026-10-23", "2026-10-23")).toBe(false);
    expect(isDayBefore("2026-12-31", "2027-01-01")).toBe(true);
  });

  it("is false when either side is missing, so nothing rolls on bad input", () => {
    expect(isDayBefore(null, "2026-10-23")).toBe(false);
    expect(isDayBefore("2026-10-23", null)).toBe(false);
  });
});

describe("timeOfDayInZone", () => {
  it("gives the local wall clock, not the UTC one", () => {
    const at = Date.parse("2026-10-24T00:30:00Z");
    expect(timeOfDayInZone(at, "Australia/Brisbane")).toBe("10:30");
    expect(timeOfDayInZone(at, "UTC")).toBe("00:30");
    expect(timeOfDayInZone(at, "Australia/Perth")).toBe("08:30");
  });

  it("renders midnight as 00:xx, never 24:xx", () => {
    // en-AU renders midnight as hour 24, which <input type="time">
    // rejects — the walk-in field would come up blank after midnight.
    const midnight = Date.parse("2026-10-23T14:05:00Z"); // 00:05 Brisbane
    expect(timeOfDayInZone(midnight, "Australia/Brisbane")).toBe("00:05");
  });

  it("tracks daylight saving instead of assuming a fixed offset", () => {
    const jan = Date.parse("2026-01-15T00:30:00Z"); // Sydney +11
    expect(timeOfDayInZone(jan, "Australia/Sydney")).toBe("11:30");
    expect(timeOfDayInZone(jan, "Australia/Brisbane")).toBe("10:30");
  });

  it("is always zero-padded, so it parses as a time input value", () => {
    const early = Date.parse("2026-10-23T23:01:00Z"); // 09:01 Brisbane
    expect(timeOfDayInZone(early, "Australia/Brisbane")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns null rather than a broken string", () => {
    expect(timeOfDayInZone(Number.NaN, "UTC")).toBeNull();
    expect(timeOfDayInZone(Date.now(), "Not/AZone")).toBeNull();
  });
});
