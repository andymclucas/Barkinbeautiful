import { describe, expect, it } from "vitest";
import { clientVisitDates } from "./clientVisitDates";

const now = new Date("2026-11-11T02:00:00Z"); // 12 noon, 11 Nov, Brisbane

// Pat Grant's Finn, newest first — the order the client page receives them.
const finn = [
  { id: 4, scheduledStart: "2027-04-27T22:00:00Z", status: "pending", workflowState: "scheduled" },
  { id: 3, scheduledStart: "2027-03-02T22:00:00Z", status: "pending", workflowState: "scheduled" },
  { id: 2, scheduledStart: "2027-01-05T22:00:00Z", status: "pending", workflowState: "scheduled" },
  { id: 1, scheduledStart: "2026-11-10T22:00:00Z", status: "confirmed", workflowState: "complete" },
];

describe("last and next visit on the client page", () => {
  it("is today's groom and 6 January for Finn, not 28 April twice", () => {
    const { last, next } = clientVisitDates(finn, now);
    expect(last?.id).toBe(1);
    expect(next?.id).toBe(2);
  });

  it("skips cancelled and no-show bookings both ways", () => {
    const { last, next } = clientVisitDates([
      { id: 9, scheduledStart: "2026-11-20T22:00:00Z", status: "cancelled", workflowState: "cancelled" },
      { id: 8, scheduledStart: "2026-11-05T22:00:00Z", status: "no_show", workflowState: "no_show" },
      ...finn,
    ], now);
    expect(last?.id).toBe(1);
    expect(next?.id).toBe(2);
  });

  it("copes with no history or nothing booked", () => {
    expect(clientVisitDates([], now)).toEqual({ last: null, next: null });
    expect(clientVisitDates([finn[3]], now)).toEqual({ last: finn[3], next: null });
  });
});
