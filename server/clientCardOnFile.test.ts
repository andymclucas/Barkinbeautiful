import { describe, expect, it } from "vitest";
import { canChargeOffSession, describeCard } from "@shared/stripeBilling";
import { membershipBillingState } from "@shared/membershipBillingState";

/**
 * The card belongs to the CLIENT, not the membership.
 *
 * ClientDetail read `hasCardOnFile` off each membership row, and
 * clients.getProfile never put one there, so it was false for everybody.
 * Two things went wrong downstream, and the second one is the expensive one.
 */
describe("working out whether a client has a card", () => {
  const withCard = {
    stripeCustomerId: "cus_VMJI1Z2f8YFgMd",
    stripeDefaultPaymentMethodId: "pm_1ULaidAwaBS2YIYS6raOHoWn",
  };

  it("counts a saved payment method even when the brand and last4 are missing", () => {
    // Andy's real row: the webhook saved the method but not the card
    // details, so anything keying off last4 would call this "no card".
    expect(canChargeOffSession(withCard)).toBe(true);
    expect(describeCard(withCard)).toMatch(/saved/i);
  });

  it("needs both the customer and the payment method", () => {
    expect(canChargeOffSession({ stripeCustomerId: "cus_x", stripeDefaultPaymentMethodId: null })).toBe(false);
    expect(canChargeOffSession({ stripeCustomerId: null, stripeDefaultPaymentMethodId: "pm_x" })).toBe(false);
    expect(canChargeOffSession({})).toBe(false);
  });

  it("a scheduled membership counts as live only once the card is known about", () => {
    // The regression in one line: same row, and the only difference is
    // whether we looked the card up in the right place.
    const scheduled = { status: "active", nextBillingDate: "2026-10-15" };
    expect(membershipBillingState({ ...scheduled, hasCardOnFile: false })).toBe("needs_migration");
    expect(membershipBillingState({ ...scheduled, hasCardOnFile: true })).toBe("live");
  });
});
