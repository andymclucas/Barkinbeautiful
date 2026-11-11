import { describe, expect, it } from "vitest";
import { nextVisitAfter } from "./nextVisit";
import { brisbaneDateKey } from "./localDateTime";

const today = "2026-11-10T23:30:00Z"; // Wed 11 Nov, 9:30 am in Brisbane

describe("the visit after this one", () => {
  it("is never the booking being looked at, even before it starts", () => {
    expect(nextVisitAfter(today, [{ scheduledStart: today, status: "confirmed" }], brisbaneDateKey)).toBeNull();
  });

  it("skips cancelled bookings and finds the real next one", () => {
    const next = nextVisitAfter(today, [
      { scheduledStart: "2026-11-30T23:00:00Z", status: "cancelled", workflowState: "cancelled" }, // Tue 1 Dec
      { scheduledStart: "2026-12-08T23:30:00Z", status: "pending", workflowState: "scheduled" },   // Wed 9 Dec
      { scheduledStart: "2027-01-05T23:30:00Z", status: "pending", workflowState: "scheduled" },   // Wed 6 Jan
    ], brisbaneDateKey);
    expect(next?.toISOString()).toBe("2026-12-08T23:30:00.000Z");
  });

  it("does not count a later slot on the same day as the next visit", () => {
    expect(nextVisitAfter(today, [{ scheduledStart: "2026-11-11T03:00:00Z", status: "confirmed" }], brisbaneDateKey)).toBeNull();
  });

  it("uses the salon's calendar day, not UTC", () => {
    // 7:30 am Thu 12 Nov in Brisbane is still 11 Nov in UTC.
    const next = nextVisitAfter(today, [{ scheduledStart: "2026-11-11T21:30:00Z", status: "confirmed" }], brisbaneDateKey);
    expect(next?.toISOString()).toBe("2026-11-11T21:30:00.000Z");
  });
});
