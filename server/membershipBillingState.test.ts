import { describe, expect, it } from "vitest";
import {
  membershipBillingState, BILLING_STATE_LABEL, billingStateHint, needsAttention,
} from "@shared/membershipBillingState";

describe("the 154 memberships that read Active and charge nothing", () => {
  it("flags a MoeGo-only membership instead of calling it active", () => {
    // Every membership the salon has, on 08/10/2026: gateway "other", no
    // subscription, no billing date, $4,101 a week between them — and a
    // green tick on each one.
    const state = membershipBillingState({
      status: "active", nextBillingDate: null,
      stripeSubscriptionId: null, gatewaySubscriptionId: null,
    });
    expect(state).toBe("needs_migration");
    expect(BILLING_STATE_LABEL[state]).toBe("In MoeGo only — needs migration");
  });

  it("says what to do about it", () => {
    expect(billingStateHint("needs_migration")).toContain("Set Weekly Billing");
    expect(billingStateHint("needs_migration")).toContain("card");
  });

  it("is not satisfied by a billing date alone", () => {
    // A date with no card charges nobody. Toni Constantini has had an
    // active $104/week Diamond membership with no Stripe customer and no
    // card since before any of this.
    expect(membershipBillingState({
      status: "active", nextBillingDate: new Date(), hasCardOnFile: false,
    })).toBe("needs_migration");
  });

  it("is not satisfied by a card alone", () => {
    expect(membershipBillingState({
      status: "active", nextBillingDate: null, hasCardOnFile: true,
    })).toBe("needs_migration");
  });
});

describe("a membership that really is billing", () => {
  it("counts a date plus a card", () => {
    expect(membershipBillingState({
      status: "active", nextBillingDate: new Date(), hasCardOnFile: true,
    })).toBe("live");
  });

  it("counts a subscription on its own, because it charges itself", () => {
    expect(membershipBillingState({
      status: "active", nextBillingDate: null, stripeSubscriptionId: "sub_123",
    })).toBe("live");
    expect(membershipBillingState({
      status: "active", nextBillingDate: null, gatewaySubscriptionId: "gw_123",
    })).toBe("live");
  });

  it("needs nobody's attention", () => {
    expect(needsAttention("live")).toBe(false);
    expect(billingStateHint("live")).toBeNull();
  });
});

describe("a membership added on the phone", () => {
  it("is distinguished from one that is accidentally not billing", () => {
    // Deliberate, not an oversight — and the wording says so.
    const state = membershipBillingState({ status: "pending_payment", nextBillingDate: null });
    expect(state).toBe("added_not_live");
    expect(BILLING_STATE_LABEL[state]).toBe("Added — not billing yet");
    expect(needsAttention(state)).toBe(true);
  });
});

describe("memberships that have stopped", () => {
  it("does not nag about a cancelled or expired one", () => {
    for (const status of ["cancelled", "expired"]) {
      const state = membershipBillingState({ status, nextBillingDate: null });
      expect(state).toBe("ended");
      expect(needsAttention(state)).toBe(false);
    }
  });

  it("leaves a paused one alone", () => {
    expect(membershipBillingState({ status: "paused", nextBillingDate: null })).toBe("paused");
    expect(needsAttention("paused")).toBe(false);
  });
});
