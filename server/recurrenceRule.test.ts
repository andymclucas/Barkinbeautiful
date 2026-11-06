import { describe, expect, it } from "vitest";
import {
  MAX_OCCURRENCES, ONGOING_MONTHS, describeRecurrence, recurrenceStarts,
} from "../shared/recurrenceRule";

/** Bronwyn Waegh's Gizmo: Friday 15 January 2027, 7:30am. */
const BRONWYN = "2027-01-15T07:30";

describe("repeating a booking that already exists", () => {
  it("starts AFTER the booking being repeated, never on it", () => {
    /*
     * The source booking is the one being edited — it exists and must
     * not be duplicated or touched.
     *
     * It also removes the confusion that cost an hour this morning:
     * Lauren built a series FROM 15 January, the 15th clashed with a
     * groomer, it was silently skipped, the series began on 12 February
     * and she had no way to see why. Generating after a booking that
     * demonstrably exists leaves no first occurrence to lose.
     */
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "count", sessions: 3 },
    });
    expect(result).toEqual({
      ok: true,
      starts: ["2027-02-12T07:30", "2027-03-12T07:30", "2027-04-09T07:30"],
      truncated: false,
    });
  });

  it("keeps the wall-clock time on every one", () => {
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 6, end: { kind: "count", sessions: 4 },
    });
    if (!result.ok) throw new Error(result.reason);
    for (const start of result.starts) expect(start.endsWith("T07:30")).toBe(true);
  });

  it("steps by whole days, so a DST boundary cannot move the hour", () => {
    /*
     * Brisbane has no daylight saving, so stepping in milliseconds would
     * look correct here forever. It is not correct anywhere that has it:
     * a 7:30am booking stepped by 7 × 24 × 60 × 60 × 1000 across a DST
     * change becomes 6:30 or 8:30, and the salon finds out when a dog
     * arrives an hour early.
     *
     * Sydney moves to daylight saving on 4 October 2026. A fortnightly
     * booking spanning it must still read 07:30.
     */
    const result = recurrenceStarts({
      firstStart: "2026-09-25T07:30", frequencyWeeks: 2, end: { kind: "count", sessions: 2 },
    });
    expect(result).toEqual({
      ok: true,
      starts: ["2026-10-09T07:30", "2026-10-23T07:30"],
      truncated: false,
    });
  });

  it("crosses a month, a year and a leap day", () => {
    const result = recurrenceStarts({
      firstStart: "2027-12-24T09:00", frequencyWeeks: 2, end: { kind: "count", sessions: 3 },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.starts).toEqual(["2028-01-07T09:00", "2028-01-21T09:00", "2028-02-04T09:00"]);
  });
});

describe("the three ways it ends", () => {
  it("after a number of sessions", () => {
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "count", sessions: 6 },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.starts).toHaveLength(6);
  });

  it("on a date, inclusive of the day itself", () => {
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "date", untilDate: "2027-03-12" },
    });
    if (!result.ok) throw new Error(result.reason);
    // 12 Feb and 12 Mar; the next would be 9 Apr, past the end.
    expect(result.starts).toEqual(["2027-02-12T07:30", "2027-03-12T07:30"]);
  });

  it("ongoing, which means a year and says so", () => {
    // Nothing is truly ongoing: an unbounded series is either an
    // infinite loop or a number somebody picked and did not write down.
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "ongoing" },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.starts[0]).toBe("2027-02-12T07:30");
    const last = result.starts[result.starts.length - 1]!;
    expect(last <= "2028-01-15").toBe(true);
    expect(result.starts.length).toBe(13);   // four-weekly for twelve months
    expect(describeRecurrence({ firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "ongoing" } }, 13))
      .toContain(`${ONGOING_MONTHS} months`);
  });
});

describe("what it refuses", () => {
  it("a frequency outside one to fourteen weeks", () => {
    for (const weeks of [0, -2, 15, 26, Number.NaN]) {
      const result = recurrenceStarts({
        firstStart: BRONWYN, frequencyWeeks: weeks, end: { kind: "count", sessions: 2 },
      });
      expect(result.ok, String(weeks)).toBe(false);
    }
  });

  it("an end date on or before the booking it repeats", () => {
    for (const untilDate of ["2027-01-15", "2026-12-01"]) {
      const result = recurrenceStarts({
        firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "date", untilDate },
      });
      expect(result.ok, untilDate).toBe(false);
    }
  });

  it("a session count below one", () => {
    expect(recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "count", sessions: 0 },
    }).ok).toBe(false);
  });

  it("a booking with no usable date", () => {
    expect(recurrenceStarts({
      firstStart: "", frequencyWeeks: 4, end: { kind: "ongoing" },
    }).ok).toBe(false);
  });

  it("caps a run that would otherwise go on, and says it was capped", () => {
    // Weekly for a year is 52; the guard is against a typo, not a product
    // limit, and it has to be visible rather than silently dropping dates.
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 1, end: { kind: "count", sessions: 500 },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.starts).toHaveLength(MAX_OCCURRENCES);
    expect(result.truncated).toBe(true);
  });
});

describe("what the person is told before anything is written", () => {
  it("counts the bookings and names the rhythm", () => {
    expect(describeRecurrence({ firstStart: BRONWYN, frequencyWeeks: 4, end: { kind: "count", sessions: 6 } }, 6))
      .toBe("6 more bookings, every 4 weeks.");
    expect(describeRecurrence({ firstStart: BRONWYN, frequencyWeeks: 1, end: { kind: "count", sessions: 1 } }, 1))
      .toBe("1 more booking, every week.");
    expect(describeRecurrence({ firstStart: BRONWYN, frequencyWeeks: 2, end: { kind: "date", untilDate: "2027-06-01" } }, 9))
      .toContain("up to 2027-06-01");
  });
});
