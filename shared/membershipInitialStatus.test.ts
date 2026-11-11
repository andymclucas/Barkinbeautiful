import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initialMembershipStatus } from "./membershipInitialStatus";
import { membershipBillingState, canStartBilling } from "./membershipBillingState";
import { resolveAppointmentMembershipCoverage } from "./appointmentMembershipCoverage";

describe("the status a new membership is created with", () => {
  it("is pending_payment when added without starting billing", () => {
    expect(initialMembershipStatus({ startPending: true })).toBe("pending_payment");
  });

  it("is active for every caller that does not ask for pending", () => {
    expect(initialMembershipStatus({ startPending: false })).toBe("active");
    expect(initialMembershipStatus({})).toBe("active");
    expect(initialMembershipStatus({ startPending: null })).toBe("active");
  });

  it("reads 'Added — not billing yet' and offers Set Weekly Billing", () => {
    // The whole point of the pending start: the row the client-record
    // "Add membership" button writes has no subscription and no date.
    const state = membershipBillingState({
      status: initialMembershipStatus({ startPending: true }),
      nextBillingDate: null,
    });
    expect(state).toBe("added_not_live");
    expect(canStartBilling(state)).toBe(true);
  });
});

describe("memberships.create delegates the choice", () => {
  // Delegation only, per CLAUDE.md §7: the rule itself is tested above. This
  // fails if the router goes back to deciding the status inline, which is
  // how `status: "active"` came to overwrite the pending spread.
  const source = readFileSync(resolve(__dirname, "../server/routers.ts"), "utf8");

  it("calls the shared rule exactly once and has no inline copy", () => {
    expect(source.split("initialMembershipStatus(").length - 1).toBe(1);
    expect(source).not.toContain("input.startPending ?");
  });
});

// The consequence that makes the status matter. A membership nobody is
// paying for must not zero a groom; one that is billing must.
describe("a pending membership does not cover a groom", () => {
  const plan = (startPending: boolean) => ({
    id: 1, petId: 7, name: "Gold", tier: "gold", serviceType: "classic" as const,
    status: initialMembershipStatus({ startPending }), bookingSuspended: false,
  });

  it("leaves the groom chargeable until billing starts", () => {
    const coverage = resolveAppointmentMembershipCoverage([7], "classic_groom", [plan(true)]);
    expect(coverage.fullyCovered).toBe(false);
    expect(coverage.uncoveredPetIds).toEqual([7]);
  });

  it("covers it when the membership was created billing", () => {
    const coverage = resolveAppointmentMembershipCoverage([7], "classic_groom", [plan(false)]);
    expect(coverage.fullyCovered).toBe(true);
  });
});
