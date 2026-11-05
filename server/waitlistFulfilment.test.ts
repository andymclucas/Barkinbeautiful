import { describe, expect, it } from "vitest";
import { bookingFulfilsEntry, describeWaitlistWindow } from "@shared/waitlist";

const entry = (over: Partial<Parameters<typeof bookingFulfilsEntry>[0]> = {}) => ({
  petId: 1574, earliestDate: "2026-11-10", latestDate: "2026-12-22", status: "active", ...over,
});

describe("bookingFulfilsEntry", () => {
  /**
   * The salon's only active entry had sat open since somebody typed it,
   * because nothing in the app ever closed one. Andy, 05/11/2026:
   * "once they've been booked, remove waitlist notification."
   */
  it("settles the entry when the dog is booked inside the window", () => {
    expect(bookingFulfilsEntry(entry(), { petId: 1574, dayKey: "2026-11-17" })).toBe(true);
  });

  it("is inclusive at both ends, because that is what the client asked for", () => {
    expect(bookingFulfilsEntry(entry(), { petId: 1574, dayKey: "2026-11-10" })).toBe(true);
    expect(bookingFulfilsEntry(entry(), { petId: 1574, dayKey: "2026-12-22" })).toBe(true);
  });

  it("leaves it open for a booking outside the window", () => {
    expect(bookingFulfilsEntry(entry(), { petId: 1574, dayKey: "2026-11-09" })).toBe(false);
    expect(bookingFulfilsEntry(entry(), { petId: 1574, dayKey: "2026-12-23" })).toBe(false);
  });

  /**
   * Per dog, not per client. A two-dog household can have one booked and
   * the other still waiting, and clearing both loses a customer's place.
   */
  it("never settles a different dog's entry", () => {
    expect(bookingFulfilsEntry(entry(), { petId: 999, dayKey: "2026-11-17" })).toBe(false);
  });

  it("does nothing to an entry that is already closed", () => {
    for (const status of ["fulfilled", "cancelled", "expired"]) {
      expect(bookingFulfilsEntry(entry({ status }), { petId: 1574, dayKey: "2026-11-17" })).toBe(false);
    }
  });

  /** String comparison on YYYY-MM-DD, so no Date and no browser zone. */
  it("compares calendar days as the salon stores them", () => {
    expect(bookingFulfilsEntry(
      entry({ earliestDate: "2026-12-28", latestDate: "2027-01-04" }),
      { petId: 1574, dayKey: "2027-01-02" },
    )).toBe(true);
  });
});

describe("describeWaitlistWindow", () => {
  it("reads in one line on the client's record", () => {
    expect(describeWaitlistWindow({ earliestDate: "2026-11-10", latestDate: "2026-12-22", timeOfDay: "any" }))
      .toBe("10 Nov – 22 Dec");
  });

  it("says so when they only want half the day", () => {
    expect(describeWaitlistWindow({ earliestDate: "2026-11-10", latestDate: "2026-11-30", timeOfDay: "morning" }))
      .toBe("10 Nov – 30 Nov · mornings only");
  });

  it("does not fall over on a malformed date", () => {
    expect(describeWaitlistWindow({ earliestDate: "nonsense", latestDate: "2026-11-30", timeOfDay: "any" }))
      .toContain("nonsense");
  });
});
