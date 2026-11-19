import { describe, expect, it } from "vitest";
import { prepaidBlockLabel, prepaidBlockUsable, prepaidCandidates } from "./prepaidGrooms";

describe("prepaidBlockLabel", () => {
  it("counts grooms, not dollars", () => {
    expect(prepaidBlockLabel({ creditsTotal: 9, creditsUsed: 4 })).toBe("5 of 9 left");
  });

  it("says why nothing more can be used", () => {
    expect(prepaidBlockLabel({ creditsTotal: 9, creditsUsed: 9 })).toBe("All used");
    expect(prepaidBlockLabel({ creditsTotal: 9, creditsUsed: 4, expired: true })).toBe("Expired");
    expect(prepaidBlockLabel({ creditsTotal: 9, creditsUsed: 4, status: "cancelled" })).toBe("Cancelled");
  });
});

describe("prepaidBlockUsable", () => {
  it("is usable only while grooms are left on a live block", () => {
    expect(prepaidBlockUsable({ creditsTotal: 9, creditsUsed: 4 })).toBe(true);
    expect(prepaidBlockUsable({ creditsTotal: 9, creditsUsed: 9 })).toBe(false);
    expect(prepaidBlockUsable({ creditsTotal: 9, creditsUsed: 4, expired: true })).toBe(false);
    expect(prepaidBlockUsable({ creditsTotal: 9, creditsUsed: 4, status: "cancelled" })).toBe(false);
  });
});

describe("prepaidCandidates", () => {
  const paidOn = "2026-06-10T00:00:00.000Z";
  const appt = (id: number, at: string, over: Record<string, unknown> = {}) => ({ id, scheduledStart: at, status: "confirmed", workflowState: "complete", ...over });

  it("offers the grooms since the block was paid for, oldest first", () => {
    const list = prepaidCandidates([
      appt(3, "2026-10-08T00:00:00Z"), appt(1, "2026-07-16T00:00:00Z"), appt(2, "2026-08-27T00:00:00Z"),
    ], [], paidOn);
    expect(list.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it("leaves out a groom before the payment, one already counted, and one that never happened", () => {
    const list = prepaidCandidates([
      appt(1, "2026-06-04T00:00:00Z"),
      appt(2, "2026-07-16T00:00:00Z"),
      appt(3, "2026-08-27T00:00:00Z", { status: "cancelled" }),
      appt(4, "2026-10-08T00:00:00Z", { workflowState: "no_show" }),
      appt(5, "2027-01-07T00:00:00Z", { workflowState: "scheduled" }),
    ], [2], paidOn);
    expect(list.map((a) => a.id)).toEqual([5]);
  });
});
