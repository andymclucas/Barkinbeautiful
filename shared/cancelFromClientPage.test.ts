import { describe, expect, it } from "vitest";
import { canCancelFromClientPage } from "./cancelFromClientPage";

const now = new Date("2026-11-17T02:00:00Z");
const tomorrow = new Date("2026-11-18T00:00:00Z");
const yesterday = new Date("2026-11-16T00:00:00Z");

describe("cancelling a booking from the client's page", () => {
  it("is offered for an upcoming booking that has not started", () => {
    expect(canCancelFromClientPage({ scheduledStart: tomorrow, status: "confirmed", workflowState: "scheduled" }, now)).toBe(true);
    expect(canCancelFromClientPage({ scheduledStart: tomorrow.toISOString(), status: "pending", workflowState: null }, now)).toBe(true);
  });

  it("is not offered once it is already cancelled or a no-show", () => {
    expect(canCancelFromClientPage({ scheduledStart: tomorrow, status: "cancelled", workflowState: "cancelled" }, now)).toBe(false);
    expect(canCancelFromClientPage({ scheduledStart: tomorrow, status: "no_show", workflowState: "no_show" }, now)).toBe(false);
  });

  it("is not offered for a booking in the past", () => {
    expect(canCancelFromClientPage({ scheduledStart: yesterday, status: "confirmed", workflowState: "scheduled" }, now)).toBe(false);
    expect(canCancelFromClientPage({ scheduledStart: now, status: "confirmed", workflowState: "scheduled" }, now)).toBe(false);
  });

  it("is not offered once the dog has arrived or is being groomed", () => {
    for (const stage of ["checked_in", "bathing", "grooming", "ready", "complete"]) {
      expect(canCancelFromClientPage({ scheduledStart: tomorrow, status: "confirmed", workflowState: stage }, now)).toBe(false);
    }
  });

  it("is not offered when the time cannot be read", () => {
    expect(canCancelFromClientPage({ scheduledStart: "not a date", status: "confirmed", workflowState: "scheduled" }, now)).toBe(false);
  });
});
