import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { NOT_SALON_OWNER } from "./tenantOwner";

/** A database whose staff lookup returns the given salon role. */
function dbWithStaffRole(role: string | null) {
  const staffRow = role === null ? [] : [{ role }];
  const chain = (rows: any[]): any => ({
    from: () => chain(rows), where: () => chain(rows), innerJoin: () => chain(rows),
    leftJoin: () => chain(rows), orderBy: () => chain(rows), groupBy: () => chain(rows),
    limit: () => Promise.resolve(rows),
    then: (res: any, rej?: any) => Promise.resolve(rows).then(res, rej),
  });
  const update = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{}]) }) }));
  return { select: vi.fn(() => chain(staffRow)), update };
}

const LAUREN = { id: 1, role: "admin", email: "barkinbeautiful@hotmail.com.au" } as any;
const MEGS = { id: 105570008, role: "admin", email: "mmfox88@hotmail.com" } as any;
const caller = (user: any) => appRouter.createCaller({ user, tenantId: 1 } as any);

beforeEach(() => vi.clearAllMocks());

describe("who may change the salon's SMS number", () => {
  it("lets a platform administrator", async () => {
    getDb.mockResolvedValue(dbWithStaffRole(null));
    await expect(caller(LAUREN).settings.setSmsNumber({ number: "+61412345678" })).resolves.toBeDefined();
  });

  it("lets the salon's own owner, who is not on any hardcoded list", async () => {
    // The point: a second salon's owner must be able to set the number
    // their texts send from, or they cannot send texts at all.
    getDb.mockResolvedValue(dbWithStaffRole("owner"));
    const otherSalonOwner = { id: 999, role: "user", email: "owner@othersalon.com.au" } as any;
    await expect(caller(otherSalonOwner).settings.setSmsNumber({ number: "+61412345678" })).resolves.toBeDefined();
  });

  it("refuses a groomer who happens to hold users.role = admin", async () => {
    // Six of the eight users here are admins, four of them groomers, so
    // role proves nothing. The salon role is what counts.
    getDb.mockResolvedValue(dbWithStaffRole("groomer"));
    await expect(caller(MEGS).settings.setSmsNumber({ number: "+61412345678" }))
      .rejects.toThrow(NOT_SALON_OWNER);
  });

  it("refuses somebody with no staff record at this salon", async () => {
    getDb.mockResolvedValue(dbWithStaffRole(null));
    const stranger = { id: 4242, role: "user", email: "nobody@example.com" } as any;
    await expect(caller(stranger).settings.setSmsNumber({ number: "+61412345678" }))
      .rejects.toThrow(NOT_SALON_OWNER);
  });
});

describe("what it will accept", () => {
  it("refuses the exact value that broke the salon's SMS", async () => {
    // tenants.twilio_number held "+61..." on 06/10/2026 and every outbound
    // message failed for a day and a half.
    getDb.mockResolvedValue(dbWithStaffRole("owner"));
    await expect(caller(LAUREN).settings.setSmsNumber({ number: "+61..." }))
      .rejects.toThrow(/not a number Twilio can send from/i);
  });

  it("refuses a mobile typed the Australian way", async () => {
    getDb.mockResolvedValue(dbWithStaffRole("owner"));
    await expect(caller(LAUREN).settings.setSmsNumber({ number: "0412 345 678" }))
      .rejects.toThrow(/not a number Twilio can send from/i);
  });

  it("accepts clearing it, which goes back to the shared number", async () => {
    getDb.mockResolvedValue(dbWithStaffRole("owner"));
    await expect(caller(LAUREN).settings.setSmsNumber({ number: null })).resolves.toEqual({ success: true, number: null });
    await expect(caller(LAUREN).settings.setSmsNumber({ number: "" })).resolves.toEqual({ success: true, number: null });
  });
});

describe("reading it", () => {
  it("tells a non-owner nothing, rather than erroring at them", async () => {
    // The Settings page just does not render the card.
    getDb.mockResolvedValue(dbWithStaffRole("groomer"));
    const result = await caller(MEGS).settings.getSmsNumber({});
    expect(result.canEdit).toBe(false);
    expect(result.number).toBeNull();
  });
});
