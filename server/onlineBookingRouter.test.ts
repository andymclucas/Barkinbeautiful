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
      [], // staff_blockouts — this groomer is not on leave that day
      [], // the groomer's own appointments
      [], // bath-only bookings against the daily limit
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

  it("refuses a booking on a groomer's blocked-out day, and says why", async () => {
    // Until blockouts were wired into this check, staff_blockouts was read
    // by nothing but its own list endpoint: the calendar drew red hatching
    // over a groomer on annual leave and online booking filled her day.
    getDb.mockResolvedValue(queuedDatabase([
      [{ enabled: true, bathLimit: 3, bathCapacity: 2, leadHours: 0 }],
      [{ onlineBookable: true, isActive: true, slotLimit: 1, dailyLimit: 0, services: null }],
      [{ staffId: 7, blockoutDate: new Date("2026-08-12T00:00:00.000Z"), isFullDay: true, startTime: null, endTime: null, reason: "Annual leave" }],
    ]));
    const caller = appRouter.createCaller({ user: { id: 1, role: "admin" } } as any);
    await expect(caller.onlineBooking.validateSlot({
      tenantId: 1, staffId: 7, serviceType: "classic_groom", petWeightKg: 8,
      scheduledStart: new Date("2026-08-12T00:30:00.000Z"),
    })).resolves.toMatchObject({
      available: false,
      reason: "This groomer is unavailable that day (Annual leave)",
    });
  });

  it("lets a booking through outside a partial blockout", async () => {
    // A 09:00-12:00 blockout must not close the afternoon. The booking
    // below is 14:30 Brisbane.
    getDb.mockResolvedValue(queuedDatabase([
      [{ enabled: true, bathLimit: 3, bathCapacity: 2, leadHours: 0 }],
      [{ onlineBookable: true, isActive: true, slotLimit: 1, dailyLimit: 0, services: null }],
      [{ staffId: 7, blockoutDate: new Date("2026-08-12T00:00:00.000Z"), isFullDay: false, startTime: "09:00", endTime: "12:00", reason: "Personal leave" }],
      [], // no other appointments
    ]));
    const caller = appRouter.createCaller({ user: { id: 1, role: "admin" } } as any);
    await expect(caller.onlineBooking.validateSlot({
      tenantId: 1, staffId: 7, serviceType: "classic_groom", petWeightKg: 8,
      scheduledStart: new Date("2026-08-12T04:30:00.000Z"),
    })).resolves.toMatchObject({ available: true });
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
