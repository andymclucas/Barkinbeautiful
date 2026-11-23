import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, stripe } = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripe: {
    products: { retrieve: vi.fn(), create: vi.fn() },
    subscriptions: { create: vi.fn() },
    subscriptionItems: { list: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("./db", () => ({ getDb }));
vi.mock("./clientStripe", () => ({ requireClientStripe: async () => stripe, tenantIdOfClient: async () => 1 }));

import { membershipLiveOnStart, startMembershipSubscription } from "./stripeCards";

/** Answers selects in order and records every update's values. */
function fakeDb(selects: unknown[][]) {
  const queue = [...selects];
  const updates: Record<string, unknown>[] = [];
  const db: any = {
    // A where() is either limited or awaited directly (the household lookup).
    select: () => ({ from: () => ({ where: () => {
      const next = () => Promise.resolve(queue.shift() ?? []);
      return { limit: next, then: (resolve: any, reject: any) => next().then(resolve, reject) };
    } }) }),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => Promise.resolve() }; } }),
  };
  return { db, updates };
}

// Hunter's, 12/11/2026: added from his client page, so pending with no subscription.
const addedNotBilling = {
  id: 501, tenantId: 1, clientId: 315, name: "Silver VIP Classic - Small (0–10 kg)",
  pricePerCycle: "17.00", billingCycleWeeks: 1, billingCycle: "weekly",
  status: "pending_payment", stripeSubscriptionId: null,
};
const cardOnFile = { stripeCustomerId: "cus_test", paymentMethodId: "pm_test" };

beforeEach(() => {
  vi.clearAllMocks();
  stripe.products.retrieve.mockResolvedValue({ id: "groomigo_membership_t1", deleted: false });
});

describe("starting weekly billing", () => {
  it("starts a membership that was added and not yet billing, and makes it live — the case that failed for Hunter", async () => {
    const { db, updates } = fakeDb([[addedNotBilling], [addedNotBilling], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_1", status: "trialing", items: { data: [] } });

    await expect(startMembershipSubscription(501, "2026-11-19")).resolves.toEqual({ subscriptionId: "sub_1", alreadyExisted: false, joinedHousehold: false, totalCents: null });
    expect(updates[0]).toMatchObject({ stripeSubscriptionId: "sub_1", status: "active" });
  });

  it("leaves it pending when Stripe could not take the first charge", async () => {
    const { db, updates } = fakeDb([[addedNotBilling], [addedNotBilling], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_2", status: "incomplete", items: { data: [] } });

    await startMembershipSubscription(501);
    expect(updates[0]).toMatchObject({ stripeSubscriptionId: "sub_2" });
    expect(updates[0]).not.toHaveProperty("status");
  });

  it("does not touch the status of a membership that was already active", async () => {
    const { db, updates } = fakeDb([[{ ...addedNotBilling, status: "active" }], [{ ...addedNotBilling, status: "active" }], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_3", status: "active", items: { data: [] } });

    await startMembershipSubscription(501);
    expect(updates[0]).not.toHaveProperty("status");
  });

  it("puts a second dog on the payment the family already has, rather than charging twice", async () => {
    // Andy, 22/11/2026: multi-dog families on membership pay as a single payment.
    const sibling = { ...addedNotBilling, id: 500, status: "active", stripeSubscriptionId: "sub_family", isTest: false };
    const { db, updates } = fakeDb([
      [addedNotBilling],                                   // the membership being started
      [sibling, { ...addedNotBilling, isTest: false }],    // the household
      [{ ...sibling, isTest: false }, { ...addedNotBilling, isTest: false }], // startFamilySubscription's rows
      [cardOnFile],
      [{ nextBillingDate: new Date("2026-11-24T23:00:00Z") }], // the sibling's next charge
    ]);
    db.update = () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => Promise.resolve([{ affectedRows: 1 }]) }; } });
    getDb.mockResolvedValue(db);
    stripe.subscriptionItems.list.mockResolvedValue({ data: [{ id: "si_1", metadata: { groomigo_membership_id: "500" } }] });
    stripe.subscriptionItems.create.mockResolvedValue({ id: "si_2" });

    await expect(startMembershipSubscription(501, "2026-11-19")).resolves.toEqual({
      subscriptionId: "sub_family", alreadyExisted: false, joinedHousehold: true, totalCents: 3400,
    });
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(stripe.subscriptionItems.create).toHaveBeenCalledWith(expect.objectContaining({
      subscription: "sub_family", proration_behavior: "none",
    }));
    expect(updates[0]).toMatchObject({ stripeSubscriptionId: "sub_family" });
  });

  it("bills on its own when staff promised a first charge later than the family's next payment", async () => {
    const sibling = { ...addedNotBilling, id: 500, status: "active", stripeSubscriptionId: "sub_family", isTest: false, nextBillingDate: new Date("2027-01-05T23:00:00Z") };
    const { db, updates } = fakeDb([[addedNotBilling], [sibling, { ...addedNotBilling, isTest: false }], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_own", status: "trialing", items: { data: [] } });

    await expect(startMembershipSubscription(501, "2027-02-02")).resolves.toMatchObject({ subscriptionId: "sub_own", joinedHousehold: false });
    expect(stripe.subscriptionItems.create).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ stripeSubscriptionId: "sub_own" });
  });

  it("still refuses a paused or cancelled membership", async () => {
    getDb.mockResolvedValue(fakeDb([[{ ...addedNotBilling, status: "paused" }]]).db);
    await expect(startMembershipSubscription(501)).rejects.toThrow("paused");
    getDb.mockResolvedValue(fakeDb([[{ ...addedNotBilling, status: "cancelled" }]]).db);
    await expect(startMembershipSubscription(501)).rejects.toThrow("cancelled");
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("never starts a second subscription on a pending membership whose payment failed", async () => {
    getDb.mockResolvedValue(fakeDb([[{ ...addedNotBilling, stripeSubscriptionId: "sub_old" }]]).db);
    await expect(startMembershipSubscription(501)).rejects.toThrow("pending_payment");
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
});

describe("membershipLiveOnStart", () => {
  it("is live when Stripe accepted it, now or on a later first-charge day", () => {
    expect(membershipLiveOnStart("active")).toBe(true);
    expect(membershipLiveOnStart("trialing")).toBe(true);
    expect(membershipLiveOnStart("incomplete")).toBe(false);
    expect(membershipLiveOnStart(undefined)).toBe(false);
  });
});
