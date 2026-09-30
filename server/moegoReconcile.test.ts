import { describe, it, expect } from "vitest";
import { planCancellations, matchKey, isDeadAppointment } from "../shared/moegoReconcile";

const m = (pet: string, client: string, date: string, status: string) => ({ bookingId: "1", date, client, pet, status });
const g = (id: number, pet: string, client: string, date: string, workflowState = "scheduled", status = "pending") =>
  ({ id, pet, client, date, workflowState, status });

describe("planCancellations", () => {
  it("cancels a booking MoeGo has cancelled and Groomigo still has live", () => {
    const plan = planCancellations([m("Tiger", "Wendy Gidney", "2026-10-08", "Cancelled")],
                                   [g(1, "Tiger", "Wendy Gidney", "2026-10-08")]);
    expect(plan.cancel.map((c) => c.appointment.id)).toEqual([1]);
    expect(plan.held).toHaveLength(0);
  });

  it("does NOT cancel when the client cancelled and rebooked the same day", () => {
    // The real failure: on 30/09/2026 twelve dogs were cancelled off the live
    // board because MoeGo kept both the cancelled row and the new booking,
    // and only the cancelled one was read.
    const plan = planCancellations(
      [m("Teddy", "Clare De Looze", "2026-10-13", "Cancelled"),
       m("Teddy", "Clare De Looze", "2026-10-13", "Unconfirmed")],
      [g(1, "Teddy", "Clare De Looze", "2026-10-13")],
    );
    expect(plan.cancel).toHaveLength(0);
    expect(plan.held).toHaveLength(1);
    expect(plan.held[0].hold).toMatch(/rebooked/i);
  });

  it("holds a dog that has already arrived, whatever MoeGo says", () => {
    const plan = planCancellations([m("Poppy", "April Bradstreet", "2026-09-30", "Cancelled")],
                                   [g(1, "Poppy", "April Bradstreet", "2026-09-30", "complete")]);
    expect(plan.cancel).toHaveLength(0);
    expect(plan.held[0].hold).toMatch(/at the salon/i);
  });

  it("never cancels a different owner's dog of the same name", () => {
    // Two Louis on 06/10; the cancellation belongs to Varinia Taylor's.
    const plan = planCancellations(
      [m("Louis", "Varinia Taylor", "2026-10-06", "Cancelled")],
      [g(1, "Louis", "Varinia Taylor", "2026-10-06"), g(2, "Louis", "Judy Harris", "2026-10-06")],
    );
    expect(plan.cancel.map((c) => c.appointment.id)).toEqual([1]);
  });

  it("reports a cancellation with no Groomigo booking rather than guessing", () => {
    const plan = planCancellations([m("Millie", "Vicky McKendrick", "2026-10-14", "Cancelled")],
                                   [g(1, "Millie", "Toni Constantini", "2026-10-14")]);
    expect(plan.cancel).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
  });

  it("leaves an appointment already cancelled in Groomigo alone", () => {
    const plan = planCancellations([m("Minnie", "Janene Bosa", "2026-09-30", "Cancelled")],
                                   [g(1, "Minnie", "Janene Bosa", "2026-09-30", "cancelled", "cancelled")]);
    expect(plan.cancel).toHaveLength(0);
    expect(plan.held).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(0);
  });

  it("does not plan the same appointment twice when MoeGo has two cancelled rows", () => {
    const plan = planCancellations(
      [m("Lady", "Natalie Huth", "2026-10-14", "Cancelled"), m("Lady", "Natalie Huth", "2026-10-14", "No show")],
      [g(1, "Lady", "Natalie Huth", "2026-10-14")],
    );
    expect(plan.cancel).toHaveLength(1);
  });

  it("treats a no-show as a cancellation, and matches case-insensitively", () => {
    const plan = planCancellations([m("bear", "marilyn  drohan", "2026-10-02", "No Show")],
                                   [g(1, "Bear", "Marilyn Drohan", "2026-10-02")]);
    expect(plan.cancel).toHaveLength(1);
  });

  it("reads a cancellation recorded on either Groomigo column as already dead", () => {
    expect(isDeadAppointment(g(1, "A", "B", "2026-10-01", "cancelled", "pending"))).toBe(true);
    expect(isDeadAppointment(g(1, "A", "B", "2026-10-01", "scheduled", "no_show"))).toBe(true);
    expect(isDeadAppointment(g(1, "A", "B", "2026-10-01"))).toBe(false);
  });

  it("keys on pet, client and date together", () => {
    expect(matchKey(" Lily ", "Tricia  Taylor", "2026-10-13")).toBe("lily|tricia taylor|2026-10-13");
    expect(matchKey("Lily", "Carly Herbert", "2026-10-13")).not.toBe(matchKey("Lily", "Tricia Taylor", "2026-10-13"));
  });
});
