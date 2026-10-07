import { describe, expect, it, vi, beforeEach } from "vitest";
import { withoutRevenueTarget } from "@shared/staffRecord";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";

describe("stripping the target off a staff record", () => {
  it("removes both fields and keeps everything else", () => {
    const stripped = withoutRevenueTarget({
      id: 2, name: "Megs Graham", role: "groomer",
      revenueTarget: "2000.00", revenueTargetPeriod: "weekly",
    });
    expect(stripped).toEqual({ id: 2, name: "Megs Graham", role: "groomer" });
    expect("revenueTarget" in stripped).toBe(false);
    expect("revenueTargetPeriod" in stripped).toBe(false);
  });

  it("copes with a record that never had them", () => {
    expect(withoutRevenueTarget({ id: 2, name: "Megs" })).toEqual({ id: 2, name: "Megs" });
  });

  it("copes with nothing at all", () => {
    expect(withoutRevenueTarget(null)).toBeNull();
    expect(withoutRevenueTarget(undefined)).toBeNull();
  });
});

/**
 * The leak this closes: `db.select().from(staff)` names every column
 * declared in schema.ts, so adding revenue_target put it into two responses
 * that spread the whole row.
 */
function databaseReturningStaffRow() {
  const row = {
    id: 2, tenantId: 1, userId: 105570008, name: "Megs Graham", role: "groomer",
    portalStatus: "approved", isActive: true,
    revenueTarget: "2000.00", revenueTargetPeriod: "weekly",
  };
  const chain: any = {
    from: () => chain, where: () => chain, innerJoin: () => chain, leftJoin: () => chain,
    orderBy: () => chain, groupBy: () => chain, limit: () => Promise.resolve([row]),
    then: (res: (v: unknown[]) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve([row]).then(res, rej),
  };
  return {
    select: vi.fn(() => chain),
    execute: vi.fn(() => Promise.resolve([[{}]])),
  };
}

const CHARLOTTE = { id: 105840001, role: "admin", email: "charlottepurcell18@gmail.com" } as any;

beforeEach(() => vi.clearAllMocks());

describe("a groomer with an admin account", () => {
  it("cannot read a revenue target from the staff profile", async () => {
    // Charlotte holds users.role = "admin" because that is how she was given
    // the salon floor. adminProcedure lets her open staff.getProfile; what
    // comes back must not include anyone's target.
    getDb.mockResolvedValue(databaseReturningStaffRow());
    const caller = appRouter.createCaller({ user: CHARLOTTE, tenantId: 1 } as any);

    // No try/catch: a test that can silently skip its own assertion is
    // worth nothing. Verified against the unfixed code, this response
    // carried revenueTarget and revenueTargetPeriod.
    const profile: any = await caller.staff.getProfile({ staffId: 2 });
    expect(profile).toBeTruthy();
    expect(Object.keys(profile)).not.toContain("revenueTarget");
    expect(profile.revenueTarget).toBeUndefined();
    expect(profile.revenueTargetPeriod).toBeUndefined();
    expect(JSON.stringify(profile)).not.toContain("2000.00");
  });
});
