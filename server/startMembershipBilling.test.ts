import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, stripe } = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripe: {
    products: { retrieve: vi.fn(), create: vi.fn() },
    subscriptions: { create: vi.fn() },
  },
}));
vi.mock("./db", () => ({ getDb }));
vi.mock("./stripeClient", () => ({ requireStripeClient: () => stripe }));

import { membershipLiveOnStart, startMembershipSubscription } from "./stripeCards";

/** Answers selects in order and records every update's values. */
function fakeDb(selects: unknown[][]) {
  const queue = [...selects];
  const updates: Record<string, unknown>[] = [];
  const db: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(queue.shift() ?? []) }) }) }),
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
    const { db, updates } = fakeDb([[addedNotBilling], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_1", status: "trialing", items: { data: [] } });

    await expect(startMembershipSubscription(501, "2026-11-19")).resolves.toEqual({ subscriptionId: "sub_1", alreadyExisted: false });
    expect(updates[0]).toMatchObject({ stripeSubscriptionId: "sub_1", status: "active" });
  });

  it("leaves it pending when Stripe could not take the first charge", async () => {
    const { db, updates } = fakeDb([[addedNotBilling], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_2", status: "incomplete", items: { data: [] } });

    await startMembershipSubscription(501);
    expect(updates[0]).toMatchObject({ stripeSubscriptionId: "sub_2" });
    expect(updates[0]).not.toHaveProperty("status");
  });

  it("does not touch the status of a membership that was already active", async () => {
    const { db, updates } = fakeDb([[{ ...addedNotBilling, status: "active" }], [cardOnFile]]);
    getDb.mockResolvedValue(db);
    stripe.subscriptions.create.mockResolvedValue({ id: "sub_3", status: "active", items: { data: [] } });

    await startMembershipSubscription(501);
    expect(updates[0]).not.toHaveProperty("status");
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
