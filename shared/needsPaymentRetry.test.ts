import { describe, expect, it } from "vitest";
import { needsPaymentRetry, suspendedForPayment } from "./membershipBillingState";

describe("needsPaymentRetry", () => {
  it("offers a retry on a Stripe-billed membership with a failed payment", () => {
    expect(needsPaymentRetry({ status: "pending_payment", stripeSubscriptionId: "sub_1", failedPaymentCount: 1 })).toBe(true);
  });

  it("offers it on a membership suspended for failed payments, which is stored as paused", () => {
    const suspended = { status: "paused", stripeSubscriptionId: "sub_1", failedPaymentCount: 2 };
    expect(needsPaymentRetry(suspended)).toBe(true);
    expect(suspendedForPayment(suspended)).toBe(true);
  });

  it("does not mistake a holiday pause for a failed payment", () => {
    const holiday = { status: "paused", stripeSubscriptionId: "sub_1", failedPaymentCount: 0 };
    expect(needsPaymentRetry(holiday)).toBe(false);
    expect(suspendedForPayment(holiday)).toBe(false);
  });

  it("has nothing to retry without Stripe billing, or once the membership has ended", () => {
    expect(needsPaymentRetry({ status: "active", stripeSubscriptionId: null, failedPaymentCount: 2 })).toBe(false);
    expect(needsPaymentRetry({ status: "cancelled", stripeSubscriptionId: "sub_1", failedPaymentCount: 2 })).toBe(false);
    expect(needsPaymentRetry({ status: "active", stripeSubscriptionId: "sub_1", failedPaymentCount: 0 })).toBe(false);
  });
});
