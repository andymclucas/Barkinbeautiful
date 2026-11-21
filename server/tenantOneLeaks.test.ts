/**
 * Procedures that read or wrote Barkin' Beautiful's rows (tenant 1) for
 * every caller, whatever salon they were in.
 *
 * Harmless with one salon. Since the public sign-up page makes each new
 * owner an admin of their own salon, it meant any of them could read a
 * Barkin' Beautiful client's name, email, phone and address through the
 * portal preview. Each test here is a caller in salon 7 and checks the
 * query went to salon 7.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { appRouter } from "./routers";
import { requireCallerTenant } from "./_core/trpc";
import { appointments, clients, groomingReports, groomStylePresets, pets, tenants } from "../drizzle/schema";
import { forgetTrialState } from "./trialState";

const dialect = new MySqlDialect();
const paramsOf = (cond: SQL | undefined) => (cond ? dialect.sqlToQuery(cond).params : []);

/** A database that records every WHERE and insert, and answers from fixed rows per table. */
function database(rowsByTable: Map<unknown, Array<Record<string, unknown>>> = new Map()) {
  const wheres: Array<{ table: unknown; params: unknown[] }> = [];
  const inserts: Array<{ table: unknown; values: any }> = [];
  const make = (table?: unknown): any => {
    const rows = () => rowsByTable.get(table) ?? [];
    const chain: any = {
      from: (t: unknown) => make(t),
      innerJoin: () => chain, leftJoin: () => chain, orderBy: () => chain,
      where: (cond: SQL | undefined) => { wheres.push({ table, params: paramsOf(cond) }); return chain; },
      limit: (n: number) => Promise.resolve(rows().slice(0, n)),
      then: (res: any, rej?: any) => Promise.resolve(rows()).then(res, rej),
    };
    return chain;
  };
  return {
    wheres, inserts,
    db: {
      select: () => make(),
      insert: (table: unknown) => ({
        values: async (values: any) => { inserts.push({ table, values }); return [{ insertId: 1 }]; },
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    },
  };
}

const SALON_7 = { id: 7, billingExempt: 1, trialEndsAt: null, name: "Barkin Beautiful Barber", slug: "barber" };
/** The owner of a salon that signed itself up: an admin, of salon 7 only. */
const owner = () => appRouter.createCaller({ user: { id: 5, role: "admin" }, tenantId: 7, accessibleTenantIds: [7] } as any);

beforeEach(() => {
  forgetTrialState();
  vi.clearAllMocks();
});

describe("requireCallerTenant", () => {
  it("is the salon the caller is acting in", () => {
    expect(requireCallerTenant({ tenantId: 7 })).toBe(7);
  });

  it("never falls back to Barkin' Beautiful for a caller with no salon", () => {
    expect(() => requireCallerTenant({ tenantId: null })).toThrow(/not linked to a salon/);
    expect(() => requireCallerTenant({})).toThrow(/not linked to a salon/);
  });
});

describe("a salon owner reaches their own salon's rows, not Barkin' Beautiful's", () => {
  it("portal preview looks the client up in the caller's salon", async () => {
    const d = database(new Map([[tenants, [SALON_7]]]));
    getDb.mockResolvedValue(d.db);
    // A Barkin' Beautiful client's id: not found from salon 7.
    await expect(owner().clientPortal.previewPortal({ clientId: 42 })).rejects.toThrow(/Client not found/);
    const lookup = d.wheres.find((w) => w.table === clients);
    expect(lookup?.params).toEqual([42, 7]);
  });

  it("groom style presets are listed from the caller's salon", async () => {
    const d = database(new Map([[tenants, [SALON_7]]]));
    getDb.mockResolvedValue(d.db);
    await owner().groomStylePresets.list({});
    expect(d.wheres.find((w) => w.table === groomStylePresets)?.params).toEqual([7]);
  });

  it("a new groom style preset is saved to the caller's salon", async () => {
    const d = database(new Map([[tenants, [SALON_7]]]));
    getDb.mockResolvedValue(d.db);
    await owner().groomStylePresets.create({ name: "Teddy" });
    const saved = d.inserts.find((i) => i.table === groomStylePresets);
    expect(saved?.values.tenantId).toBe(7);
  });

  it("MoeGo pet ids come from the caller's salon", async () => {
    const d = database(new Map([[tenants, [SALON_7]]]));
    getDb.mockResolvedValue(d.db);
    await owner().onlineBooking.listAllMoegoIds();
    expect(d.wheres.find((w) => w.table === pets)?.params).toContain(7);
    expect(d.wheres.find((w) => w.table === pets)?.params).not.toContain(1);
  });

  it("a groom photo is filed under the appointment's salon", async () => {
    const d = database(new Map<unknown, any[]>([
      [tenants, [SALON_7]],
      [appointments, [{ tenantId: 7, petId: 3 }]],
    ]));
    getDb.mockResolvedValue(d.db);
    await owner().groomingReports.attachStaffPhoto({
      appointmentId: 11, petId: 3, position: "before", photoUrl: "u", photoKey: "k",
    });
    const report = d.inserts.find((i) => i.table === groomingReports);
    expect(report?.values.tenantId).toBe(7);
  });

  it("SMS usage is the caller's salon's, whatever the page sends", async () => {
    getDb.mockResolvedValue(database(new Map([[tenants, [SALON_7]]])).db);
    const smsUsage = await import("./smsUsage");
    const spy = vi.spyOn(smsUsage, "getSmsUsage").mockResolvedValue({} as any);
    await owner().smsUsage.get({});
    await owner().smsUsage.get();
    expect(spy.mock.calls.map((c) => c[0])).toEqual([7, 7]);
  });

  it("a groom photo cannot be put on another salon's appointment", async () => {
    const d = database(new Map<unknown, any[]>([
      [tenants, [SALON_7]],
      [appointments, [{ tenantId: 1, petId: 3 }]],
    ]));
    getDb.mockResolvedValue(d.db);
    await expect(owner().groomingReports.attachStaffPhoto({
      appointmentId: 11, petId: 3, position: "after", photoUrl: "u", photoKey: "k",
    })).rejects.toThrow(/Appointment not found/);
    expect(d.inserts.filter((i) => i.table === groomingReports)).toEqual([]);
  });
});
