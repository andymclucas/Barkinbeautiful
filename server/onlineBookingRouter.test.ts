import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";

function queuedDatabase(results: unknown[][]) {
  return {
    select: vi.fn(() => {
      const result = results.shift() ?? [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(result),
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    }),
  };
}

describe("online booking shared bathing capacity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T00:00:00.000Z"));
    getDb.mockReset();
  });

  it("rejects a bath-only request when overlapping grooms exhaust shared bath stations", async () => {
    getDb.mockResolvedValue(queuedDatabase([
      [{ enabled: true, bathLimit: 3, bathCapacity: 2, leadHours: 0 }],
      [{ onlineBookable: true, isActive: true, slotLimit: 1, dailyLimit: 0, services: null }],
      [],
      [],
      [
        { serviceType: "classic_groom", scheduledStart: new Date("2026-08-12T00:00:00.000Z") },
        { serviceType: "deshed", scheduledStart: new Date("2026-08-12T00:30:00.000Z") },
      ],
    ]));
    const caller = appRouter.createCaller({ user: { id: 1, role: "admin" } } as any);
    await expect(caller.onlineBooking.validateSlot({
      tenantId: 1,
      staffId: 7,
      serviceType: "bath_only",
      petWeightKg: 8,
      scheduledStart: new Date("2026-08-12T00:30:00.000Z"),
    })).resolves.toMatchObject({ available: false, reason: "All bathing stations are occupied for that time" });
  });

  it("keeps public booking unavailable when the database returns the disabled tenant flag as a string", async () => {
    getDb.mockResolvedValue(queuedDatabase([
      [{ enabled: "0", bathLimit: 3, bathCapacity: 2, leadHours: 0 }],
    ]));
    const caller = appRouter.createCaller({} as any);
    await expect(caller.onlineBooking.validateSlot({
      tenantId: 1,
      staffId: 7,
      serviceType: "classic_groom",
      petWeightKg: 8,
      scheduledStart: new Date("2026-08-12T00:30:00.000Z"),
    })).resolves.toMatchObject({ available: false, reason: "Online booking is not enabled yet" });
  });
});
