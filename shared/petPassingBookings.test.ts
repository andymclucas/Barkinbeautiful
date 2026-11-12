import { describe, expect, it } from "vitest";
import { bookingsCancelledByPassing, describeCancelledBookings } from "./petPassingBookings";

// Midnight Brisbane on 13/11/2026.
const startOfToday = new Date("2026-11-12T14:00:00Z");
const at = (iso: string) => new Date(iso);

describe("bookingsCancelledByPassing", () => {
  it("cancels scheduled bookings from today onwards", () => {
    const rows = [
      { id: 1, workflowState: "scheduled", scheduledStart: at("2026-11-18T23:00:00Z") },
      { id: 2, workflowState: "scheduled", scheduledStart: at("2027-01-27T23:00:00Z") },
    ];
    expect(bookingsCancelledByPassing(rows, startOfToday).map((r) => r.id)).toEqual([1, 2]);
  });

  it("includes a booking earlier today that nobody checked in", () => {
    const rows = [{ id: 1, workflowState: "scheduled", scheduledStart: at("2026-11-12T23:00:00Z") }];
    expect(bookingsCancelledByPassing(rows, startOfToday)).toHaveLength(1);
  });

  it("leaves past bookings alone, even ones still at scheduled", () => {
    const rows = [{ id: 1, workflowState: "scheduled", scheduledStart: at("2026-10-15T23:00:00Z") }];
    expect(bookingsCancelledByPassing(rows, startOfToday)).toEqual([]);
  });

  it("leaves anything past scheduled alone", () => {
    const rows = ["checked_in", "grooming", "ready", "complete", "cancelled", "no_show"].map((workflowState, i) => ({
      id: i,
      workflowState,
      scheduledStart: at("2026-11-18T23:00:00Z"),
    }));
    expect(bookingsCancelledByPassing(rows, startOfToday)).toEqual([]);
  });
});

describe("describeCancelledBookings", () => {
  it("handles singular and plural", () => {
    expect(describeCancelledBookings(1)).toBe("1 future booking");
    expect(describeCancelledBookings(3)).toBe("3 future bookings");
  });
});
