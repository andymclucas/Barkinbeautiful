import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, processStripeEvent, tenantIdForStripeAccount, notifyOwner } = vi.hoisted(() => ({
  getDb: vi.fn(), processStripeEvent: vi.fn(), tenantIdForStripeAccount: vi.fn(), notifyOwner: vi.fn(),
}));
vi.mock("./db", () => ({ getDb }));
vi.mock("./stripePayments", () => ({ processStripeEvent }));
vi.mock("./stripeConnectAccounts", () => ({ tenantIdForStripeAccount }));
vi.mock("./ownerNotification", () => ({ notifyOwner }));

import { clients, memberships } from "../drizzle/schema";
import { processConnectedStripeEvent } from "./connectWebhook";

function database(rows: Map<unknown, Array<Record<string, unknown>>>) {
  const make = (table?: unknown): any => {
    const chain: any = { from: (t: unknown) => make(t), where: () => chain, limit: () => Promise.resolve(rows.get(table) ?? []) };
    return chain;
  };
  return { select: () => make() };
}

const event = (metadata: Record<string, string>, account: string | undefined = "acct_barber") =>
  ({ id: "evt_1", type: "checkout.session.completed", account, data: { object: { metadata } } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  tenantIdForStripeAccount.mockResolvedValue(7);
  processStripeEvent.mockResolvedValue({ handled: true });
  notifyOwner.mockResolvedValue(true);
});

describe("an event from a salon's own Stripe account", () => {
  it("is handled when it is that salon's", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[clients, [{ tenantId: 7 }]]])));
    await expect(processConnectedStripeEvent(event({ tenant_id: "7", client_id: "501", invoice_id: "3" })))
      .resolves.toEqual({ handled: true });
  });

  it("is ignored from an account no salon has", async () => {
    tenantIdForStripeAccount.mockResolvedValue(null);
    getDb.mockResolvedValue(database(new Map()));
    await expect(processConnectedStripeEvent(event({ tenant_id: "7" }))).resolves.toMatchObject({ ignored: true });
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("is refused, and somebody told, when it would mark Barkin' Beautiful's invoice paid", async () => {
    getDb.mockResolvedValue(database(new Map()));
    await expect(processConnectedStripeEvent(event({ invoice_id: "3" }))).resolves.toMatchObject({ ignored: true });
    expect(processStripeEvent).not.toHaveBeenCalled();
    expect(notifyOwner).toHaveBeenCalledTimes(1);
  });

  it("is refused when its membership is another salon's", async () => {
    getDb.mockResolvedValue(database(new Map<unknown, any[]>([[memberships, [{ tenantId: 1 }]]])));
    await expect(processConnectedStripeEvent(event({ tenant_id: "7", membership_id: "9" }))).resolves.toMatchObject({ ignored: true });
    expect(processStripeEvent).not.toHaveBeenCalled();
  });
});
