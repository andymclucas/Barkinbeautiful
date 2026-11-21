import { describe, expect, it } from "vitest";
import { describeCancelAll, describeCancelAllResult, planCancelAllUpcoming } from "./cancelAllUpcoming";

const now = new Date("2026-11-21T02:00:00Z");
const future = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const past = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe("planCancelAllUpcoming", () => {
  it("cancels every future booking that has not started", () => {
    const plan = planCancelAllUpcoming([
      { id: 1, scheduledStart: future(5), status: "pending", workflowState: "scheduled" },
      { id: 2, scheduledStart: future(19), status: "confirmed", workflowState: "scheduled" },
      { id: 3, scheduledStart: future(40), status: "pending", workflowState: null },
    ], now);
    expect(plan.cancel).toEqual([1, 2, 3]);
    expect(plan.inSalon).toEqual([]);
  });

  it("leaves the past, the cancelled, the no-shows and the finished alone", () => {
    const plan = planCancelAllUpcoming([
      { id: 1, scheduledStart: past(3), status: "confirmed", workflowState: "complete" },
      { id: 2, scheduledStart: past(10), status: "confirmed", workflowState: "scheduled" },
      { id: 3, scheduledStart: future(5), status: "cancelled", workflowState: "cancelled" },
      { id: 4, scheduledStart: future(6), status: "no_show", workflowState: "no_show" },
      { id: 5, scheduledStart: future(7), status: "pending", workflowState: "complete" },
    ], now);
    expect(plan.cancel).toEqual([]);
    expect(plan.inSalon).toEqual([]);
  });

  it("never cancels a dog already in the salon, and names it", () => {
    const plan = planCancelAllUpcoming([
      { id: 1, scheduledStart: future(0.01), status: "confirmed", workflowState: "checked_in", petName: "Bailee" },
      { id: 2, scheduledStart: future(14), status: "pending", workflowState: "scheduled", petName: "Bailee" },
    ], now);
    expect(plan.cancel).toEqual([2]);
    expect(plan.inSalon).toEqual([{ id: 1, petName: "Bailee" }]);
  });
});

describe("describeCancelAll", () => {
  it("says how many, where they go and that no text is sent", () => {
    expect(describeCancelAll(5)).toBe("This cancels 5 upcoming bookings. They move to the Cancelled tab, where any of them can be put back. No text is sent to the client.");
    expect(describeCancelAll(1)).toContain("1 upcoming booking.");
    expect(describeCancelAll(0)).toBe("There are no upcoming bookings to cancel.");
  });
});

describe("describeCancelAllResult", () => {
  it("reports the count and anything left alone", () => {
    expect(describeCancelAllResult(5, [])).toBe("5 bookings cancelled. No text was sent to the client.");
    expect(describeCancelAllResult(1, ["Bailee"])).toBe("1 booking cancelled. Bailee left alone, already at the salon. No text was sent to the client.");
    expect(describeCancelAllResult(2, ["Rex", "Mia", "Bo"])).toContain("Rex, Mia and Bo left alone");
  });
});
