import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

// If this is ever reached without a resolved client, the test has found a
// hole: a Stripe setup session would be created for somebody unknown.
const { createCardSetupLink } = vi.hoisted(() => ({ createCardSetupLink: vi.fn() }));
vi.mock("./stripeCards", () => ({
  createCardSetupLink,
  emailCardSetupLink: vi.fn(),
  detachClientCard: vi.fn(),
  startMembershipSubscription: vi.fn(),
  cancelMembershipSubscription: vi.fn(),
  pauseMembershipSubscription: vi.fn(),
  resumeMembershipSubscription: vi.fn(),
  chargeSavedCard: vi.fn(),
  payOpenInvoice: vi.fn(),
}));

import { appRouter } from "./routers";

function emptyDatabase() {
  const chain: any = {
    from: () => chain, where: () => chain, innerJoin: () => chain, leftJoin: () => chain,
    orderBy: () => chain, groupBy: () => chain, limit: () => Promise.resolve([]),
    then: (res: (v: unknown[]) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej),
  };
  return { select: vi.fn(() => chain), update: vi.fn(() => chain), insert: vi.fn(() => chain) };
}

/** A portal caller is unauthenticated: no staff user, just a bare request. */
const portal = () => appRouter.createCaller({
  user: null,
  tenantId: 1,
  req: { headers: {}, cookies: {} },
  res: {},
} as any);

beforeEach(() => {
  getDb.mockResolvedValue(emptyDatabase());
  vi.clearAllMocks();
});

describe("a client asking for their own card page", () => {
  it("takes no client id — it cannot be aimed at another client", () => {
    // The guarantee is structural, not a check inside the handler: with no
    // clientId in the schema there is nothing for a caller to supply.
    const def: any = (appRouter._def.procedures as any)["clientPortal.createMyCardSetupLink"];
    const parsed = def._def.inputs[0].safeParse({ clientId: 99, token: "x".repeat(40) });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ token: "x".repeat(40) });
    expect(parsed.data).not.toHaveProperty("clientId");
  });

  it("refuses a caller with no session and no token", async () => {
    await expect(portal().clientPortal.createMyCardSetupLink({})).rejects.toThrow(/sign in/i);
    expect(createCardSetupLink).not.toHaveBeenCalled();
  });

  it("refuses an unknown token, and creates no Stripe session", async () => {
    await expect(
      portal().clientPortal.createMyCardSetupLink({ token: "n".repeat(40) }),
    ).rejects.toThrow(/invalid or has expired/i);
    expect(createCardSetupLink).not.toHaveBeenCalled();
  });
});

describe("a client reading their own card details", () => {
  it("refuses a caller with no session and no token", async () => {
    await expect(portal().clientPortal.getMyPaymentMethod({})).rejects.toThrow(/sign in/i);
  });

  it("takes no client id either", () => {
    const def: any = (appRouter._def.procedures as any)["clientPortal.getMyPaymentMethod"];
    const parsed = def._def.inputs[0].safeParse({ clientId: 99 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("clientId");
  });
});
