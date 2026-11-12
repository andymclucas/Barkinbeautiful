import { describe, expect, it } from "vitest";
import { repeatBookingRefusal } from "./repeatBookingRefusal";

const ok = { status: "confirmed", workflowState: "scheduled", bookedOnline: false };

describe("which bookings can be repeated", () => {
  it("repeats an imported MoeGo booking that came across as pending — Hunter, 12/11/2026", () => {
    expect(repeatBookingRefusal({ ...ok, status: "pending" })).toBeNull();
    expect(repeatBookingRefusal({ ...ok, status: "pending", bookedOnline: 0 })).toBeNull();
  });

  it("refuses an online request the salon has not accepted", () => {
    expect(repeatBookingRefusal({ ...ok, status: "pending", bookedOnline: true })).toContain("online booking has not been accepted");
    expect(repeatBookingRefusal({ ...ok, status: "pending", bookedOnline: 1 })).not.toBeNull();
  });

  it("repeats a confirmed online booking", () => {
    expect(repeatBookingRefusal({ ...ok, bookedOnline: true })).toBeNull();
  });

  it("refuses cancelled and no-show bookings, by either column", () => {
    expect(repeatBookingRefusal({ ...ok, status: "cancelled" })).toContain("cancelled");
    expect(repeatBookingRefusal({ ...ok, workflowState: "cancelled" })).toContain("cancelled");
    expect(repeatBookingRefusal({ ...ok, status: "no_show" })).toContain("did not turn up");
    expect(repeatBookingRefusal({ ...ok, workflowState: "no_show" })).toContain("did not turn up");
  });
});
