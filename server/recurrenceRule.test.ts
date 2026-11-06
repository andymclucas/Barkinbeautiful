import { describe, expect, it } from "vitest";
import {
  MAX_OCCURRENCES, ONGOING_MONTHS, describeRecurrence, lapsedCoverage,
  lapsedCoverageMessage, recurrenceStarts, type BookingRowCoverage,
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

  it("does not claim it was capped when the cap is exactly what was asked for", () => {
    // "That is as many as one go will create" on a run of exactly 60
    // sent somebody looking for dates that were never missing.
    const result = recurrenceStarts({
      firstStart: BRONWYN, frequencyWeeks: 1, end: { kind: "count", sessions: MAX_OCCURRENCES },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.starts).toHaveLength(MAX_OCCURRENCES);
    expect(result.truncated).toBe(false);
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

describe("what a repeat does about membership coverage", () => {
  /*
   * This is the money path, and the first version of it got this wrong
   * in production. It set membershipId to null on every occurrence and
   * copied the row's price, with a comment saying coverage would be
   * decided at invoicing. Nothing decides it at invoicing —
   * decideAppointmentInvoice reads the row's OWN membershipId — so a
   * row carrying both a link and a price was repeated as
   * unlinked-and-priced and billed the member in full.
   *
   * The delegation count in appointmentMembershipCoverage.test.ts
   * stayed green through all of it, because three other paths still
   * delegated. These are the assertions that would not have.
   */
  const covered = (over: Partial<BookingRowCoverage> = {}): BookingRowCoverage =>
    ({ petId: 1, petName: "Gizmo", membershipId: 5, coveredNow: true, ...over });

  it("lets a booking through when every linked dog is still covered", () => {
    expect(lapsedCoverage([covered(), covered({ petId: 2, petName: "Milo" })])).toEqual([]);
    expect(lapsedCoverageMessage([covered()])).toBeNull();
  });

  it("lets a casual dog through — no link is not a lapse", () => {
    // The commonest row in the salon: 450 of 456 upcoming bookings are
    // MoeGo imports and most carry no membership at all.
    const casual = { petId: 9, petName: "Bruno", membershipId: null, coveredNow: false };
    expect(lapsedCoverage([casual])).toEqual([]);
    expect(lapsedCoverageMessage([casual])).toBeNull();
  });

  it("stops a booking whose plan has lapsed, rather than guessing", () => {
    /*
     * A paused, cancelled or payment-suspended plan. Both available
     * guesses cost money in opposite directions: keep the link and a
     * client whose payments are failing gets a year of free grooms;
     * keep the price and drop the link and the member is charged twice.
     */
    const lapsedRow = covered({ coveredNow: false });
    expect(lapsedCoverage([lapsedRow])).toEqual([lapsedRow]);
    expect(lapsedCoverageMessage([lapsedRow])).toContain("Gizmo's membership");
    expect(lapsedCoverageMessage([lapsedRow])).toContain("failed payment");
  });

  it("stops the WHOLE booking when one dog of a family has lapsed", () => {
    // Not "repeat the other dog" — a family travels together, and
    // repeating half of it is worse than repeating none.
    const rows = [covered({ petId: 1, petName: "Gizmo" }),
                  covered({ petId: 2, petName: "Milo", coveredNow: false })];
    expect(lapsedCoverage(rows)).toHaveLength(1);
    expect(lapsedCoverageMessage(rows)).toContain("Milo's membership");
  });

  it("names every lapsed dog, so somebody knows which plan to look at", () => {
    const rows = [
      covered({ petId: 1, petName: "Gizmo", coveredNow: false }),
      covered({ petId: 2, petName: "Milo", coveredNow: false }),
    ];
    const message = lapsedCoverageMessage(rows)!;
    expect(message).toContain("Gizmo");
    expect(message).toContain("Milo");
  });

  it("still refuses when the dog has no name on file", () => {
    const message = lapsedCoverageMessage([covered({ petName: null, coveredNow: false })]);
    expect(message).toContain("A membership on this booking");
  });
});
