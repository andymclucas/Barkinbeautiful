import { describe, expect, it } from "vitest";
import { bookingsWithinBuffer, bufferedSearchWindow, CLIENT_BOOKING_BUFFER_MINUTES, isClearOfBookings } from "./clientBookingBuffer";

// Brisbane is UTC+10 with no daylight saving, so 10:00 Brisbane is 00:00 UTC.
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 2, h - 10, m));
const booking = (sh: number, sm: number, eh: number, em: number) => ({ scheduledStart: at(sh, sm), scheduledEnd: at(eh, em) });

describe("client booking buffer", () => {
  it("is thirty minutes", () => {
    expect(CLIENT_BOOKING_BUFFER_MINUTES).toBe(30);
  });

  it("refuses a time that overlaps a booking", () => {
    expect(isClearOfBookings([booking(9, 0, 11, 0)], at(10), at(12))).toBe(false);
  });

  it("refuses a time that starts straight after a booking ends", () => {
    expect(isClearOfBookings([booking(8, 0, 10, 0)], at(10), at(12))).toBe(false);
  });

  it("refuses a time that leaves less than thirty minutes either side", () => {
    expect(isClearOfBookings([booking(8, 0, 10, 0)], at(10, 29), at(12))).toBe(false);
    expect(isClearOfBookings([booking(12, 1, 13, 0)], at(10), at(11, 32))).toBe(false);
  });

  it("allows a time with exactly thirty minutes either side", () => {
    expect(isClearOfBookings([booking(8, 0, 10, 0)], at(10, 30), at(12, 30))).toBe(true);
    expect(isClearOfBookings([booking(13, 0, 15, 0)], at(10, 30), at(12, 30))).toBe(true);
  });

  it("names the bookings that are in the way", () => {
    const early = booking(8, 0, 9, 0);
    const close = booking(12, 40, 14, 0);
    expect(bookingsWithinBuffer([early, close], at(10), at(12, 30))).toEqual([close]);
  });

  it("searches widely enough to find a booking just outside the requested time", () => {
    const { from, to } = bufferedSearchWindow(at(10), at(12));
    expect(from).toEqual(at(9, 30));
    expect(to).toEqual(at(12, 30));
  });
});
