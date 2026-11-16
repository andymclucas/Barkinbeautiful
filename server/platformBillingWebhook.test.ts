import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const { getDb, stripe } = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));
vi.mock("./db", () => ({ getDb }));
vi.mock("./stripeClient", () => ({ requireStripeClient: () => stripe }));
vi.mock("./ownerNotification", () => ({ notifyOwner: vi.fn(async () => true) }));

import { handlePlatformStripeEvent, type PlatformWebhookStore } from "./platformBillingWebhook";
import { processStripeEvent } from "./stripePayments";
import { stripeEvents, tenants } from "../drizzle/schema";
import { platformSubscriptionMetadata } from "@shared/platformBilling";

/**
 * These run the webhook path itself, with Stripe and the database stood
 * in for. They replace three tests that read stripePayments.ts as text
 * and asserted on the order of its substrings.
 */

type TenantRow = { platformStripeCustomerId: string | null; platformStripeSubscriptionId: string | null };

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_salon7",
  status: "active",
  customer: "cus_salon7",
  metadata: platformSubscriptionMetadata(7),
  ...over,
}) as unknown as Stripe.Subscription;

const event = (type: string, object: unknown, id = "evt_1") =>
  ({ id, type, data: { object } }) as unknown as Stripe.Event;

const platformCheckout = (over: Record<string, unknown> = {}) => event("checkout.session.completed", {
  id: "cs_1",
  mode: "subscription",
  payment_status: "paid",
  metadata: platformSubscriptionMetadata(7),
  subscription: "sub_salon7",
  customer: "cus_salon7",
  ...over,
});

/** A store over a small in-memory set of salons and Stripe subscriptions. */
function fakeStore(input: {
  tenants?: Record<number, TenantRow>;
  subscriptions?: Record<string, Stripe.Subscription>;
} = {}) {
  const salonRows: Record<number, TenantRow> = input.tenants ?? {
    7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: null },
  };
  const subscriptions = input.subscriptions ?? { sub_salon7: subscription() };
  const synced: Array<{ tenantId: number; subscriptionId: string; status: string }> = [];
  const recorded: Array<{ id: string; type: string; tenantId: number }> = [];
  const alerts: string[] = [];
  const order: string[] = [];

  const store: PlatformWebhookStore = {
    loadTenant: async (tenantId) => salonRows[tenantId] ?? null,
    tenantIdForSubscription: async (subscriptionId) => {
      const hit = Object.entries(salonRows).find(([, row]) =>
        subscriptionId !== null && row.platformStripeSubscriptionId === subscriptionId);
      return hit ? Number(hit[0]) : null;
    },
    retrieveSubscription: async (subscriptionId) => {
      const found = subscriptions[subscriptionId];
      if (!found) throw new Error(`No such subscription: ${subscriptionId}`);
      return found;
    },
    sync: async (tenantId, sub) => {
      order.push("sync");
      const status = sub.status === "active" ? "active" : sub.status === "canceled" ? "cancelled" : "past_due";
      synced.push({ tenantId, subscriptionId: sub.id, status });
      salonRows[tenantId].platformStripeSubscriptionId = status === "cancelled" ? null : sub.id;
      return { status };
    },
    recordEvent: async (e, tenantId) => {
      order.push("record");
      recorded.push({ id: e.id, type: e.type, tenantId });
    },
    alert: async (title) => { alerts.push(title); },
  };
  return { store, salonRows, synced, recorded, alerts, order };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("a salon finishing Checkout for its Groomigo subscription", () => {
  it("links the subscription to the salon the checkout was started for", async () => {
    const f = fakeStore();
    const result = await handlePlatformStripeEvent(platformCheckout(), f.store);

    expect(result).toEqual({ platformSubscription: "active" });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBe("sub_salon7");
    expect(f.synced).toEqual([{ tenantId: 7, subscriptionId: "sub_salon7", status: "active" }]);
    expect(f.recorded).toEqual([{ id: "evt_1", type: "checkout.session.completed", tenantId: 7 }]);
  });

  it("is never recorded against tenant 1 unless tenant 1 is who it names", async () => {
    const f = fakeStore({
      tenants: {
        1: { platformStripeCustomerId: "cus_barkin", platformStripeSubscriptionId: null },
        7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: null },
      },
    });
    await handlePlatformStripeEvent(platformCheckout(), f.store);
    expect(f.recorded.map((r) => r.tenantId)).toEqual([7]);
    expect(f.salonRows[1].platformStripeSubscriptionId).toBeNull();
  });

  it("writes the salon's state before recording the event as done", async () => {
    // Recorded first, a failed write would be answered "duplicate" on
    // Stripe's retry and a salon that paid would stay locked out.
    const f = fakeStore();
    await handlePlatformStripeEvent(platformCheckout(), f.store);
    expect(f.order).toEqual(["sync", "record"]);
  });

  it("leaves the event unrecorded when the write fails, so Stripe's retry repairs it", async () => {
    const f = fakeStore();
    f.store.sync = async () => { throw new Error("connection reset"); };
    await expect(handlePlatformStripeEvent(platformCheckout(), f.store)).rejects.toThrow("connection reset");
    expect(f.recorded).toEqual([]);
  });

  it("gives the same answer when Stripe delivers it twice", async () => {
    const f = fakeStore();
    await handlePlatformStripeEvent(platformCheckout(), f.store);
    const again = await handlePlatformStripeEvent(platformCheckout(), f.store);
    expect(again).toEqual({ platformSubscription: "active" });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBe("sub_salon7");
  });

  it("writes what Stripe says NOW, not what the event said when it was sent", async () => {
    // A checkout event replayed after the subscription was cancelled.
    const f = fakeStore({ subscriptions: { sub_salon7: subscription({ status: "canceled" }) } });
    const result = await handlePlatformStripeEvent(platformCheckout(), f.store);
    expect(result).toEqual({ platformSubscription: "cancelled" });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBeNull();
  });
});

describe("a marked checkout that does not add up", () => {
  const refused = async (f: ReturnType<typeof fakeStore>, e: Stripe.Event) => {
    const result = await handlePlatformStripeEvent(e, f.store);
    // Handled by nobody: not passed on (null), not applied, not recorded.
    expect(result).toMatchObject({ ignored: true });
    expect(f.synced).toEqual([]);
    expect(f.recorded).toEqual([]);
    expect(f.alerts).toHaveLength(1);
  };

  it("is refused when it names no salon", async () => {
    await refused(fakeStore(), platformCheckout({ metadata: { groomigo_platform_subscription: "1" } }));
  });

  it("is refused when the salon does not exist", async () => {
    await refused(fakeStore({ tenants: {} }), platformCheckout());
  });

  it("is refused when the paying customer is not that salon's", async () => {
    await refused(fakeStore(), platformCheckout({ customer: "cus_somebody_else" }));
  });

  it("is refused when the subscription is marked for a different salon", async () => {
    await refused(
      fakeStore({ subscriptions: { sub_salon7: subscription({ metadata: platformSubscriptionMetadata(8) }) } }),
      platformCheckout(),
    );
  });

  it("is refused when it also looks like a client's payment", async () => {
    await refused(fakeStore(), platformCheckout({
      metadata: { ...platformSubscriptionMetadata(7), tenant_id: "1", membership_id: "3" },
    }));
  });

  it("does not replace a subscription the salon already follows", async () => {
    const f = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_first" } },
      subscriptions: { sub_second: subscription({ id: "sub_second" }) },
    });
    const result = await handlePlatformStripeEvent(platformCheckout({ subscription: "sub_second" }), f.store);
    expect(result).toEqual({ platformSubscription: "second_subscription" });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBe("sub_first");
    expect(f.synced).toEqual([]);
    expect(f.alerts).toHaveLength(1);
  });
});

describe("a client paying the salon is never mistaken for the salon paying us", () => {
  const untouched = async (e: Stripe.Event) => {
    const f = fakeStore();
    expect(await handlePlatformStripeEvent(e, f.store)).toBeNull();
    expect(f.synced).toEqual([]);
    expect(f.recorded).toEqual([]);
    expect(f.alerts).toEqual([]);
  };

  it("passes on an invoice paid through Checkout", async () => {
    await untouched(event("checkout.session.completed", {
      mode: "payment", payment_status: "paid", metadata: { tenant_id: "7", invoice_id: "55", client_id: "9" },
    }));
  });

  it("passes on a card being saved", async () => {
    await untouched(event("checkout.session.completed", {
      mode: "setup", metadata: { tenant_id: "1", groomigo_client_id: "9" }, setup_intent: "seti_1",
    }));
  });

  it("passes on a membership subscription's checkout, invoice and status change", async () => {
    const membership = { groomigo_membership_id: "120002" };
    await untouched(event("checkout.session.completed", {
      mode: "subscription", metadata: membership, subscription: "sub_member", customer: "cus_client",
    }));
    await untouched(event("invoice.paid", {
      id: "in_1", customer: "cus_client",
      parent: { subscription_details: { subscription: "sub_member", metadata: membership } },
    }));
    await untouched(event("invoice.payment_failed", { id: "in_2", subscription: "sub_member" }));
    await untouched(event("customer.subscription.updated", {
      id: "sub_member", status: "active", customer: "cus_client", metadata: membership,
    }));
    await untouched(event("customer.subscription.deleted", {
      id: "sub_member", status: "canceled", customer: "cus_client", metadata: {},
    }));
  });

  it("passes on everything that is not about a subscription at all", async () => {
    await untouched(event("charge.refunded", { id: "ch_1", metadata: {} }));
    await untouched(event("payment_intent.succeeded", { id: "pi_1" }));
  });
});

describe("the salon's invoices", () => {
  it("links the salon from its FIRST invoice when that beats the checkout here", async () => {
    // Stripe does not promise an order. Nothing has stored the id yet, so
    // only the marker Stripe copied onto the invoice can identify it.
    const f = fakeStore();
    const result = await handlePlatformStripeEvent(event("invoice.paid", {
      id: "in_first", customer: "cus_salon7",
      parent: { subscription_details: { subscription: "sub_salon7", metadata: platformSubscriptionMetadata(7) } },
    }), f.store);
    expect(result).toEqual({ platformSubscription: "active" });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBe("sub_salon7");
    expect(f.recorded.map((r) => r.tenantId)).toEqual([7]);
  });

  it("matches a later invoice on the stored id, with no metadata on it at all", async () => {
    const f = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_salon7" } },
      subscriptions: { sub_salon7: subscription({ status: "past_due" }) },
    });
    const result = await handlePlatformStripeEvent(
      event("invoice.payment_failed", { id: "in_9", subscription: "sub_salon7" }), f.store,
    );
    // Stripe's view of the subscription decides, not the invoice.
    expect(result).toEqual({ platformSubscription: "past_due" });
    expect(f.recorded).toEqual([{ id: "evt_1", type: "invoice.payment_failed", tenantId: 7 }]);
  });

  it("refuses a marked first invoice from somebody else's customer", async () => {
    const f = fakeStore();
    const result = await handlePlatformStripeEvent(event("invoice.paid", {
      id: "in_first", customer: "cus_other",
      parent: { subscription_details: { subscription: "sub_salon7", metadata: platformSubscriptionMetadata(7) } },
    }), f.store);
    expect(result).toMatchObject({ ignored: true });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBeNull();
  });
});

describe("the salon's subscription changing", () => {
  it("follows a change to the subscription the salon is on", async () => {
    const f = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_salon7" } },
      subscriptions: { sub_salon7: subscription({ status: "canceled" }) },
    });
    const result = await handlePlatformStripeEvent(
      event("customer.subscription.deleted", subscription({ status: "canceled" })), f.store,
    );
    expect(result).toEqual({ platformSubscription: "cancelled" });
    expect(f.salonRows[7].platformStripeSubscriptionId).toBeNull();
  });

  it("writes Stripe's current state when an older change arrives late", async () => {
    // The event says active; Stripe, asked now, says past_due.
    const f = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_salon7" } },
      subscriptions: { sub_salon7: subscription({ status: "past_due" }) },
    });
    const result = await handlePlatformStripeEvent(
      event("customer.subscription.updated", subscription({ status: "active" })), f.store,
    );
    expect(result).toEqual({ platformSubscription: "past_due" });
  });

  it("still cancels when the deleted subscription can no longer be read", async () => {
    const f = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_salon7" } },
      subscriptions: {},
    });
    const result = await handlePlatformStripeEvent(
      event("customer.subscription.deleted", subscription({ status: "canceled" })), f.store,
    );
    expect(result).toEqual({ platformSubscription: "cancelled" });
    // An unreadable subscription on a mere "updated" is a fault to retry.
    const g = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_salon7" } },
      subscriptions: {},
    });
    await expect(handlePlatformStripeEvent(
      event("customer.subscription.updated", subscription()), g.store,
    )).rejects.toThrow("No such subscription");
    expect(g.recorded).toEqual([]);
  });

  it("does not let an OLD subscription's cancellation cancel the new one", async () => {
    // Marked for salon 7, but salon 7 now follows a different subscription.
    const f = fakeStore({
      tenants: { 7: { platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: "sub_new" } },
      subscriptions: { sub_old: subscription({ id: "sub_old", status: "canceled" }) },
    });
    await handlePlatformStripeEvent(
      event("customer.subscription.deleted", subscription({ id: "sub_old", status: "canceled" })), f.store,
    );
    expect(f.synced).toEqual([]);
    expect(f.salonRows[7].platformStripeSubscriptionId).toBe("sub_new");
  });
});

/**
 * The wiring: processStripeEvent, with a database that answers by table.
 * Proves the platform handler is asked BEFORE the client handlers, and
 * that a client's checkout still reaches them.
 */
describe("processStripeEvent", () => {
  function database(tenantRow: Record<string, unknown> | null) {
    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const select = () => {
      const make = (table?: unknown): any => {
        const rows = () => (table === tenants && tenantRow ? [tenantRow] : []);
        const chain: any = {
          from: (t: unknown) => make(t),
          where: () => chain, orderBy: () => chain, innerJoin: () => chain, leftJoin: () => chain,
          limit: () => Promise.resolve(rows()),
          then: (res: any, rej?: any) => Promise.resolve(rows()).then(res, rej),
        };
        return chain;
      };
      return make();
    };
    return {
      inserts, updates,
      db: {
        select: vi.fn(select),
        insert: (table: unknown) => ({
          values: async (values: Record<string, unknown>) => { inserts.push({ table, values }); return [{ insertId: 1 }]; },
        }),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => { updates.push({ table, values }); },
          }),
        }),
      },
    };
  }

  it("links a platform checkout to its salon and records nothing against tenant 1", async () => {
    const d = database({
      id: 7, platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: null,
    });
    getDb.mockResolvedValue(d.db);
    stripe.subscriptions.retrieve.mockResolvedValue(subscription({
      current_period_end: 1_800_000_000,
      items: { data: [{ price: { id: "price_pro_test" } }] },
    }));
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_test");

    const result = await processStripeEvent(platformCheckout());

    expect(result).toEqual({ platformSubscription: "active" });
    const tenantUpdate = d.updates.find((u) => u.table === tenants);
    expect(tenantUpdate?.values).toMatchObject({
      platformStripeSubscriptionId: "sub_salon7",
      subscriptionStatus: "active",
      // What they bought, not the everything-included trial plan.
      subscriptionPlan: "professional",
      // A paying salon is no longer counting down a trial.
      trialEndsAt: null,
    });
    const events = d.inserts.filter((i) => i.table === stripeEvents);
    expect(events.map((e) => e.values.tenantId)).toEqual([7]);
    vi.unstubAllEnvs();
  });

  it("leaves the plan alone when the price is not one of ours", async () => {
    const d = database({ id: 7, platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: null });
    getDb.mockResolvedValue(d.db);
    stripe.subscriptions.retrieve.mockResolvedValue(subscription({
      items: { data: [{ price: { id: "price_unknown" } }] },
    }));
    await processStripeEvent(platformCheckout());
    const tenantUpdate = d.updates.find((u) => u.table === tenants);
    expect(tenantUpdate?.values).not.toHaveProperty("subscriptionPlan");
    expect(tenantUpdate?.values).toMatchObject({ subscriptionStatus: "active" });
  });

  it("still hands a client's invoice checkout to the client handler", async () => {
    const d = database(null);
    getDb.mockResolvedValue(d.db);
    const result = await processStripeEvent(event("checkout.session.completed", {
      id: "cs_client", mode: "payment", payment_status: "unpaid",
      metadata: { tenant_id: "7", invoice_id: "55", client_id: "9" },
    }));
    expect(result).toMatchObject({ handled: "invoice_checkout" });
    const events = d.inserts.filter((i) => i.table === stripeEvents);
    expect(events).toHaveLength(1);
    expect(events[0].values).toMatchObject({ tenantId: 7, invoiceId: 55, clientId: 9 });
    expect(d.updates.filter((u) => u.table === tenants)).toEqual([]);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("does nothing for an event it has already processed", async () => {
    const d = database({ id: 7, platformStripeCustomerId: "cus_salon7", platformStripeSubscriptionId: null });
    // The stripe_events lookup finds a row.
    d.db.select = vi.fn(() => {
      const chain: any = { from: () => chain, where: () => chain, limit: () => Promise.resolve([{ id: 1 }]) };
      return chain;
    });
    getDb.mockResolvedValue(d.db);
    expect(await processStripeEvent(platformCheckout())).toEqual({ duplicate: true });
    expect(d.updates).toEqual([]);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});
