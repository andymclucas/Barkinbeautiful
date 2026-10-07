import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { REVENUE_TARGETS_DENIED } from "./routers/revenueTargets";

function emptyDatabase() {
  const chain: any = {
    from: () => chain, where: () => chain, innerJoin: () => chain, leftJoin: () => chain,
    orderBy: () => chain, groupBy: () => chain, limit: () => Promise.resolve([]),
    then: (res: (v: unknown[]) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej),
  };
  return { select: vi.fn(() => chain), update: vi.fn(() => chain) };
}

const RANGE = { from: "2026-10-01", to: "2026-10-07" };

// Lauren and Andy, by the ids shared/staffAdministrators.ts lists.
const LAUREN = { id: 1, role: "admin", email: "barkinbeautiful@hotmail.com.au" } as any;
const ANDY = { id: 30001, role: "admin", email: "mclucas.andy@gmail.com" } as any;

// Everyone else. Note these are ADMINS: six of the eight users here hold
// users.role = "admin" because that was how they were given the salon floor.
const MEGS = { id: 105570008, role: "admin", email: "mmfox88@hotmail.com" } as any;
const CHARLOTTE = { id: 105840001, role: "admin", email: "charlottepurcell18@gmail.com" } as any;
const CHRISTIE = { id: 140370460, role: "admin", email: "noisymummy@gmail.com" } as any;
const RESTRICTED = { id: 999, role: "staff", email: "bather@example.com" } as any;

const caller = (user: any) => appRouter.createCaller({ user, tenantId: 1 } as any);

beforeEach(() => {
  getDb.mockResolvedValue(emptyDatabase());
  vi.clearAllMocks();
});

describe("who may see revenue targets", () => {
  it("lets Lauren and Andy read them", async () => {
    await expect(caller(LAUREN).revenueTargets.list(RANGE)).resolves.toBeDefined();
    await expect(caller(ANDY).revenueTargets.list(RANGE)).resolves.toBeDefined();
  });

  it("refuses every other staff member, admin or not", async () => {
    // The whole point: role cannot separate these people. Megs, Charlotte
    // and Christie are all users.role = "admin", so adminProcedure would
    // have waved all three through to each other's figures.
    for (const user of [MEGS, CHARLOTTE, CHRISTIE]) {
      await expect(caller(user).revenueTargets.list(RANGE)).rejects.toThrow(REVENUE_TARGETS_DENIED);
    }
  });

  it("refuses a restricted staff account", async () => {
    await expect(caller(RESTRICTED).revenueTargets.list(RANGE)).rejects.toThrow();
  });

  it("refuses an unauthenticated caller", async () => {
    const anon = appRouter.createCaller({ user: null, tenantId: 1 } as any);
    await expect(anon.revenueTargets.list(RANGE)).rejects.toThrow();
  });
});

describe("who may change a revenue target", () => {
  const payload = { staffId: 2, amount: 2000, period: "weekly" as const };

  it("refuses every other staff member", async () => {
    for (const user of [MEGS, CHARLOTTE, CHRISTIE]) {
      await expect(caller(user).revenueTargets.set(payload)).rejects.toThrow(REVENUE_TARGETS_DENIED);
    }
  });

  it("writes nothing when it refuses", async () => {
    // The ownership check is the first thing in the handler, so a denied
    // caller never reaches the update. (getDb itself is called earlier by
    // the trial middleware, so the write is what has to be asserted on.)
    const db = emptyDatabase();
    getDb.mockResolvedValue(db);
    await expect(caller(MEGS).revenueTargets.set(payload)).rejects.toThrow(REVENUE_TARGETS_DENIED);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("will not write to a staff member from another salon", async () => {
    // The lookup is scoped to the tenant, so an id from elsewhere finds
    // nothing rather than being updated.
    await expect(caller(LAUREN).revenueTargets.set({ ...payload, staffId: 7777 }))
      .rejects.toThrow("not part of this salon");
  });
});
