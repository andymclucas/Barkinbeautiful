import { describe, it, expect } from "vitest";
import { subscriptionIdOf } from "./stripePayments";

/**
 * Stripe moved `invoice.subscription` to
 * `invoice.parent.subscription_details.subscription` after API version
 * 2025-03-31, and the webhook endpoint's API version is picked from a
 * dropdown in the Stripe dashboard - by a human, possibly long after this
 * was written.
 *
 * Getting it wrong fails silently: an invoice event that cannot be matched
 * to a membership returns 200 and does nothing, so weekly billing records no
 * payments and raises no alerts while looking perfectly healthy. These pin
 * both shapes so a future SDK bump cannot quietly drop one.
 */
const invoice = (shape: unknown) => shape as Parameters<typeof subscriptionIdOf>[0];

describe("subscriptionIdOf", () => {
  it("reads the modern shape (2025-03-31 and later)", () => {
    expect(subscriptionIdOf(invoice({
      parent: { subscription_details: { subscription: "sub_modern" }, type: "subscription_details" },
    }))).toBe("sub_modern");
  });

  it("still reads the legacy top-level field", () => {
    expect(subscriptionIdOf(invoice({ subscription: "sub_legacy" }))).toBe("sub_legacy");
  });

  it("prefers the modern shape when an invoice somehow carries both", () => {
    expect(subscriptionIdOf(invoice({
      subscription: "sub_legacy",
      parent: { subscription_details: { subscription: "sub_modern" } },
    }))).toBe("sub_modern");
  });

  it("accepts an expanded subscription object rather than an id", () => {
    expect(subscriptionIdOf(invoice({
      parent: { subscription_details: { subscription: { id: "sub_expanded", object: "subscription" } } },
    }))).toBe("sub_expanded");
    expect(subscriptionIdOf(invoice({ subscription: { id: "sub_expanded_legacy" } }))).toBe("sub_expanded_legacy");
  });

  it("is null for a one-off invoice with no subscription behind it", () => {
    // A manual invoice is a real case, not an error: it must fall through to
    // the unmatched path rather than throwing inside the webhook.
    expect(subscriptionIdOf(invoice({}))).toBeNull();
    expect(subscriptionIdOf(invoice({ subscription: null }))).toBeNull();
    expect(subscriptionIdOf(invoice({ parent: null }))).toBeNull();
    expect(subscriptionIdOf(invoice({ parent: { subscription_details: null } }))).toBeNull();
    expect(subscriptionIdOf(invoice({ parent: { subscription_details: { subscription: null } } }))).toBeNull();
  });
});
