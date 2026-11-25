import { describe, expect, it } from "vitest";
import { nextBillingLine } from "@shared/membershipPause";

const next = new Date("2026-11-26T00:00:00+10:00");
const restart = new Date("2026-12-03T01:40:00Z");

describe("next billing line (Andy, 25/11/2026)", () => {
  it("shows the restart date, not the old billing date, while paused", () => {
    expect(nextBillingLine({ status: "paused", pauseMode: "cycles", pauseResumesAt: restart, nextBillingDate: next }))
      .toEqual({ label: "Restarts", date: restart });
  });

  it("says when resumed for a manual pause", () => {
    expect(nextBillingLine({ status: "paused", pauseMode: "manual", pauseResumesAt: null, nextBillingDate: next }))
      .toEqual({ label: "Restarts", text: "When resumed" });
  });

  it("says on hold when paused for a failed payment", () => {
    expect(nextBillingLine({ status: "paused", pauseMode: null, failedPaymentCount: 3, bookingSuspended: true, nextBillingDate: next }))
      .toEqual({ label: "Next billing", text: "On hold" });
  });

  it("shows the next billing date while active, and nothing once cancelled", () => {
    expect(nextBillingLine({ status: "active", nextBillingDate: next })).toEqual({ label: "Next billing", date: next });
    expect(nextBillingLine({ status: "cancelled", nextBillingDate: next })).toBeNull();
    expect(nextBillingLine({ status: "active", nextBillingDate: null })).toBeNull();
  });
});
