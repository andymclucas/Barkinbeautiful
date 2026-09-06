import { describe, expect, it } from "vitest";
import { getStripePrototypeStatus } from "../shared/stripeMembershipReconciliation";

describe("Stripe membership reconciliation status", () => {
  it("keeps a newly prepared integration in no-charge prototype mode", () => {
    const result = getStripePrototypeStatus("prototype", null, {
      activeMemberships: 153,
      moegoLinkedMemberships: 153,
      stripeMappedSubscriptions: 0,
      stripeMappedCustomers: 0,
    });

    expect(result.prototype).toBe(true);
    expect(result.unmappedMemberships).toBe(153);
    expect(result.safetyMessage).toContain("will not create customer charges");
  });

  it("reports the live state only after a deliberate account connection", () => {
    const result = getStripePrototypeStatus("live", new Date("2026-08-16T00:00:00Z"), {
      activeMemberships: 2,
      moegoLinkedMemberships: 2,
      stripeMappedSubscriptions: 2,
      stripeMappedCustomers: 2,
    });

    expect(result.prototype).toBe(false);
    expect(result.connectionLabel).toBe("Stripe account connected");
    expect(result.unmappedMemberships).toBe(0);
  });
});
