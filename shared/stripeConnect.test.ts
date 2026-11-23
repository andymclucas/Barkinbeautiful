import { describe, expect, it } from "vitest";
import { clientMoneyAccount, connectedEventProblem } from "./stripeConnect";

const ready = { stripeAccountId: "acct_barber", stripeChargesEnabled: true, stripeDetailsSubmitted: true };
const none = { stripeAccountId: null, stripeChargesEnabled: false, stripeDetailsSubmitted: false };
const half = { stripeAccountId: "acct_half", stripeChargesEnabled: false, stripeDetailsSubmitted: true };

describe("whose Stripe takes a salon's client money", () => {
  it("Barkin' Beautiful keeps the platform account, which is its own, whatever it connects", () => {
    // Its saved cards and subscriptions all live there.
    for (const tenant of [none, half, ready, null]) {
      expect(clientMoneyAccount({ tenantId: 1, homeTenantId: 1, tenant, connectEventsReceived: true }))
        .toEqual({ kind: "platform" });
    }
  });

  it("another salon is never put on Barkin' Beautiful's account", () => {
    for (const tenant of [none, half, null]) {
      expect(clientMoneyAccount({ tenantId: 7, homeTenantId: 1, tenant, connectEventsReceived: true }).kind)
        .toBe("refused");
    }
  });

  it("another salon takes money on its own account once Stripe has cleared it", () => {
    expect(clientMoneyAccount({ tenantId: 7, homeTenantId: 1, tenant: ready, connectEventsReceived: true }))
      .toEqual({ kind: "connected", accountId: "acct_barber" });
  });

  it("a connected account is not used while its payment notices cannot be received", () => {
    expect(clientMoneyAccount({ tenantId: 7, homeTenantId: 1, tenant: ready, connectEventsReceived: false }).kind)
      .toBe("refused");
  });
});

describe("an event from a salon's connected account", () => {
  const ok = { accountTenantId: 7, metadataTenantId: null, clientId: null, clientTenantId: null };

  it("is processed when it names nobody else", () => {
    expect(connectedEventProblem(ok)).toBeNull();
    expect(connectedEventProblem({ ...ok, metadataTenantId: 7, clientId: 5, clientTenantId: 7 })).toBeNull();
  });

  it("is refused when it names another salon", () => {
    expect(connectedEventProblem({ ...ok, metadataTenantId: 1 })).toMatch(/salon 1/);
  });

  it("is refused when its client belongs to another salon, or to none", () => {
    expect(connectedEventProblem({ ...ok, clientId: 5, clientTenantId: 1 })).toMatch(/client 5/);
    expect(connectedEventProblem({ ...ok, clientId: 5, clientTenantId: null })).toMatch(/client 5/);
  });
});

describe("an event from a salon's connected account naming a record", () => {
  const base = { accountTenantId: 7, metadataTenantId: 7, clientId: null, clientTenantId: null };

  it("is refused when it names an invoice or membership but no salon", () => {
    // The handlers would default it to Barkin' Beautiful's invoice of that number.
    expect(connectedEventProblem({ ...base, metadataTenantId: null, namesARecord: true })).toMatch(/no salon/);
  });

  it("is refused when its membership belongs to another salon", () => {
    expect(connectedEventProblem({ ...base, namesARecord: true, membershipId: 9, membershipTenantId: 1 })).toMatch(/membership 9/);
  });

  it("is processed when the membership is the salon's own", () => {
    expect(connectedEventProblem({ ...base, namesARecord: true, membershipId: 9, membershipTenantId: 7 })).toBeNull();
  });
});
