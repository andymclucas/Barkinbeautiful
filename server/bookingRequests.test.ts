import { describe, expect, it } from "vitest";
import { isOpenBookingRequest, REQUEST_STALE_AFTER_MS } from "@shared/bookingRequests";

const now = new Date("2026-11-27T02:00:00Z");
const base = { bookedOnline: true, status: "pending", workflowState: "scheduled", scheduledStart: new Date("2026-12-04T23:30:00Z") };

describe("isOpenBookingRequest (Andy, 27/11/2026)", () => {
  it("is a client-made booking still pending", () => {
    expect(isOpenBookingRequest(base, now)).toBe(true);
    expect(isOpenBookingRequest({ ...base, bookedOnline: 1 }, now)).toBe(true);
  });
  it("is never a MoeGo import or a staff booking, even when pending", () => {
    expect(isOpenBookingRequest({ ...base, bookedOnline: false }, now)).toBe(false);
    expect(isOpenBookingRequest({ ...base, bookedOnline: 0 }, now)).toBe(false);
    expect(isOpenBookingRequest({ ...base, bookedOnline: null }, now)).toBe(false);
  });
  it("is done once approved, cancelled or a no-show", () => {
    expect(isOpenBookingRequest({ ...base, status: "confirmed" }, now)).toBe(false);
    expect(isOpenBookingRequest({ ...base, status: "cancelled" }, now)).toBe(false);
    expect(isOpenBookingRequest({ ...base, workflowState: "cancelled" }, now)).toBe(false);
    expect(isOpenBookingRequest({ ...base, workflowState: "no_show" }, now)).toBe(false);
  });
  it("drops off a day after its time has passed", () => {
    expect(isOpenBookingRequest({ ...base, scheduledStart: new Date(now.getTime() - REQUEST_STALE_AFTER_MS + 60_000) }, now)).toBe(true);
    expect(isOpenBookingRequest({ ...base, scheduledStart: new Date(now.getTime() - REQUEST_STALE_AFTER_MS - 60_000) }, now)).toBe(false);
  });
});
