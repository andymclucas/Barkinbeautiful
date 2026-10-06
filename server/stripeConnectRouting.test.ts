import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb, requireStripeClient } = vi.hoisted(() => ({
  getDb: vi.fn(), requireStripeClient: vi.fn(),
}));
vi.mock("./db", () => ({ getDb }));
vi.mock("./stripeClient", () => ({ requireStripeClient }));

import { createInvoiceCheckout } from "./stripePayments";

/** Records the second argument Stripe is called with — the account option. */
function stripeSpy() {
  const calls: Array<{ method: string; params: any; options: any }> = [];
  return {
    calls,
    customers: { create: vi.fn(async (params: any, options: any) => { calls.push({ method: "customers.create", params, options }); return { id: "cus_1" }; }) },
    checkout: { sessions: { create: vi.fn(async (params: any, options: any) => { calls.push({ method: "checkout.create", params, options }); return { id: "cs_1", url: "https://stripe.test/pay" }; }) } },
  };
}

function dbWith(tenant: Record<string, unknown>) {
  const tables = [[{ stripeCustomerId: null }], [tenant]];
  let call = 0;
  const chain: any = {
    from: () => chain, where: () => chain,
    limit: () => Promise.resolve(call === 1 ? [tenant] : [{ stripeCustomerId: null }]),
  };
  return {
    select: vi.fn((cols: any) => {
      // The tenant lookup asks for stripeAccountId; the client one does not.
      call = cols && "stripeAccountId" in cols ? 1 : 0;
      return chain;
    }),
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  };
}

const request = {
  tenantId: 1, clientId: 5, invoiceId: 9, invoiceNumber: "GROOM-1",
  totalCents: 14_500, clientName: "Simone Yates", clientEmail: "s@example.com",
  origin: "https://staff.barkinbeautiful.com.au",
};

beforeEach(() => { getDb.mockReset(); requireStripeClient.mockReset(); });

describe("a salon with no connected account", () => {
  it("charges on the platform account, exactly as it does today", async () => {
    // Barkin' Beautiful. This is the fallback that has to be perfect:
    // routing their live payments anywhere else would take real money to
    // the wrong place.
    const stripe = stripeSpy();
    requireStripeClient.mockReturnValue(stripe);
    getDb.mockResolvedValue(dbWith({ stripeAccountId: null, stripeChargesEnabled: false, stripeDetailsSubmitted: false, platformFeeBps: null }));

    await createInvoiceCheckout(request as any);

    const customer = stripe.calls.find(c => c.method === "customers.create")!;
    const checkout = stripe.calls.find(c => c.method === "checkout.create")!;
    expect(customer.options).toBeUndefined();
    expect(checkout.options).toBeUndefined();
    // And no fee is taken from a payment that is not on a connected account.
    expect(checkout.params.payment_intent_data.application_fee_amount).toBeUndefined();
  });
});

describe("a salon Stripe has cleared", () => {
  const connected = { stripeAccountId: "acct_salon2", stripeChargesEnabled: true, stripeDetailsSubmitted: true, platformFeeBps: null };

  it("charges on their own account, so the money is theirs", async () => {
    const stripe = stripeSpy();
    requireStripeClient.mockReturnValue(stripe);
    getDb.mockResolvedValue(dbWith(connected));

    await createInvoiceCheckout(request as any);
    const customer = stripe.calls.find(c => c.method === "customers.create")!;
    const checkout = stripe.calls.find(c => c.method === "checkout.create")!;
    // Both on the same account — a customer made on the platform cannot be
    // charged on a connected one.
    expect(customer.options).toEqual({ stripeAccount: "acct_salon2" });
    expect(checkout.options).toEqual({ stripeAccount: "acct_salon2" });
  });

  it("takes no fee while none is set", async () => {
    const stripe = stripeSpy();
    requireStripeClient.mockReturnValue(stripe);
    getDb.mockResolvedValue(dbWith(connected));
    await createInvoiceCheckout(request as any);
    const checkout = stripe.calls.find(c => c.method === "checkout.create")!;
    expect(checkout.params.payment_intent_data.application_fee_amount).toBeUndefined();
  });

  it("takes the configured fee once there is one", async () => {
    const stripe = stripeSpy();
    requireStripeClient.mockReturnValue(stripe);
    getDb.mockResolvedValue(dbWith({ ...connected, platformFeeBps: 250 }));
    await createInvoiceCheckout(request as any);
    const checkout = stripe.calls.find(c => c.method === "checkout.create")!;
    // 2.5% of a $145 groom is $3.62, floored.
    expect(checkout.params.payment_intent_data.application_fee_amount).toBe(362);
  });
});

describe("a salon part way through onboarding", () => {
  it("still charges on the platform account rather than failing", async () => {
    // Their clients must be able to pay while Stripe is still asking them
    // for a bank statement.
    const stripe = stripeSpy();
    requireStripeClient.mockReturnValue(stripe);
    getDb.mockResolvedValue(dbWith({ stripeAccountId: "acct_half", stripeChargesEnabled: false, stripeDetailsSubmitted: true, platformFeeBps: 250 }));
    await createInvoiceCheckout(request as any);
    const checkout = stripe.calls.find(c => c.method === "checkout.create")!;
    expect(checkout.options).toBeUndefined();
    expect(checkout.params.payment_intent_data.application_fee_amount).toBeUndefined();
  });
});
