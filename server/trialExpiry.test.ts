import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { tenants } from "../drizzle/schema";
import { forgetTrialState } from "./trialState";
import { TRIAL_ENDED_MESSAGE } from "@shared/planEntitlements";

/**
 * A database that answers the tenant lookup with one row and everything
 * else with nothing.
 *
 * Dispatching on the table rather than on a call counter, because the
 * number of queries a procedure makes is not this test's business — an
 * earlier version counted calls and broke the moment a procedure did one
 * extra read.
 */
function databaseWithTenant(row: Record<string, unknown>) {
  const make = (table?: unknown) => {
    const rows = () => (table === tenants ? [row] : []);
    const chain: any = {
      from: (t: unknown) => make(t),
      where: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: () => Promise.resolve(rows()),
      then: (res: (v: unknown[]) => unknown, rej?: (r: unknown) => unknown) =>
        Promise.resolve(rows()).then(res, rej),
    };
    return chain;
  };
  return { select: vi.fn(() => make()) };
}

/** Everything works except the tenant row: a transient fault, not an outage. */
function databaseWhereTenantLookupFails() {
  const make = (table?: unknown) => {
    const rows = () =>
      table === tenants
        ? Promise.reject(new Error("connection reset"))
        : Promise.resolve([]);
    const chain: any = {
      from: (t: unknown) => make(t),
      where: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: () => rows(),
      then: (res: any, rej?: any) => rows().then(res, rej),
    };
    return chain;
  };
  return { select: vi.fn(() => make()) };
}

/** No tenant row at all — anything before the tenant backfill. */
function databaseWithNoTenant() {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => Promise.resolve([]),
    then: (res: any, rej?: any) => Promise.resolve([]).then(res, rej),
  };
  return { select: vi.fn(() => chain) };
}

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
const NEXT_WEEK = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const admin = { id: 1, role: "admin" } as any;
const staff = { id: 2, role: "staff" } as any;
const caller = (user: any = admin) =>
  appRouter.createCaller({ user, tenantId: 1 } as any);

beforeEach(() => {
  forgetTrialState();
  vi.clearAllMocks();
});

describe("a trial that has run out", () => {
  it("closes the product", async () => {
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: YESTERDAY,
      })
    );
    await expect(caller().sidebarCounts.get()).rejects.toThrow(
      TRIAL_ENDED_MESSAGE
    );
  });

  it("closes it for a groomer too, not only the owner", async () => {
    // operationalProcedure is the salon-floor surface. If it stayed open,
    // the whole business could keep running on a groomer's login.
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: YESTERDAY,
      })
    );
    await expect(caller(staff).sidebarCounts.get()).rejects.toThrow(
      TRIAL_ENDED_MESSAGE
    );
  });

  it("still tells them what happened", async () => {
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: YESTERDAY,
      })
    );
    const state = await caller().trial.get();
    expect(state.ended).toBe(true);
    expect(state.show).toBe(true);
    expect(state.daysLeft).toBe(0);
  });

  it("still lets them take their client list with them", async () => {
    // The product stops; the data does not. A salon locked out of the app
    // must still be able to walk away with what it put in.
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: YESTERDAY,
      })
    );
    await expect(
      caller().clients.exportCsv({ tenantId: 1 })
    ).resolves.toBeDefined();
  });
});

describe("a trial that is still running", () => {
  it("does not get in the way", async () => {
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: NEXT_WEEK,
      })
    );
    await expect(caller().sidebarCounts.get()).resolves.toBeDefined();
  });

  it("reports the days left, floored", async () => {
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: NEXT_WEEK,
      })
    );
    const state = await caller().trial.get();
    expect(state.ended).toBe(false);
    expect(state.daysLeft).toBe(6); // 7 days minus the moment this test took
    expect(state.show).toBe(true);
  });
});

describe("Barkin' Beautiful", () => {
  it("is never locked out, whatever the date says", async () => {
    // billing_exempt = 1. The salon whose concept this is does not pay and
    // must not be switchable off by a stray date in a column.
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 1,
        trialEndsAt: YESTERDAY,
      })
    );
    await expect(caller().sidebarCounts.get()).resolves.toBeDefined();
  });

  it("is shown no banner at all", async () => {
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 1,
        trialEndsAt: YESTERDAY,
      })
    );
    expect((await caller().trial.get()).show).toBe(false);
  });

  it("is unaffected with no trial date set, which is its real state", async () => {
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 1,
        trialEndsAt: null,
      })
    );
    await expect(caller().sidebarCounts.get()).resolves.toBeDefined();
    expect((await caller().trial.get()).show).toBe(false);
  });
});

describe("the check fails open", () => {
  it("lets the salon work when the tenant lookup throws", async () => {
    // A database hiccup must never be the reason a salon cannot open its
    // diary. Refusing on error would turn a transient fault into a
    // salon-wide outage on a Saturday morning. Only the trial lookup fails
    // here — the rest of the database is fine, which is the shape of a
    // real transient fault.
    getDb.mockResolvedValue(databaseWhereTenantLookupFails());
    await expect(caller().sidebarCounts.get()).resolves.toBeDefined();
  });

  it("lets the salon work when there is no such tenant row", async () => {
    getDb.mockResolvedValue(databaseWithNoTenant());
    await expect(caller().sidebarCounts.get()).resolves.toBeDefined();
  });

  it("does not run the lookup for a caller with no tenant", async () => {
    // The orphaned account. It has other guards; this one must not fire.
    getDb.mockResolvedValue(
      databaseWithTenant({
        subscriptionPlan: "trial",
        subscriptionStatus: "active",
        billingExempt: 0,
        trialEndsAt: YESTERDAY,
      })
    );
    const orphan = appRouter.createCaller({
      user: admin,
      tenantId: null,
    } as any);
    await expect(orphan.sidebarCounts.get()).resolves.toBeDefined();
  });
});
