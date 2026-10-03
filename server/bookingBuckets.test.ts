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

  it("keeps an unconfirmed future booking in pending", () => {
    expect(bookingBucket({ scheduledStart: future, status: "pending", workflowState: "scheduled" }, NOW)).toBe("pending");
  });

  it("leaves a past booking nobody finished in pending, not history", () => {
    // It needs someone to say what happened; quietly filing it as history
    // is how an unpriced, uncollected groom disappears.
    expect(bookingBucket({ scheduledStart: past, status: "confirmed", workflowState: "scheduled" }, NOW)).toBe("pending");
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
      { scheduledStart: past, status: "confirmed", workflowState: "scheduled" },
    ];
    const counts = countBookingBuckets(bookings, NOW);
    expect(counts).toEqual({ pending: 1, upcoming: 2, history: 1, cancelled: 1, no_show: 1 });
    // The tab counts must add up to the list, or one pile hides a booking.
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(bookings.length);
  });
});
