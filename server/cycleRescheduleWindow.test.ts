import { describe, expect, it } from "vitest";
import { cycleRescheduleWindow, inferIntervalWeeks, isWithinWindow } from "@shared/cycleRescheduleWindow";

describe("cycleRescheduleWindow", () => {
  it("allows three days either side of where a 6-weekly booking falls", () => {
    // Wed 6 Jan; previous visit Wed 25 Nov; next Wed 17 Feb.
    const w = cycleRescheduleWindow({ currentDateKey: "2027-01-06", prevDateKey: "2026-11-25", nextDateKey: "2027-02-17", intervalWeeks: 6 });
    expect(w).toEqual({ from: "2027-01-03", to: "2027-01-09", idealDateKey: "2027-01-06", intervalWeeks: 6 });
    // Tue 5 – Fri 8 Jan, the four trading days of that week, are all inside.
    for (const day of ["2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"]) expect(isWithinWindow(day, w)).toBe(true);
    expect(isWithinWindow("2027-01-12", w)).toBe(false);
  });

  it("anchors on the neighbours, so moving it again cannot walk the cycle", () => {
    // Already moved to Fri 8 Jan; the window is still the week of the 6th.
    const w = cycleRescheduleWindow({ currentDateKey: "2027-01-08", prevDateKey: "2026-11-25", nextDateKey: "2027-02-17", intervalWeeks: 6 });
    expect(w.from).toBe("2027-01-03");
    expect(w.to).toBe("2027-01-09");
  });

  it("works out the interval from the neighbours when the plan doesn't say", () => {
    expect(inferIntervalWeeks("2027-01-06", "2026-12-09", "2027-02-03")).toBe(4);
    const w = cycleRescheduleWindow({ currentDateKey: "2027-01-06", prevDateKey: "2026-12-09", nextDateKey: "2027-02-03" });
    expect(w.intervalWeeks).toBe(4);
    expect(w.idealDateKey).toBe("2027-01-06");
  });

  it("uses the one neighbour it has — the last booking in a series", () => {
    const w = cycleRescheduleWindow({ currentDateKey: "2027-03-03", prevDateKey: "2027-01-20", intervalWeeks: 6 });
    expect(w.idealDateKey).toBe("2027-03-03");
    expect([w.from, w.to]).toEqual(["2027-02-28", "2027-03-06"]);
  });

  it("falls back to around today's date when staff have moved the neighbours apart", () => {
    // Previous visit pulled early and next pushed late: the two windows don't meet.
    const w = cycleRescheduleWindow({ currentDateKey: "2027-01-06", prevDateKey: "2026-11-18", nextDateKey: "2027-02-24", intervalWeeks: 6 });
    expect(w.idealDateKey).toBe("2027-01-06");
    expect([w.from, w.to]).toEqual(["2027-01-03", "2027-01-09"]);
  });

  it("never lets the booking reach a neighbouring visit", () => {
    const w = cycleRescheduleWindow({ currentDateKey: "2027-01-06", nextDateKey: "2027-01-08", toleranceDays: 5 });
    expect(w.to).toBe("2027-01-07");
  });

  it("with no neighbours and no interval, it is three days around where it is", () => {
    const w = cycleRescheduleWindow({ currentDateKey: "2027-01-06" });
    expect([w.from, w.to, w.intervalWeeks]).toEqual(["2027-01-03", "2027-01-09", null]);
  });
});
