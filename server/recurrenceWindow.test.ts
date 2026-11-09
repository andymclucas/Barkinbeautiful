import { describe, expect, it } from "vitest";
import {
  MAX_OCCURRENCES,
  ONGOING_MONTHS,
  recurrenceWindow,
} from "@shared/recurrenceRule";

/**
 * Andy, 10/11/2026, with the New Appointment dialog's "Until *" open on
 * a date picker: "Don't add mandatory end date - choose option for 'no
 * end date' 'after xx weeks' or 'choose end date'."
 */
const first = new Date("2027-01-27T07:30:00");

describe("how a repeat booking ends", () => {
  it("runs twelve months when there is no end date", () => {
    // Nothing can be literally endless in a table of rows. A year is
    // further ahead than this salon books, and the series can be
    // extended from the booking itself.
    const { until, maxOccurrences } = recurrenceWindow(
      first,
      {
        kind: "ongoing",
      },
      6
    );
    const expected = new Date(first.getTime());
    expected.setMonth(expected.getMonth() + ONGOING_MONTHS);
    expect(until.toISOString()).toBe(expected.toISOString());
    expect(maxOccurrences).toBe(MAX_OCCURRENCES);
  });

  it("makes exactly the number of bookings asked for", () => {
    expect(
      recurrenceWindow(first, { kind: "count", sessions: 6 }, 6).maxOccurrences
    ).toBe(6);
  });

  it("lets the count, not a date, be what stops a long series", () => {
    /*
     * Six weekly for twenty is well past a year. Handing the loop a
     * twelve-month horizon as well would quietly make fourteen of them
     * and report the rest as skipped.
     */
    const { until, maxOccurrences } = recurrenceWindow(
      first,
      {
        kind: "count",
        sessions: 20,
      },
      6
    );
    const twentiethStart = new Date(
      first.getTime() + 19 * 6 * 7 * 24 * 60 * 60 * 1000
    );
    expect(maxOccurrences).toBe(20);
    expect(until.getTime()).toBeGreaterThan(twentiethStart.getTime());
  });

  it("will not make more than the safety cap however many are asked for", () => {
    // A guard against a typo, not a product limit.
    expect(
      recurrenceWindow(first, { kind: "count", sessions: 999 }, 6)
        .maxOccurrences
    ).toBe(MAX_OCCURRENCES);
    expect(
      recurrenceWindow(first, { kind: "count", sessions: 0 }, 6).maxOccurrences
    ).toBe(1);
  });

  it("includes a booking that falls ON the chosen end date", () => {
    // "Up to and including" is what the dialog promises, so the window
    // has to reach the end of that day rather than its midnight.
    const { until } = recurrenceWindow(
      first,
      { kind: "date", untilDate: "2027-06-02" },
      6
    );
    expect(until.getFullYear()).toBe(2027);
    expect(until.getMonth()).toBe(5);
    expect(until.getDate()).toBe(2);
    expect(until.getHours()).toBe(23);
  });

  it("falls back to twelve months rather than NaN on an unreadable date", () => {
    // A NaN window compares false against everything and silently makes
    // no bookings at all, which looks exactly like the bug Lauren hit.
    const { until } = recurrenceWindow(
      first,
      { kind: "date", untilDate: "not-a-date" },
      6
    );
    expect(Number.isNaN(until.getTime())).toBe(false);
  });
});
