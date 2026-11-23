/**
 * Card payments for salons other than Barkin' Beautiful.
 *
 * The card screens take a client or membership id. Until 23/11/2026 the
 * card functions refused anything outside tenant 1, which kept every other
 * salon out entirely. Those blocks are gone, so each procedure now checks
 * the record belongs to the caller's own salon, and every Stripe call is
 * made on that salon's own account.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { clients, memberships, tenants } from "../drizzle/schema";
import { requireClientStripe } from "./clientStripe";
import { forgetTrialState } from "./trialState";

function database(rowsByTable: Map<unknown, Array<Record<string, unknown>>>) {
  const make = (table?: unknown): any => {
    const rows = () => rowsByTable.get(table) ?? [];
    const chain: any = {
      from: (t: unknown) => make(t), where: () => chain, orderBy: () => chain,
      innerJoin: () => chain, leftJoin: () => chain,
      limit: (n: number) => Promise.resolve(rows().slice(0, n)),
      then: (res: any, rej?: any) => Promise.resolve(rows()).then(res, rej),
    };
    return chain;
  };
  return { select: () => make(), update: () => ({ set: () => ({ where: async () => {} }) }) };
}

const SALON_7 = {
  id: 7, billingExempt: 1, trialEndsAt: null, name: "Barkin Beautiful Barber", slug: "barber",
  stripeAccountId: "acct_barber", stripeChargesEnabled: true, stripeDetailsSubmitted: true, platformFeeBps: null,
};
/** The owner of salon 7, an admin of that salon only. */
const owner = () => appRouter.createCaller({ user: { id: 5, role: "admin" }, tenantId: 7, accessibleTenantIds: [7] } as any);

let setJwt = false;
beforeEach(() => {
  forgetTrialState();
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_other_salon_cards";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";
  if (!process.env.JWT_SECRET) { process.env.JWT_SECRET = "other-salon-cards-test-secret"; setJwt = true; }
});
afterEach(() => {
  if (setJwt) { delete process.env.JWT_SECRET; setJwt = false; }
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
});

describe("a salon owner and another salon's clients", () => {
  it("cannot read or act on a Barkin' Beautiful client's card", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[tenants, [SALON_7]], [clients, [{ id: 40, tenantId: 1 }]]])));
    const o = owner();
    await expect(o.stripeCards.cardStatus({ clientId: 40 })).rejects.toThrow(/Client not found/);
    await expect(o.stripeCards.createSetupLink({ clientId: 40 })).rejects.toThrow(/Client not found/);
    await expect(o.stripeCards.removeCard({ clientId: 40 })).rejects.toThrow(/Client not found/);
  });

  it("cannot start, pause or charge a Barkin' Beautiful membership", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[tenants, [SALON_7]], [memberships, [{ id: 9, tenantId: 1 }]]])));
    const o = owner();
    await expect(o.stripeCards.startSubscription({ membershipId: 9 })).rejects.toThrow(/Membership not found/);
    await expect(o.stripeCards.pauseSubscription({ membershipId: 9, plan: { mode: "manual" } })).rejects.toThrow(/Membership not found/);
    await expect(o.stripeCards.chargeNow({ membershipId: 9 })).rejects.toThrow(/Membership not found/);
  });

  it("cannot sweep a legacy membership with no salon recorded, which is Barkin' Beautiful's", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[tenants, [SALON_7]], [memberships, [{ id: 9, tenantId: null }]]])));
    await expect(owner().stripeCards.cancelSubscription({ membershipId: 9 })).rejects.toThrow(/Membership not found/);
  });

  it("can hand out a card link for their own client", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[tenants, [SALON_7]], [clients, [{ id: 501, tenantId: 7 }]]])));
    await expect(owner().stripeCards.createSetupLink({ clientId: 501 })).resolves.toMatchObject({ url: expect.stringContaining("/card/") });
  });
});

describe("the Stripe client for a salon's card payments", () => {
  it("is bound to the salon's own account, for every request made with it", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[tenants, [SALON_7]]])));
    const stripe = await requireClientStripe(7);
    // stripe-node keeps the account it was built with here and sends it on
    // every request as the Stripe-Account header.
    expect((stripe as any)._api.stripeAccount).toBe("acct_barber");
  });

  it("is refused for a salon that has not connected its own Stripe", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[tenants, [{ ...SALON_7, stripeAccountId: null, stripeChargesEnabled: false, stripeDetailsSubmitted: false }]]])));
    await expect(requireClientStripe(7)).rejects.toThrow(/Connect the salon's own Stripe account/);
    await expect(owner().stripeCards.createSetupLink({ clientId: 501 })).rejects.toThrow();
  });
});
