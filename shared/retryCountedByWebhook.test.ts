import { describe, expect, it } from "vitest";
import { retryCountedByWebhook } from "./stripeBilling";

describe("retryCountedByWebhook", () => {
  it("leaves a failed retry of an open invoice to the webhook, so it is one strike", () => {
    expect(retryCountedByWebhook("in_123")).toBe(true);
  });

  it("counts a direct charge at the button, because Stripe sends no invoice event for it", () => {
    for (const none of [null, undefined, "", "  "]) expect(retryCountedByWebhook(none)).toBe(false);
  });
});

import { describeMembershipFailure } from "./stripeBilling";

describe("describeMembershipFailure", () => {
  it("names insufficient funds, however Stripe reports it", () => {
    // A card: decline code on the payment's last error.
    expect(describeMembershipFailure({ code: "card_declined", declineCode: "insufficient_funds", message: "Your card has insufficient funds." })).toBe("Insufficient funds");
    // Link: no decline code, only the sentence.
    expect(describeMembershipFailure({ code: "payment_method_provider_decline", message: "The customer has insufficient funds with the payment provider." })).toBe("Insufficient funds");
  });

  it("uses plain words for the codes staff can act on", () => {
    expect(describeMembershipFailure({ declineCode: "expired_card" })).toBe("The card has expired");
    expect(describeMembershipFailure({ declineCode: "do_not_honor" })).toBe("The bank refused the payment without a reason");
  });

  it("falls back to Stripe's own sentence, and to nothing when there is nothing", () => {
    expect(describeMembershipFailure({ code: "card_declined", declineCode: "something_new", message: "Your card was declined." })).toBe("Your card was declined");
    expect(describeMembershipFailure({})).toBeNull();
    expect(describeMembershipFailure(null)).toBeNull();
  });
});

import { retryWarning } from "./stripeBilling";

describe("retryWarning", () => {
  it("says a second decline suspends a weekly membership, before the button is pressed", () => {
    expect(retryWarning(1)).toMatch(/suspended on its second/);
  });

  it("says nothing gets worse for a membership that is already suspended", () => {
    expect(retryWarning(2)).toMatch(/already suspended/);
    expect(retryWarning(3)).toMatch(/already suspended/);
  });
});
