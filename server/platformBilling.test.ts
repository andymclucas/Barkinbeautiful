import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  describeSalonSubscription, isPlatformSubscriptionMetadata, platformSubscriptionMetadata,
  salonHasAccess, salonStatusFromStripe, PLATFORM_SUBSCRIPTION_MARKER,
  type SalonSubscriptionStatus, type StripeSubscriptionStatus,
} from "../shared/platformBilling";

const NOW = new Date("2026-11-23T00:00:00+10:00");

describe("Stripe's eight statuses as our four", () => {
  it("maps every status Stripe can send", () => {
    // Listed in full so a status cannot be forgotten: each one decides
    // whether a salon keeps its diary.
    const all: Record<StripeSubscriptionStatus, SalonSubscriptionStatus> = {
      active: "active",
      trialing: "trialing",
      past_due: "past_due",
      unpaid: "past_due",
      incomplete: "past_due",
      paused: "past_due",
      canceled: "cancelled",
      incomplete_expired: "cancelled",
    };
    for (const [stripe, ours] of Object.entries(all)) {
      expect(salonStatusFromStripe(stripe), stripe).toBe(ours);
    }
  });

  it("treats a declined first payment as recoverable, not cancelled", () => {
    // `incomplete` is a card declined at sign-up. Stripe holds it open for
    // 23 hours and a working card rescues it, so telling the salon their
    // account is gone would be both wrong and the thing that makes them
    // give up.
    expect(salonStatusFromStripe("incomplete")).toBe("past_due");
    expect(salonStatusFromStripe("incomplete_expired")).toBe("cancelled");
  });

  it("never guesses in the direction of 'they have paid'", () => {
    // A status Stripe adds later, or junk. Guessing active is the one
    // guess that costs money.
    for (const unknown of ["", "something_new", "ACTIVE", "trial"]) {
      expect(salonStatusFromStripe(unknown), unknown).toBe("past_due");
    }
  });
});

describe("who keeps access", () => {
  it("does not take the diary away over a failed card", () => {
    /*
     * A card that expired overnight must not lock a salon out on the
     * morning of a full book — dogs arrive at 7:30 and there is no way to
     * serve them without the diary. Chasing the payment is a different
     * problem from stopping the business.
     */
    expect(salonHasAccess({ status: "past_due", now: NOW })).toBe(true);
    expect(salonHasAccess({ status: "active", now: NOW })).toBe(true);
    expect(salonHasAccess({ status: "trialing", now: NOW })).toBe(true);
  });

  it("lets a cancelled salon finish the period it paid for", () => {
    const laterThisMonth = new Date("2026-12-01T00:00:00+10:00");
    expect(salonHasAccess({ status: "cancelled", currentPeriodEnd: laterThisMonth, now: NOW })).toBe(true);
  });

  it("stops once the paid period has actually run out", () => {
    const lastMonth = new Date("2026-10-01T00:00:00+10:00");
    expect(salonHasAccess({ status: "cancelled", currentPeriodEnd: lastMonth, now: NOW })).toBe(false);
    expect(salonHasAccess({ status: "cancelled", currentPeriodEnd: null, now: NOW })).toBe(false);
  });
});

describe("what the salon is told", () => {
  it("says what to do when a payment fails, not just that it did", () => {
    // "Past due" on its own sends somebody hunting for a phone number.
    expect(describeSalonSubscription({ status: "past_due", now: NOW }))
      .toContain("update the card");
  });

  it("names the renewal and trial dates in Brisbane", () => {
    expect(describeSalonSubscription({
      status: "active", currentPeriodEnd: new Date("2026-12-23T03:00:00Z"), now: NOW,
    })).toBe("Active — renews 23 December");
    expect(describeSalonSubscription({
      status: "trialing", trialEndsAt: new Date("2026-12-07T03:00:00Z"), now: NOW,
    })).toBe("Free trial — ends 7 December");
  });

  it("distinguishes cancelled-but-still-running from finished", () => {
    expect(describeSalonSubscription({
      status: "cancelled", currentPeriodEnd: new Date("2026-12-01T00:00:00+10:00"), now: NOW,
    })).toContain("access until");
    expect(describeSalonSubscription({
      status: "cancelled", currentPeriodEnd: new Date("2026-10-01T00:00:00+10:00"), now: NOW,
    })).toBe("Cancelled");
  });

  it("copes with a missing date rather than printing Invalid Date", () => {
    expect(describeSalonSubscription({ status: "active", now: NOW })).toBe("Active");
    expect(describeSalonSubscription({ status: "trialing", now: NOW })).toBe("Free trial");
  });
});

describe("telling a PLATFORM subscription from a membership one", () => {
  /*
   * The most dangerous confusion in this feature.
   *
   * Memberships already run Stripe subscriptions — a client paying the
   * salon weekly — and they raise the same invoice.* and
   * customer.subscription.* events on the same webhook endpoint. Barkin'
   * Beautiful has no connected account, so those live on the PLATFORM
   * account too and `event.account` does not separate them.
   *
   * The webhook records each event id once and returns early on a
   * duplicate, so a platform handler that wrongly claimed a membership
   * invoice would permanently stop that membership's billing from being
   * processed — silently, with no error anywhere.
   */
  it("only recognises an object we marked ourselves", () => {
    expect(isPlatformSubscriptionMetadata(platformSubscriptionMetadata(2))).toBe(true);
    expect(isPlatformSubscriptionMetadata({ groomigo_membership_id: "120002" })).toBe(false);
    expect(isPlatformSubscriptionMetadata({})).toBe(false);
    expect(isPlatformSubscriptionMetadata(null)).toBe(false);
    expect(isPlatformSubscriptionMetadata(undefined)).toBe(false);
  });

  it("does not accept a near miss", () => {
    expect(isPlatformSubscriptionMetadata({ [PLATFORM_SUBSCRIPTION_MARKER]: "0" })).toBe(false);
    expect(isPlatformSubscriptionMetadata({ [PLATFORM_SUBSCRIPTION_MARKER]: "true" })).toBe(false);
    expect(isPlatformSubscriptionMetadata({ [PLATFORM_SUBSCRIPTION_MARKER]: "" })).toBe(false);
  });

  it("carries the salon it belongs to", () => {
    expect(platformSubscriptionMetadata(2).groomigo_tenant_id).toBe("2");
  });
});

/*
 * "The webhook cannot confuse our subscription with a membership" used to
 * be three assertions here over the TEXT of stripePayments.ts. They are
 * now run for real, against the handler, in platformBillingWebhook.test.ts.
 */

describe("the platform account is never the salon's own", () => {
  /*
   * Comments stripped. The file explains at length what stripeAccountId
   * is and why it must not be used here, and asserting over that prose
   * fails on the explanation rather than on the code — which is how a
   * structural test ends up pinning its own documentation.
   */
  const strip = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  // Both halves: starting the subscription, and the webhook that follows it.
  const source = strip("server/platformBilling.ts") + strip("server/platformBillingWebhook.ts");

  it("passes no stripeAccount option anywhere", () => {
    /*
     * The one mistake that would look like it worked. stripePayments.ts
     * passes { stripeAccount } so a dog owner's money lands with the
     * salon; doing that here would charge the salon's subscription on the
     * salon's own account — Lauren billing herself, into her own balance,
     * with Groomigo paid nothing.
     */
    expect(source).not.toContain("stripeAccount");
  });

  it("never reaches for a customer id belonging to another account", () => {
    // clients.stripe_customer_id is a dog owner, often minted on a
    // connected account. A Stripe customer belongs to the account it was
    // created on.
    expect(source).not.toContain("clients.stripeCustomerId");
    expect(source).toContain("tenants.platformStripeCustomerId");
  });
});
