import { describe, expect, it } from "vitest";
import {
  householdPaymentToJoin,
  paymentMergeOffer,
  planPaymentMerge,
  type FamilyBillingRow,
  type PaymentMergeCandidate,
} from "./familyBilling";

const row = (id: number, over: Partial<FamilyBillingRow & { failedPaymentCount: number }> = {}) => ({
  id, status: "active", stripeSubscriptionId: null as string | null, billingCycle: "weekly", billingCycleWeeks: 1,
  pricePerCycle: "15.00", petName: `Dog ${id}`, name: "Bronze", ...over,
});

describe("householdPaymentToJoin", () => {
  it("joins the one payment the household already has", () => {
    const rows = [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { status: "pending_payment" })];
    expect(householdPaymentToJoin(rows, 2)).toEqual([1, 2]);
  });

  it("brings along every dog already on that payment", () => {
    const rows = [row(1, { stripeSubscriptionId: "sub_a" }), row(3, { stripeSubscriptionId: "sub_a" }), row(2)];
    expect(householdPaymentToJoin(rows, 2)?.sort()).toEqual([1, 2, 3]);
  });

  it("does not start billing for another dog that is not billing yet", () => {
    const rows = [row(1, { stripeSubscriptionId: "sub_a" }), row(2), row(4)];
    expect(householdPaymentToJoin(rows, 2)).toEqual([1, 2]);
  });

  it("bills on its own when there is nothing clear to join", () => {
    const cases: Array<[string, ReturnType<typeof row>[]]> = [
      ["first dog of the household", [row(2), row(4)]],
      ["no other dog at all", [row(2)]],
      ["two separate payments already", [row(1, { stripeSubscriptionId: "sub_a" }), row(3, { stripeSubscriptionId: "sub_b" }), row(2)]],
      ["a different cadence", [row(1, { stripeSubscriptionId: "sub_a", billingCycleWeeks: 2 }), row(2)]],
      ["a monthly plan", [row(1, { stripeSubscriptionId: "sub_a", billingCycle: "monthly" }), row(2)]],
      ["a failing payment", [row(1, { stripeSubscriptionId: "sub_a", status: "pending_payment" }), row(2)]],
      ["a paused payment", [row(1, { stripeSubscriptionId: "sub_a", status: "paused" }), row(2)]],
      ["no price on the new dog", [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { pricePerCycle: "0" })]],
    ];
    for (const [label, rows] of cases) expect(householdPaymentToJoin(rows, 2), label).toBeNull();
  });

  it("ignores a cancelled membership that still carries an old payment", () => {
    const rows = [row(1, { stripeSubscriptionId: "sub_old", status: "cancelled" }), row(3, { stripeSubscriptionId: "sub_a" }), row(2)];
    expect(householdPaymentToJoin(rows, 2)).toEqual([3, 2]);
  });

  it("does nothing for a membership already billing", () => {
    expect(householdPaymentToJoin([row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_b" })], 2)).toBeNull();
  });
});

const c = (id: number, sub: string, over: Partial<PaymentMergeCandidate> = {}): PaymentMergeCandidate => ({
  id, clientId: 9, tenantId: 1, status: "active", stripeSubscriptionId: sub, cycle: "weekly", amountCents: 1500, failedPaymentCount: 0, ...over,
});

describe("planPaymentMerge", () => {
  it("moves the second dog onto the first dog's payment", () => {
    expect(planPaymentMerge([c(1, "sub_a"), c(2, "sub_b")])).toEqual({
      ok: true, keepSubscriptionId: "sub_a", moving: [{ id: 2, fromSubscriptionId: "sub_b" }], totalCents: 3000,
    });
  });

  it("keeps the payment with the most dogs, so the fewest lines move", () => {
    const plan = planPaymentMerge([c(1, "sub_a"), c(2, "sub_b"), c(3, "sub_b")]);
    expect(plan).toMatchObject({ ok: true, keepSubscriptionId: "sub_b", moving: [{ id: 1, fromSubscriptionId: "sub_a" }] });
  });

  it("refuses anything that could charge the wrong card, amount or cadence", () => {
    const refused: Array<[string, PaymentMergeCandidate[]]> = [
      ["one membership", [c(1, "sub_a")]],
      ["already together", [c(1, "sub_a"), c(2, "sub_a")]],
      ["two clients", [c(1, "sub_a"), c(2, "sub_b", { clientId: 10 })]],
      ["two salons", [c(1, "sub_a"), c(2, "sub_b", { tenantId: 2 })]],
      ["one not billing", [c(1, "sub_a"), c(2, "sub_b", { stripeSubscriptionId: null })]],
      ["a failed charge", [c(1, "sub_a"), c(2, "sub_b", { failedPaymentCount: 1 })]],
      ["a failing payment", [c(1, "sub_a"), c(2, "sub_b", { status: "pending_payment" })]],
      ["a paused one", [c(1, "sub_a"), c(2, "sub_b", { status: "paused" })]],
      ["different cycles", [c(1, "sub_a"), c(2, "sub_b", { cycle: "fortnightly" })]],
      ["no price", [c(1, "sub_a"), c(2, "sub_b", { amountCents: 0 })]],
      ["the same one twice", [c(1, "sub_a"), c(1, "sub_a")]],
    ];
    for (const [label, rows] of refused) expect(planPaymentMerge(rows).ok, label).toBe(false);
  });
});

describe("paymentMergeOffer", () => {
  it("offers to combine two healthy separate payments", () => {
    const offer = paymentMergeOffer([row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_b", pricePerCycle: "20.00" })]);
    expect(offer).toMatchObject({ membershipIds: [1, 2], payments: 2, totalCents: 3500 });
  });

  it("ignores closed memberships", () => {
    expect(paymentMergeOffer([row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_b", status: "cancelled" })])).toBeNull();
  });

  it("offers nothing when it is not clear-cut", () => {
    const cases: Array<[string, ReturnType<typeof row>[]]> = [
      ["one payment", [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_a" })]],
      ["a failed charge", [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_b", failedPaymentCount: 1 })]],
      ["a paused payment", [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_b", status: "paused" })]],
      ["mixed cadence", [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_b", billingCycleWeeks: 2 })]],
      ["monthly", [row(1, { stripeSubscriptionId: "sub_a", billingCycle: "monthly" }), row(2, { stripeSubscriptionId: "sub_b", billingCycle: "monthly" })]],
    ];
    for (const [label, rows] of cases) expect(paymentMergeOffer(rows), label).toBeNull();
  });
});
