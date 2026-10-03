import { describe, expect, it } from "vitest";
import { bookingBucket, countBookingBuckets, BOOKING_BUCKETS } from "../shared/bookingBuckets";

const NOW = new Date("2026-10-03T04:00:00Z"); // 2pm Brisbane
const future = "2026-12-10T02:00:00Z";
const past = "2026-08-21T02:00:00Z";

describe("bookingBucket", () => {
  it("puts a future confirmed booking in upcoming", () => {
    expect(bookingBucket({ scheduledStart: future, status: "confirmed", workflowState: "scheduled" }, NOW)).toBe("upcoming");
  });

  it("puts a finished booking in history", () => {
    expect(bookingBucket({ scheduledStart: past, status: "confirmed", workflowState: "complete" }, NOW)).toBe("history");
  });

  it("counts a cancelled future booking as cancelled, not upcoming", () => {
    // Otherwise the salon sees a dog coming in that is not coming in.
    expect(bookingBucket({ scheduledStart: future, status: "cancelled", workflowState: "scheduled" }, NOW)).toBe("cancelled");
    expect(bookingBucket({ scheduledStart: future, status: "confirmed", workflowState: "cancelled" }, NOW)).toBe("cancelled");
  });

  it("counts a no-show as a no-show whatever the workflow says", () => {
    expect(bookingBucket({ scheduledStart: past, status: "no_show", workflowState: "scheduled" }, NOW)).toBe("no_show");
    expect(bookingBucket({ scheduledStart: past, status: "confirmed", workflowState: "no_show" }, NOW)).toBe("no_show");
  });

  it("treats a finished booking as history even before its slot ends", () => {
    expect(bookingBucket({ scheduledStart: future, status: "confirmed", workflowState: "complete" }, NOW)).toBe("history");
  });

  it("treats status 'pending' as upcoming, because it is only an import default", () => {
    // 1,023 of the salon's 1,025 future bookings carry status "pending".
    // Reading it as "unconfirmed" put every upcoming groom in a Pending
    // tab and left Upcoming showing two.
    expect(bookingBucket({ scheduledStart: future, status: "pending", workflowState: "scheduled" }, NOW)).toBe("upcoming");
  });

  it("files an imported past booking as history, not pending", () => {
    // Ten of Holly's twenty past grooms came over from MoeGo as
    // confirmed/scheduled because the import never advanced the
    // workflow. Treating "never marked complete" as needing action filed
    // two years of finished, paid grooms as outstanding.
    expect(bookingBucket({ scheduledStart: past, status: "confirmed", workflowState: "scheduled" }, NOW)).toBe("history");
  });

  it("files a past booking as history whatever its status", () => {
    expect(bookingBucket({ scheduledStart: past, status: "pending", workflowState: "scheduled" }, NOW)).toBe("history");
  });

  it("puts a part-done past booking in history", () => {
    expect(bookingBucket({ scheduledStart: past, status: "confirmed", workflowState: "drying" }, NOW)).toBe("history");
  });

  it("shows an unreadable date rather than dropping it", () => {
    expect(BOOKING_BUCKETS).toContain(bookingBucket({ scheduledStart: "not-a-date", status: "confirmed" }, NOW));
  });

  it("accepts a Date as readily as a string", () => {
    expect(bookingBucket({ scheduledStart: new Date(future), status: "confirmed", workflowState: "scheduled" }, NOW)).toBe("upcoming");
  });
});

describe("countBookingBuckets", () => {
  it("accounts for every booking exactly once", () => {
    const bookings = [
      { scheduledStart: future, status: "confirmed", workflowState: "scheduled" },
      { scheduledStart: future, status: "confirmed", workflowState: "scheduled" },
      { scheduledStart: past, status: "confirmed", workflowState: "complete" },
      { scheduledStart: past, status: "cancelled", workflowState: "cancelled" },
      { scheduledStart: past, status: "no_show", workflowState: "no_show" },
      { scheduledStart: past, status: "pending", workflowState: "scheduled" },
    ];
    const counts = countBookingBuckets(bookings, NOW);
    expect(counts).toEqual({ upcoming: 2, history: 2, cancelled: 1, no_show: 1 });
    // The tab counts must add up to the list, or one pile hides a booking.
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(bookings.length);
  });
});
