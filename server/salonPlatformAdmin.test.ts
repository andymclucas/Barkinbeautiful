import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { membershipPlans, petCodes, pricingServices, retailProducts, tenants } from "../drizzle/schema";
import { isPlatformAdmin, PLATFORM_HOME_TENANT_ID } from "@shared/salonAccess";
import { planCatalogueCopy } from "@shared/salonProvisioning";
import { forgetTrialState } from "./trialState";

describe("who runs the platform", () => {
  it("is an admin who can act in Groomigo's home salon", () => {
    expect(isPlatformAdmin({ role: "admin", accessibleTenantIds: [PLATFORM_HOME_TENANT_ID] })).toBe(true);
    // Lauren: home salon plus a second one, whichever she is switched into.
    expect(isPlatformAdmin({ role: "admin", accessibleTenantIds: [7, 1] })).toBe(true);
  });

  it("is NOT the owner of a salon that signed itself up", () => {
    /*
     * The hole this closes. Public sign-up makes the new owner an admin
     * of their own salon; the set-up tools used to trust any admin.
     */
    expect(isPlatformAdmin({ role: "admin", accessibleTenantIds: [7] })).toBe(false);
    expect(isPlatformAdmin({ role: "admin", accessibleTenantIds: [] })).toBe(false);
  });

  it("is never somebody who is not an admin at all", () => {
    for (const role of ["user", "staff", null, undefined, "ADMIN"]) {
      expect(isPlatformAdmin({ role, accessibleTenantIds: [1] }), String(role)).toBe(false);
    }
  });
});

describe("copying lists into a salon that already exists", () => {
  it("copies what the salon does not have yet", () => {
    expect(planCatalogueCopy(["pricing", "petCodes"], {})).toEqual({ copy: ["pricing", "petCodes"], skip: [] });
    expect(planCatalogueCopy(["pricing"], { pricing: 0 })).toEqual({ copy: ["pricing"], skip: [] });
  });

  it("leaves alone any list the salon already has rows in", () => {
    // Twice would double every service; over an edited list would bury
    // the owner's own prices.
    expect(planCatalogueCopy(["pricing", "retail", "petCodes"], { pricing: 60, petCodes: 1 }))
      .toEqual({ copy: ["retail"], skip: ["pricing", "petCodes"] });
  });

  it("ignores repeats and anything that is not a list", () => {
    expect(planCatalogueCopy(["pricing", "pricing"], {})).toEqual({ copy: ["pricing"], skip: [] });
    expect(planCatalogueCopy(["clients" as never, "retail"], {})).toEqual({ copy: ["retail"], skip: [] });
  });
});

/** A database holding a few rows per table per salon, recording inserts. */
function database(rowsByTable: Map<unknown, Array<Record<string, unknown>>>) {
  const inserts: Array<{ table: unknown; values: any }> = [];
  const make = (table?: unknown): any => {
    // The fake cannot read a WHERE, so each table holds ONE salon's rows:
    // the source's for the catalogues, and whatever the test seeds.
    const rows = () => rowsByTable.get(table) ?? [];
    const chain: any = {
      from: (t: unknown) => make(t), where: () => chain, orderBy: () => chain,
      limit: (n: number) => Promise.resolve(rows().slice(0, n)),
      then: (res: any, rej?: any) => Promise.resolve(rows()).then(res, rej),
    };
    return chain;
  };
  return {
    inserts,
    db: {
      select: () => make(),
      insert: (table: unknown) => ({
        values: async (values: any) => { inserts.push({ table, values }); return [{ insertId: 99 }]; },
      }),
      delete: () => ({ where: async () => {} }),
      execute: async () => [[{ n: 3 }]],
    },
  };
}

const NOT_EXPIRED = { billingExempt: 1, trialEndsAt: null, id: 1, name: "Barkin' Beautiful", slug: "barkin" };
const caller = (accessibleTenantIds: number[], tenantId: number, role = "admin") =>
  appRouter.createCaller({ user: { id: 5, role }, tenantId, accessibleTenantIds } as any);
/** Andy or Lauren. */
const platform = () => caller([1, 7], 1);
/** The owner of a salon that came through the public sign-up page. */
const stranger = () => caller([7], 7);

beforeEach(() => {
  forgetTrialState();
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("the salon set-up tools", () => {
  const REFUSED = /Only Groomigo's own administrators/;

  it("are refused to the owner of a self-signed-up salon, every one of them", async () => {
    const d = database(new Map([[tenants, [NOT_EXPIRED]]]));
    getDb.mockResolvedValue(d.db);
    const s = stranger();
    await expect(s.salons.eligibleOwners({ query: "lauren" })).rejects.toThrow(REFUSED);
    await expect(s.salons.all()).rejects.toThrow(REFUSED);
    await expect(s.salons.provisionPreview({ salonName: "Copycat", copyFromTenantId: 1, catalogues: ["pricing"] }))
      .rejects.toThrow(REFUSED);
    await expect(s.salons.provision({
      salonName: "Copycat", timezone: "Australia/Brisbane", ownerUserId: 5, ownerName: "Me",
      copyFromTenantId: 1, catalogues: ["pricing", "membershipPlans"],
    })).rejects.toThrow(REFUSED);
    await expect(s.salons.copyCatalogues({ fromTenantId: 1, toTenantId: 7, catalogues: ["pricing"] }))
      .rejects.toThrow(REFUSED);
    // And nothing was written on the way to being refused.
    expect(d.inserts).toEqual([]);
  });

  it("are not shown to them either", async () => {
    getDb.mockResolvedValue(database(new Map([[tenants, [NOT_EXPIRED]]])).db);
    expect((await stranger().salons.mine()).canManageSalons).toBe(false);
    expect((await platform().salons.mine()).canManageSalons).toBe(true);
  });

  it("will not copy out of a salon the caller cannot open", async () => {
    // A platform administrator, but salon 9 is not one of theirs.
    getDb.mockResolvedValue(database(new Map([[tenants, [NOT_EXPIRED]]])).db);
    await expect(platform().salons.copyCatalogues({ fromTenantId: 9, toTenantId: 7, catalogues: ["pricing"] }))
      .rejects.toThrow(/only copy from a salon you have access to/);
    await expect(platform().salons.provisionPreview({ salonName: "X", copyFromTenantId: 9, catalogues: ["pricing"] }))
      .rejects.toThrow(/only copy from a salon you have access to/);
  });
});

describe("salons.copyCatalogues", () => {
  it("copies the chosen lists in, re-homed to the target salon and nothing else", async () => {
    const d = database(new Map<unknown, Array<Record<string, unknown>>>([
      [tenants, [NOT_EXPIRED]],
    ]));
    // The target has nothing (limit(1) existence check), then the source read returns rows.
    let pricingReads = 0;
    const source = [
      { id: 11, tenantId: 1, name: "Full groom", createdAt: new Date(0), updatedAt: new Date(0) },
      { id: 12, tenantId: 1, name: "Wash and tidy", createdAt: new Date(0), updatedAt: new Date(0) },
    ];
    const realSelect = d.db.select;
    d.db.select = (() => {
      const chain: any = realSelect();
      const from = chain.from;
      chain.from = (t: unknown) => {
        if (t !== pricingServices) return from(t);
        pricingReads += 1;
        const rows = pricingReads === 1 ? [] : source; // 1st: does the target have any? 2nd: the source's rows
        const c: any = {
          where: () => c, limit: () => Promise.resolve(rows.slice(0, 1)),
          then: (res: any, rej?: any) => Promise.resolve(rows).then(res, rej),
        };
        return c;
      };
      return chain;
    }) as any;
    getDb.mockResolvedValue(d.db);

    const result = await platform().salons.copyCatalogues({ fromTenantId: 1, toTenantId: 7, catalogues: ["pricing"] });

    expect(result).toMatchObject({ success: true, copied: { pricing: 2 }, skipped: [] });
    const written = d.inserts.filter((i) => i.table === pricingServices);
    expect(written).toHaveLength(1);
    expect(written[0].values).toEqual([
      { tenantId: 7, name: "Full groom" },
      { tenantId: 7, name: "Wash and tidy" },
    ]);
    // Only the catalogue table was written to.
    expect(d.inserts.every((i) => i.table === pricingServices)).toBe(true);
  });

  it("skips a list the salon already has, and says so", async () => {
    const d = database(new Map<unknown, Array<Record<string, unknown>>>([
      [tenants, [NOT_EXPIRED]],
      [retailProducts, [{ id: 3, tenantId: 7, name: "Their own shampoo" }]],
      [petCodes, []],
      [membershipPlans, []],
    ]));
    getDb.mockResolvedValue(d.db);
    const result = await platform().salons.copyCatalogues({ fromTenantId: 1, toTenantId: 7, catalogues: ["retail"] });
    expect(result).toMatchObject({ copied: {}, skipped: ["retail"] });
    expect(d.inserts).toEqual([]);
  });

  it("refuses to copy a salon into itself", async () => {
    getDb.mockResolvedValue(database(new Map([[tenants, [NOT_EXPIRED]]])).db);
    await expect(platform().salons.copyCatalogues({ fromTenantId: 1, toTenantId: 1, catalogues: ["pricing"] }))
      .rejects.toThrow(/cannot be copied into itself/);
  });
});
