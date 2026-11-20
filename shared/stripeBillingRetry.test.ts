import { describe, expect, it } from "vitest";
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
  it("says a declined retry does not count towards suspension", () => {
    expect(retryWarning(1)).toMatch(/does not count towards suspension/);
    expect(retryWarning(0)).toMatch(/Only the automatic attempts do/);
  });

  it("says nothing gets worse for a membership that is already suspended", () => {
    expect(retryWarning(2)).toMatch(/already suspended/);
    expect(retryWarning(3)).toMatch(/already suspended/);
  });
});

import { invoiceToRetry } from "./stripeBilling";

describe("invoiceToRetry", () => {
  it("pays the open invoice even when a newer failure has no invoice on it", () => {
    // Newest first: a hand-recorded failure, then the webhook's row.
    expect(invoiceToRetry([{ stripeInvoiceId: null }, { stripeInvoiceId: "in_open" }], [])).toBe("in_open");
  });

  it("does not 'pay' an invoice that has since been paid", () => {
    expect(invoiceToRetry([{ stripeInvoiceId: null }, { stripeInvoiceId: "in_old" }], ["in_old"])).toBeNull();
  });

  it("only looks at the newest invoice, not an older one behind it", () => {
    expect(invoiceToRetry([{ stripeInvoiceId: "in_new" }, { stripeInvoiceId: "in_old" }], ["in_old"])).toBe("in_new");
    expect(invoiceToRetry([{ stripeInvoiceId: "in_new" }, { stripeInvoiceId: "in_old" }], ["in_new"])).toBeNull();
  });

  it("has nothing to pay when no failure carries an invoice", () => {
    expect(invoiceToRetry([{ stripeInvoiceId: null }, {}], [])).toBeNull();
    expect(invoiceToRetry([], [])).toBeNull();
  });
});
