import { describe, expect, it } from "vitest";
import { clearCandidatesOnDay, searchDayKeys } from "./portalNextAvailable";

// Brisbane is UTC+10 all year, so 08:00 Brisbane is 22:00 UTC the day before.
const bne = (dateKey: string, hh: number, mm = 0) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 10, mm));
};

describe("searchDayKeys", () => {
  it("lists consecutive calendar days across a month end", () => {
    expect(searchDayKeys("2026-11-29", 4)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
});

describe("clearCandidatesOnDay", () => {
  const day = "2026-12-02"; // a Wednesday
  const early = new Date(Date.UTC(2026, 0, 1));

  it("offers nothing on a day the salon is closed", () => {
    expect(clearCandidatesOnDay({ dateKey: "2026-12-05", durationMinutes: 30, groomerIds: [1], bookingsByGroomer: new Map(), notBefore: early })).toEqual([]);
  });

  it("skips a time inside a groomer's 30-minute gap and finds the next clear one", () => {
    const booked = new Map([[1, [{ scheduledStart: bne(day, 8), scheduledEnd: bne(day, 9) }]]]);
    const [first] = clearCandidatesOnDay({ dateKey: day, durationMinutes: 30, groomerIds: [1], bookingsByGroomer: booked, notBefore: early });
    expect(first).toEqual({ scheduledStart: bne(day, 9, 30), staffId: 1 });
  });

  it("pairs a time with whichever groomer is clear then", () => {
    const booked = new Map([[1, [{ scheduledStart: bne(day, 8), scheduledEnd: bne(day, 12) }]]]);
    const [first] = clearCandidatesOnDay({ dateKey: day, durationMinutes: 30, groomerIds: [1, 2], bookingsByGroomer: booked, notBefore: early });
    expect(first).toEqual({ scheduledStart: bne(day, 8), staffId: 2 });
  });

  it("respects the notice period", () => {
    const [first] = clearCandidatesOnDay({ dateKey: day, durationMinutes: 30, groomerIds: [1], bookingsByGroomer: new Map(), notBefore: bne(day, 11) });
    expect(first.scheduledStart).toEqual(bne(day, 11));
  });
});
