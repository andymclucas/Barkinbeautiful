import { describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { CROSS_TENANT_MESSAGE } from "@shared/tenantResolution";

/** A database that answers every query with nothing. */
function emptyDatabase() {
  const chain: any = {
    from: () => chain, where: () => chain, innerJoin: () => chain, leftJoin: () => chain,
    orderBy: () => chain, limit: () => Promise.resolve([]),
    then: (res: (v: unknown[]) => unknown, rej?: (r: unknown) => unknown) => Promise.resolve([]).then(res, rej),
  };
  return { select: vi.fn(() => chain) };
}

const admin = { id: 1, role: "admin" } as any;

describe("a caller cannot ask about another salon", () => {
  it("refuses a tenantId that is not the caller's own", async () => {
    // The breach this closes: every real user is an admin, and the old
    // guard (requireApprovedStaffTenant) returns null for admins — so
    // with a second salon on the system, its clients, pets and invoices
    // were readable by editing one number in a request.
    getDb.mockResolvedValue(emptyDatabase());
    const caller = appRouter.createCaller({ user: admin, tenantId: 1 } as any);
    await expect(caller.sidebarCounts.get({ tenantId: 2 })).rejects.toThrow(CROSS_TENANT_MESSAGE);
  });

  it("allows the caller's own salon", async () => {
    getDb.mockResolvedValue(emptyDatabase());
    const caller = appRouter.createCaller({ user: admin, tenantId: 1 } as any);
    await expect(caller.sidebarCounts.get({ tenantId: 1 })).resolves.toBeDefined();
  });

  it("allows a request that names no salon", async () => {
    getDb.mockResolvedValue(emptyDatabase());
    const caller = appRouter.createCaller({ user: admin, tenantId: 1 } as any);
    await expect(caller.sidebarCounts.get()).resolves.toBeDefined();
  });

  it("does not break a caller whose tenant could not be resolved", async () => {
    // The orphaned account, and anything before the backfill. Locking
    // these out would be worse than the status quo, and they are still
    // subject to every other permission check.
    getDb.mockResolvedValue(emptyDatabase());
    const caller = appRouter.createCaller({ user: admin, tenantId: null } as any);
    await expect(caller.sidebarCounts.get({ tenantId: 1 })).resolves.toBeDefined();
  });

  it("refuses across several different procedures, not just one", async () => {
    getDb.mockResolvedValue(emptyDatabase());
    const caller = appRouter.createCaller({ user: admin, tenantId: 1 } as any);
    await expect(caller.staff.listBlockouts({ tenantId: 7, dateFrom: "2026-10-01", dateTo: "2026-10-31" }))
      .rejects.toThrow(CROSS_TENANT_MESSAGE);
    await expect(caller.appointmentAddOns.catalogue({ tenantId: 7 }))
      .rejects.toThrow(CROSS_TENANT_MESSAGE);
  });
});
