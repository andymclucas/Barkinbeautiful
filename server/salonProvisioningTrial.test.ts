import { describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { provisionSalon } from "./salonProvisioning";
import { tenants } from "../drizzle/schema";
import { TRIAL_DAYS, trialHasEnded } from "@shared/planEntitlements";

/** Records what is inserted; every lookup comes back empty. */
function database() {
  const inserts: Array<{ table: unknown; values: any }> = [];
  const chain: any = {
    from: () => chain, where: () => chain, limit: () => Promise.resolve([]),
    then: (res: any, rej?: any) => Promise.resolve([]).then(res, rej),
  };
  return {
    inserts,
    db: {
      select: () => chain,
      insert: (table: unknown) => ({
        values: async (values: any) => { inserts.push({ table, values }); return [{ insertId: 42 }]; },
      }),
      delete: () => ({ where: async () => {} }),
    },
  };
}

describe("a salon an administrator sets up", () => {
  it("gets the same seven-day trial as one that signs itself up", async () => {
    /*
     * It used to get a trial with no end date: plan "trial" is every
     * feature, and with no date nothing ever asks for a plan. "A trial
     * that never ends is not a trial" — 1468e50.
     */
    const d = database();
    getDb.mockResolvedValue(d.db);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const before = Date.now();

    const result = await provisionSalon({
      name: "The Pet Pad", timezone: "Australia/Brisbane", ownerUserId: 5, ownerName: "Lauren",
      choice: { copyFromTenantId: null, catalogues: [] }, grantedByUserId: 1,
    });

    expect(result.tenantId).toBe(42);
    const salon = d.inserts.find((i) => i.table === tenants)!.values;
    expect(salon).toMatchObject({ subscriptionPlan: "trial", subscriptionStatus: "trialing" });
    expect(salon.trialEndsAt).toBeInstanceOf(Date);
    const days = (salon.trialEndsAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThanOrEqual(TRIAL_DAYS);
    expect(days).toBeLessThan(TRIAL_DAYS + 0.01);

    // Running today, over once the seven days are up.
    expect(trialHasEnded(salon, new Date(before))).toBe(false);
    expect(trialHasEnded(salon, new Date(before + (TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000))).toBe(true);
  });
});
