import { describe, it, expect } from "vitest";
import { bookingKey, confirmedBookingKeys } from "./confirmedBookings";

const at = (iso: string) => new Date(iso);

describe("bookingKey", () => {
  it("is the same for every dog on one booking", () => {
    const start = at("2026-11-11T23:00:00Z");
    expect(bookingKey(7, start)).toBe(bookingKey(7, new Date(start)));
    expect(bookingKey(7, start)).toBe(bookingKey(7, start.toISOString()));
  });

  it("separates two clients booked at the same minute", () => {
    const start = at("2026-11-11T23:00:00Z");
    expect(bookingKey(7, start)).not.toBe(bookingKey(8, start));
  });

  it("separates two bookings for the same client", () => {
    expect(bookingKey(7, at("2026-11-11T23:00:00Z")))
      .not.toBe(bookingKey(7, at("2026-11-18T23:00:00Z")));
  });
});

describe("confirmedBookingKeys", () => {
  it("marks the booking a client replied Y to", () => {
    const keys = confirmedBookingKeys([
      { clientId: 7, scheduledStart: at("2026-11-11T23:00:00Z"), repliedAt: at("2026-11-07T21:26:00Z") },
    ]);
    expect(keys.has(bookingKey(7, at("2026-11-11T23:00:00Z")))).toBe(true);
    expect(keys.size).toBe(1);
  });

  /*
   * The whole point of keying on (client, start) rather than on the
   * appointment id the reply was logged against: one Y, two dogs.
   */
  it("speaks for every dog at that time, not just the one the reply was logged against", () => {
    const start = at("2026-11-11T23:00:00Z");
    const keys = confirmedBookingKeys([
      { clientId: 7, scheduledStart: start, repliedAt: at("2026-11-07T21:26:00Z") },
    ]);
    // Both dogs on a family booking share the client and the start, so
    // both resolve to the one key.
    expect(keys.has(bookingKey(7, start))).toBe(true);
  });

  it("does not carry a Y across to the client's other bookings", () => {
    const keys = confirmedBookingKeys([
      { clientId: 7, scheduledStart: at("2026-11-11T23:00:00Z"), repliedAt: at("2026-11-07T21:26:00Z") },
    ]);
    expect(keys.has(bookingKey(7, at("2026-12-09T23:00:00Z")))).toBe(false);
  });

  it("re-opens the question when the booking moved day after the Y", () => {
    const keys = confirmedBookingKeys([{
      clientId: 7,
      scheduledStart: at("2026-11-12T23:00:00Z"),
      repliedAt: at("2026-11-07T21:26:00Z"),
      rescheduleSmsSentAt: at("2026-11-08T03:00:00Z"),
    }]);
    expect(keys.size).toBe(0);
  });

  it("keeps the Y when the move was told BEFORE they agreed", () => {
    const keys = confirmedBookingKeys([{
      clientId: 7,
      scheduledStart: at("2026-11-12T23:00:00Z"),
      repliedAt: at("2026-11-08T04:00:00Z"),
      rescheduleSmsSentAt: at("2026-11-08T03:00:00Z"),
    }]);
    expect(keys.size).toBe(1);
  });

  it("keeps the Y when the booking has never been moved", () => {
    const keys = confirmedBookingKeys([{
      clientId: 7,
      scheduledStart: at("2026-11-12T23:00:00Z"),
      repliedAt: at("2026-11-07T21:26:00Z"),
      rescheduleSmsSentAt: null,
    }]);
    expect(keys.size).toBe(1);
  });

  /* A reply with nothing to tie it to is not evidence, and throwing
     here would stop the whole reminder run over one odd row. */
  it("drops rows it cannot tie to a booking rather than throwing", () => {
    const keys = confirmedBookingKeys([
      { clientId: null, scheduledStart: at("2026-11-11T23:00:00Z"), repliedAt: at("2026-11-07T00:00:00Z") },
      { clientId: 7, scheduledStart: null, repliedAt: at("2026-11-07T00:00:00Z") },
      { clientId: 7, scheduledStart: "not a date", repliedAt: at("2026-11-07T00:00:00Z") },
      { clientId: 9, scheduledStart: at("2026-11-11T23:00:00Z"), repliedAt: null },
    ]);
    expect(keys.size).toBe(1);
    expect(keys.has(bookingKey(9, at("2026-11-11T23:00:00Z")))).toBe(true);
  });

  it("is empty when nobody has replied", () => {
    expect(confirmedBookingKeys([]).size).toBe(0);
  });
});
