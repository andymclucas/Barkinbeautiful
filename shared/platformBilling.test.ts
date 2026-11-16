import { describe, expect, it } from "vitest";
import {
  CLIENT_PAYMENT_METADATA_KEYS, PLATFORM_SUBSCRIPTION_MARKER, classifyPlatformCheckout,
  describeSalonSubscription, planForPriceId, platformLinkProblem, platformSubscriptionMetadata,
  platformTenantIdFromMetadata,
} from "./platformBilling";

const platformSession = (over: Record<string, unknown> = {}) => ({
  mode: "subscription",
  metadata: platformSubscriptionMetadata(7),
  subscription: "sub_salon7",
  customer: "cus_salon7",
  ...over,
});

describe("which salon a marked Stripe object belongs to", () => {
  it("reads the salon we wrote", () => {
    expect(platformTenantIdFromMetadata(platformSubscriptionMetadata(7))).toBe(7);
    expect(platformTenantIdFromMetadata(platformSubscriptionMetadata(1))).toBe(1);
  });

  it("never falls back to tenant 1", () => {
    /*
     * Tenant 1 is Barkin' Beautiful, which does not pay. The generic
     * checkout handler's `Number(metadata.tenant_id || 1)` is how a
     * platform payment used to be filed under it. No input here may
     * produce a salon that the metadata did not name.
     */
    const marker = { [PLATFORM_SUBSCRIPTION_MARKER]: "1" };
    for (const id of [undefined, "", "0", "-3", "1.5", "abc", "1e3", " 2", "02", "99999999999999999999"]) {
      const metadata = id === undefined ? marker : { ...marker, groomigo_tenant_id: id };
      expect(platformTenantIdFromMetadata(metadata as Record<string, string>), String(id)).toBeNull();
    }
  });

  it("needs the marker, not just a salon id", () => {
    expect(platformTenantIdFromMetadata({ groomigo_tenant_id: "7" })).toBeNull();
    expect(platformTenantIdFromMetadata({ tenant_id: "7" })).toBeNull();
    expect(platformTenantIdFromMetadata(null)).toBeNull();
    expect(platformTenantIdFromMetadata(undefined)).toBeNull();
  });
});

describe("is this completed Checkout a salon paying Groomigo", () => {
  it("claims the checkout this app starts for a salon", () => {
    expect(classifyPlatformCheckout(platformSession())).toEqual({
      kind: "platform", tenantId: 7, subscriptionId: "sub_salon7", customerId: "cus_salon7",
    });
  });

  it("reads expanded Stripe objects as well as bare ids", () => {
    expect(classifyPlatformCheckout(platformSession({
      subscription: { id: "sub_x" }, customer: { id: "cus_x" },
    }))).toMatchObject({ kind: "platform", subscriptionId: "sub_x", customerId: "cus_x" });
  });

  it("leaves every kind of client payment alone", () => {
    /*
     * A salon's own clients paying the salon: a membership invoice, a
     * card being saved, the portal's pay-today, a membership subscription.
     * None carries the marker, so none can be claimed — whatever its mode
     * and whichever salon it names.
     */
    const clientSessions: Array<Parameters<typeof classifyPlatformCheckout>[0]> = [
      { mode: "payment", metadata: { tenant_id: "1", invoice_id: "55", client_id: "9" } },
      { mode: "payment", metadata: { tenant_id: "7", invoice_id: "55", membership_id: "3" } },
      { mode: "setup", metadata: { tenant_id: "1", groomigo_client_id: "9" } },
      { mode: "payment", metadata: { tenant_id: "1", client_id: "9", payment_kind: "portal_appointment", appointment_ids: "1,2" } },
      { mode: "subscription", metadata: { groomigo_membership_id: "120002" }, subscription: "sub_m", customer: "cus_c" },
      { mode: "subscription", metadata: {}, subscription: "sub_m", customer: "cus_c" },
      { mode: "subscription", metadata: null, subscription: "sub_m", customer: "cus_c" },
      // A salon id on its own is not the marker.
      { mode: "subscription", metadata: { groomigo_tenant_id: "7" }, subscription: "sub_m", customer: "cus_c" },
    ];
    for (const session of clientSessions) {
      expect(classifyPlatformCheckout(session), JSON.stringify(session.metadata)).toEqual({ kind: "not_platform" });
    }
  });

  it("refuses a marked checkout it cannot attribute, rather than passing it on", () => {
    /*
     * "refused" and "not_platform" are different answers on purpose. The
     * client handlers default to tenant 1, so a marked session handed on
     * to them is a platform payment filed under Barkin' Beautiful.
     */
    const marker = { [PLATFORM_SUBSCRIPTION_MARKER]: "1" };
    const unsound = [
      platformSession({ metadata: marker }),
      platformSession({ metadata: { ...marker, groomigo_tenant_id: "0" } }),
      platformSession({ mode: "payment" }),
      platformSession({ mode: "setup" }),
      platformSession({ subscription: null }),
      platformSession({ customer: null }),
    ];
    for (const session of unsound) {
      expect(classifyPlatformCheckout(session as never).kind, JSON.stringify(session)).toBe("refused");
    }
  });

  it("refuses a session that claims to be both directions of money", () => {
    for (const key of CLIENT_PAYMENT_METADATA_KEYS) {
      const decision = classifyPlatformCheckout(platformSession({
        metadata: { ...platformSubscriptionMetadata(7), [key]: "1" },
      }));
      expect(decision.kind, key).toBe("refused");
    }
  });

  it("writes none of the client-payment keys itself", () => {
    // The mixed-metadata refusal above would refuse every real platform
    // checkout if this ever stopped being true.
    for (const key of CLIENT_PAYMENT_METADATA_KEYS) {
      expect(platformSubscriptionMetadata(7)).not.toHaveProperty(key);
    }
  });
});

describe("may a salon be pointed at a subscription", () => {
  const sound = {
    tenantId: 7,
    subscriptionId: "sub_salon7",
    customerId: "cus_salon7",
    tenant: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: null },
    subscriptionMetadata: platformSubscriptionMetadata(7),
  };

  it("yes, when the customer and the subscription both name that salon", () => {
    expect(platformLinkProblem(sound)).toEqual({ problem: null });
  });

  it("yes again for the subscription it already follows", () => {
    // A replayed event, or the invoice arriving after the checkout.
    expect(platformLinkProblem({
      ...sound, tenant: { ...sound.tenant, platformStripeSubscriptionId: "sub_salon7" },
    })).toEqual({ problem: null });
  });

  it("no, for a salon that does not exist", () => {
    expect(platformLinkProblem({ ...sound, tenant: null }).problem).toBe("refuse");
  });

  it("no, when the paying customer is not that salon's", () => {
    // The marker names salon 7 but the money came from somebody else's
    // customer record: one salon's payment must not unlock another.
    expect(platformLinkProblem({ ...sound, customerId: "cus_other" }).problem).toBe("refuse");
    expect(platformLinkProblem({ ...sound, customerId: null }).problem).toBe("refuse");
    expect(platformLinkProblem({
      ...sound, tenant: { platformStripeCustomerId: null, platformStripeSubscriptionId: null },
    }).problem).toBe("refuse");
  });

  it("no, when the subscription itself is not marked for that salon", () => {
    expect(platformLinkProblem({ ...sound, subscriptionMetadata: {} }).problem).toBe("refuse");
    expect(platformLinkProblem({
      ...sound, subscriptionMetadata: platformSubscriptionMetadata(8),
    }).problem).toBe("refuse");
    expect(platformLinkProblem({
      ...sound, subscriptionMetadata: { groomigo_membership_id: "120002" },
    }).problem).toBe("refuse");
  });

  it("keeps the subscription a salon already follows when a second appears", () => {
    const result = platformLinkProblem({
      ...sound, tenant: { ...sound.tenant, platformStripeSubscriptionId: "sub_first" },
    });
    expect(result.problem).toBe("second_subscription");
  });
});

describe("which plan a price buys", () => {
  const prices = { starter: "price_s", professional: "price_p", enterprise: "price_e" };

  it("is the plan whose configured price Stripe is charging", () => {
    expect(planForPriceId("price_s", prices)).toBe("starter");
    expect(planForPriceId("price_p", prices)).toBe("professional");
    expect(planForPriceId("price_e", prices)).toBe("enterprise");
  });

  it("is unknown, never a guess, for any other price", () => {
    expect(planForPriceId("price_other", prices)).toBeNull();
    expect(planForPriceId(null, prices)).toBeNull();
    expect(planForPriceId("", prices)).toBeNull();
    // An unset price must not match an absent one.
    expect(planForPriceId("", { starter: "" })).toBeNull();
    expect(planForPriceId("price_s", {})).toBeNull();
    expect(planForPriceId("price_s", { starter: null, professional: undefined })).toBeNull();
  });
});

describe("what an expired trial is told on the billing page", () => {
  const NOW = new Date("2026-11-23T00:00:00+10:00");

  it("says it has ended and what to do, not that it 'ends' in the past", () => {
    expect(describeSalonSubscription({
      status: "trialing", trialEndsAt: new Date("2026-11-20T03:00:00Z"), now: NOW,
    })).toBe("Free trial ended 20 November — choose a plan to carry on");
  });

  it("still counts down a trial that is running", () => {
    expect(describeSalonSubscription({
      status: "trialing", trialEndsAt: new Date("2026-11-27T03:00:00Z"), now: NOW,
    })).toBe("Free trial — ends 27 November");
  });
});
