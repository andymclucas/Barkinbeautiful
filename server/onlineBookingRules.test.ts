import { describe, expect, it } from "vitest";
import { countOverlappingBookings, countSharedBathResourceOverlaps, isOnlineSlotAvailable } from "./onlineBookingRules";

describe("online booking capacity rules", () => {
  const bookings = [
    { scheduledStart: new Date("2026-08-12T00:00:00.000Z"), scheduledEnd: new Date("2026-08-12T02:00:00.000Z") },
  ];

  it("counts only overlapping bookings", () => {
    expect(countOverlappingBookings(bookings, new Date("2026-08-12T01:00:00.000Z"), new Date("2026-08-12T02:30:00.000Z"))).toBe(1);
    expect(countOverlappingBookings(bookings, new Date("2026-08-12T02:00:00.000Z"), new Date("2026-08-12T03:00:00.000Z"))).toBe(0);
  });

  it("enforces slot and daily capacity limits", () => {
    expect(isOnlineSlotAvailable({ overlappingBookings: 0, slotLimit: 1, bookingsToday: 2, dailyLimit: 3 })).toBe(true);
    expect(isOnlineSlotAvailable({ overlappingBookings: 1, slotLimit: 1, bookingsToday: 2, dailyLimit: 3 })).toBe(false);
    expect(isOnlineSlotAvailable({ overlappingBookings: 0, slotLimit: 1, bookingsToday: 3, dailyLimit: 3 })).toBe(false);
  });

  it("rejects a bath request when shared bath stations are occupied by any bath-consuming service", () => {
    const bathBookings = [
      { serviceType: "classic_groom", scheduledStart: new Date("2026-08-12T00:00:00.000Z") },
      { serviceType: "deshed", scheduledStart: new Date("2026-08-12T00:30:00.000Z") },
      { serviceType: "nail_trim", scheduledStart: new Date("2026-08-12T00:30:00.000Z") },
    ];
    const overlaps = countSharedBathResourceOverlaps(bathBookings, "bath_only", new Date("2026-08-12T00:30:00.000Z"));
    expect(isOnlineSlotAvailable({ overlappingBookings: overlaps, slotLimit: 2, bookingsToday: 2, dailyLimit: 3 })).toBe(false);
    expect(countSharedBathResourceOverlaps(bathBookings, "nail_trim", new Date("2026-08-12T00:45:00.000Z"))).toBe(0);
  });
});
