import { describe, expect, it } from "vitest";
import { paidInvoiceKeyFor, planFamilyBilling, splitInvoiceCents, type FamilyBillingCandidate } from "./familyBilling";

const m = (id: number, over: Partial<FamilyBillingCandidate> = {}): FamilyBillingCandidate => ({
  id, clientId: 9, tenantId: 1, status: "pending_payment", stripeSubscriptionId: null, cycle: "weekly", amountCents: 1700, ...over,
});

describe("planFamilyBilling", () => {
  it("starts one new payment for two dogs not yet billing", () => {
    const plan = planFamilyBilling([m(1), m(2)]);
    expect(plan).toMatchObject({ ok: true, existingSubscriptionId: null, totalCents: 3400 });
    if (plan.ok) expect(plan.toAdd.map((c) => c.id)).toEqual([1, 2]);
  });

  it("adds a dog to a payment that is already running", () => {
    const plan = planFamilyBilling([m(1, { status: "active", stripeSubscriptionId: "sub_a" }), m(2, { amountCents: 2200 })]);
    expect(plan).toMatchObject({ ok: true, existingSubscriptionId: "sub_a", totalCents: 3900 });
    if (plan.ok) {
      expect(plan.toAdd.map((c) => c.id)).toEqual([2]);
      expect(plan.alreadyOn.map((c) => c.id)).toEqual([1]);
    }
  });

  it("refuses anything that would charge the wrong card, amount or cadence", () => {
    const refused: Array<[string, FamilyBillingCandidate[]]> = [
      ["one membership", [m(1)]],
      ["the same one twice", [m(1), m(1)]],
      ["two clients", [m(1), m(2, { clientId: 10 })]],
      ["two salons", [m(1), m(2, { tenantId: 2 })]],
      ["different cycles", [m(1), m(2, { cycle: "fortnightly" })]],
      ["no price", [m(1), m(2, { amountCents: 0 })]],
      ["an unbillable cycle", [m(1), m(2, { cycle: null })]],
      ["two separate live payments", [m(1, { status: "active", stripeSubscriptionId: "sub_a" }), m(2, { status: "active", stripeSubscriptionId: "sub_b" })]],
      ["already together", [m(1, { status: "active", stripeSubscriptionId: "sub_a" }), m(2, { status: "active", stripeSubscriptionId: "sub_a" })]],
      ["a paused one", [m(1), m(2, { status: "paused" })]],
      ["a cancelled one", [m(1), m(2, { status: "cancelled" })]],
      ["joining a failing payment", [m(1, { status: "pending_payment", stripeSubscriptionId: "sub_a" }), m(2)]],
    ];
    for (const [label, rows] of refused) expect(planFamilyBilling(rows).ok, label).toBe(false);
  });
});

describe("splitInvoiceCents", () => {
  it("splits a plain charge by each membership's own price", () => {
    expect(splitInvoiceCents(3900, [{ membershipId: 1, expectedCents: 1700 }, { membershipId: 2, expectedCents: 2200 }]))
      .toEqual([{ membershipId: 1, cents: 1700 }, { membershipId: 2, cents: 2200 }]);
  });

  it("always adds back up to what was taken, whatever the amount", () => {
    for (const total of [0, 1, 3399, 3401, 5000, 123457]) {
      const parts = splitInvoiceCents(total, [
        { membershipId: 1, expectedCents: 1700 }, { membershipId: 2, expectedCents: 1700 }, { membershipId: 3, expectedCents: 2600 },
      ]);
      expect(parts.reduce((s, p) => s + p.cents, 0), String(total)).toBe(total);
      expect(parts.every((p) => p.cents >= 0)).toBe(true);
    }
  });

  it("splits evenly when no price is known", () => {
    expect(splitInvoiceCents(101, [{ membershipId: 1, expectedCents: 0 }, { membershipId: 2, expectedCents: 0 }]))
      .toEqual([{ membershipId: 1, cents: 51 }, { membershipId: 2, cents: 50 }]);
  });
});

describe("paidInvoiceKeyFor", () => {
  it("keeps the bare invoice id for a membership billed alone", () => {
    expect(paidInvoiceKeyFor("in_1", 7, false)).toBe("in_1");
  });
  it("gives each membership on a shared invoice its own key", () => {
    expect(paidInvoiceKeyFor("in_1", 7, true)).toBe("in_1:7");
    expect(paidInvoiceKeyFor("in_1", 8, true)).toBe("in_1:8");
  });
});

describe("familyBillingOffer", () => {
  const row = (id: number, over: Record<string, unknown> = {}) => ({
    id, status: "pending_payment", stripeSubscriptionId: null, billingCycle: "weekly", billingCycleWeeks: 1, pricePerCycle: "17.00", petName: `Dog ${id}`, isTest: true, ...over,
  });

  it("offers one payment for two dogs not billing yet", async () => {
    const { familyBillingOffer } = await import("./familyBilling");
    expect(familyBillingOffer([row(1), row(2)])).toMatchObject({ membershipIds: [1, 2], joinsExisting: false, totalCents: 3400 });
  });

  it("offers to add a new dog to the payment already running", async () => {
    const { familyBillingOffer } = await import("./familyBilling");
    const offer = familyBillingOffer([row(1, { status: "active", stripeSubscriptionId: "sub_a" }), row(2, { pricePerCycle: "22.00" })]);
    expect(offer).toMatchObject({ membershipIds: [1, 2], joinsExisting: true, totalCents: 3900 });
    expect(offer?.adding.map((r) => r.id)).toEqual([2]);
  });

  it("offers nothing when it is not clear-cut", async () => {
    const { familyBillingOffer } = await import("./familyBilling");
    expect(familyBillingOffer([row(1)])).toBeNull();
    expect(familyBillingOffer([row(1), row(2, { status: "cancelled" })])).toBeNull();
    expect(familyBillingOffer([row(1), row(2, { billingCycleWeeks: 2 })])).toBeNull();
    expect(familyBillingOffer([row(1), row(2, { billingCycle: "monthly" })])).toBeNull();
    expect(familyBillingOffer([row(1, { status: "active", stripeSubscriptionId: "sub_a" }), row(2, { status: "active", stripeSubscriptionId: "sub_b" }), row(3)])).toBeNull();
    expect(familyBillingOffer([row(1, { status: "pending_payment", stripeSubscriptionId: "sub_a" }), row(2)])).toBeNull();
    expect(familyBillingOffer([row(1, { status: "active", stripeSubscriptionId: "sub_a" }), row(2, { status: "active", stripeSubscriptionId: "sub_a" })])).toBeNull();
  });

  it("is offered only on test memberships while it is being proven", async () => {
    const { familyBillingOffer, FAMILY_BILLING_TEST_ONLY } = await import("./familyBilling");
    expect(familyBillingOffer([row(1), row(2, { isTest: false })]) === null).toBe(FAMILY_BILLING_TEST_ONLY);
  });

  it("names the other dogs on the same payment", async () => {
    const { billedTogetherWith } = await import("./familyBilling");
    const rows = [row(1, { stripeSubscriptionId: "sub_a" }), row(2, { stripeSubscriptionId: "sub_a" }), row(3, { stripeSubscriptionId: "sub_b" }), row(4)];
    expect(billedTogetherWith(rows[0], rows).map((r) => r.id)).toEqual([2]);
    expect(billedTogetherWith(rows[3], rows)).toEqual([]);
  });
});

describe("groupPayments", () => {
  it("shows one family payment with each dog's share under it", async () => {
    const { groupPayments } = await import("./familyBilling");
    const groups = groupPayments([
      { id: 2, amount: "17.00", status: "paid", paidAt: "2026-11-13", membershipName: "Silver", petName: "Leia", stripeInvoiceId: "in_1" },
      { id: 1, amount: "17.00", status: "paid", paidAt: "2026-11-13", membershipName: "Silver", petName: "Luke", stripeInvoiceId: "in_1" },
      { id: 0, amount: "22.00", status: "paid", paidAt: "2026-11-06", membershipName: "Gold", petName: "Luke", stripeInvoiceId: "in_0" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ totalCents: 3400, status: "paid" });
    expect(groups[0].lines.map((l) => [l.petName, l.cents])).toEqual([["Leia", 1700], ["Luke", 1700]]);
    expect(groups[1]).toMatchObject({ totalCents: 2200 });
    expect(groups[1].lines).toHaveLength(1);
  });

  it("keeps a failed attempt apart from the later success on the same invoice", async () => {
    const { groupPayments } = await import("./familyBilling");
    const groups = groupPayments([
      { id: 4, amount: "17.00", status: "paid", paidAt: "2026-11-14", membershipName: "A", stripeInvoiceId: "in_1" },
      { id: 3, amount: "17.00", status: "paid", paidAt: "2026-11-14", membershipName: "B", stripeInvoiceId: "in_1" },
      { id: 2, amount: "17.00", status: "failed", paidAt: null, membershipName: "A", stripeInvoiceId: "in_1" },
      { id: 1, amount: "17.00", status: "failed", paidAt: null, membershipName: "B", stripeInvoiceId: "in_1" },
    ]);
    expect(groups.map((g) => [g.status, g.totalCents])).toEqual([["paid", 3400], ["failed", 3400]]);
  });

  it("never merges rows that have no invoice", async () => {
    const { groupPayments } = await import("./familyBilling");
    expect(groupPayments([
      { id: 2, amount: "17.00", status: "paid", paidAt: null, membershipName: "A" },
      { id: 1, amount: "17.00", status: "paid", paidAt: null, membershipName: "B" },
    ])).toHaveLength(2);
  });
});
