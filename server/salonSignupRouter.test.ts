import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn(async () => "token") } }));

import { appRouter } from "./routers";

/** A database that records what was inserted and deleted. */
function spyDb(opts: { existingEmail?: boolean; failOnUsers?: boolean; verifiedAt?: Date | null } = {}) {
  const log: Array<{ op: string; table: string }> = [];
  const tableName = (t: any) => String(t?.[Symbol.for("drizzle:Name")] ?? "?");
  const verified = opts.verifiedAt === undefined ? new Date() : opts.verifiedAt;

  // Dispatch on the TABLE, not a call counter: a counter breaks the
  // moment a test creates more than one salon from the same mock.
  const rowsFor = (table: string): unknown[] => {
    if (table === "signup_verifications") return verified ? [{ id: 5, verifiedAt: verified }] : [];
    if (table === "users") return opts.existingEmail ? [{ id: 1 }] : [];
    return [];
  };

  const chain = () => {
    const c: any = {
      _t: "?",
      from: (t: any) => { c._t = tableName(t); return c; },
      where: () => c,
      limit: () => Promise.resolve(rowsFor(c._t)),
      then: (res: (v: unknown[]) => unknown, rej?: any) => Promise.resolve(rowsFor(c._t)).then(res, rej),
    };
    return c;
  };

  return {
    log,
    select: vi.fn(() => chain()),
    insert: vi.fn((t: any) => ({
      values: async () => {
        const name = tableName(t);
        log.push({ op: "insert", table: name });
        if (name === "users" && opts.failOnUsers) throw new Error("boom");
        return [{ insertId: name === "tenants" ? 77 : 88 }];
      },
      onDuplicateKeyUpdate: async () => undefined,
    })),
    delete: vi.fn((t: any) => ({
      where: async () => { log.push({ op: "delete", table: tableName(t) }); return undefined; },
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  };
}

const ctx = () => ({
  user: null, tenantId: null,
  req: { ip: `10.0.0.${Math.floor(Math.random() * 250)}`, socket: {}, headers: {}, secure: true },
  res: { cookie: vi.fn() },
}) as any;

const good = {
  salonName: "Paws & Whiskers", ownerName: "Jo Harding",
  email: "jo@example.com", password: "three brown spaniels",
};

beforeEach(() => { getDb.mockReset(); });

describe("creating a salon", () => {
  it("creates the salon, the owner and their staff record", async () => {
    const db = spyDb();
    getDb.mockResolvedValue(db);
    const r: any = await appRouter.createCaller(ctx()).salonSignup.create(good);
    expect(r.success).toBe(true);
    expect(r.slug).toBe("paws-and-whiskers");
    expect(db.log.map(l => `${l.op} ${l.table}`)).toEqual([
      "insert tenants", "insert users", "insert staff", "delete signup_verifications",
    ]);
  });

  it("removes the salon again if the owner cannot be created", async () => {
    // The guard that matters. A tenant with no owner can never be signed
    // into and would sit there holding its slug forever.
    const db = spyDb({ failOnUsers: true });
    getDb.mockResolvedValue(db);
    await expect(appRouter.createCaller(ctx()).salonSignup.create(good))
      .rejects.toThrow(/could not finish setting up/i);
    expect(db.log.map(l => `${l.op} ${l.table}`)).toEqual([
      "insert tenants", "insert users", "delete tenants",
    ]);
  });

  it("refuses an email that already has an account, and says so plainly", async () => {
    // A vague failure here leaves somebody retyping a password that was
    // never the problem.
    getDb.mockResolvedValue(spyDb({ existingEmail: true }));
    await expect(appRouter.createCaller(ctx()).salonSignup.create(good))
      .rejects.toThrow(/already an account with that email/i);
  });

  it("refuses a password anybody would guess, before touching the database", async () => {
    const db = spyDb();
    getDb.mockResolvedValue(db);
    await expect(appRouter.createCaller(ctx()).salonSignup.create({ ...good, password: "Password1234" }))
      .rejects.toThrow(/first passwords anyone would guess/i);
    expect(db.log).toHaveLength(0);
  });

  it("refuses a name that is only punctuation", async () => {
    getDb.mockResolvedValue(spyDb());
    await expect(appRouter.createCaller(ctx()).salonSignup.create({ ...good, salonName: "!!!" }))
      .rejects.toThrow(/salon needs a name/i);
  });
});

describe("a flood of signups from one place", () => {
  it("is slowed after a few", async () => {
    getDb.mockResolvedValue(spyDb());
    const fixed = () => ({ ...ctx(), req: { ip: "203.0.113.9", socket: {}, headers: {}, secure: true } });
    for (let i = 0; i < 3; i += 1) {
      await appRouter.createCaller(fixed()).salonSignup.create({ ...good, email: `a${i}@example.com` });
    }
    await expect(appRouter.createCaller(fixed()).salonSignup.create({ ...good, email: "a4@example.com" }))
      .rejects.toThrow(/a lot of salons in one hour/i);
  });
});

describe("an address nobody has proved", () => {
  it("creates nothing at all", async () => {
    // The whole point. Without this, /signup is a way to fill the
    // database with salons nobody asked for.
    const db = spyDb({ verifiedAt: null });
    getDb.mockResolvedValue(db);
    await expect(appRouter.createCaller(ctx()).salonSignup.create(good))
      .rejects.toThrow(/confirm your email address first/i);
    expect(db.log).toHaveLength(0);
  });

  it("refuses a proof that has gone stale", async () => {
    // Thirty minutes. A proven address is a key to making a tenant.
    const db = spyDb({ verifiedAt: new Date(Date.now() - 31 * 60 * 1000) });
    getDb.mockResolvedValue(db);
    await expect(appRouter.createCaller(ctx()).salonSignup.create(good))
      .rejects.toThrow(/confirm your email address first/i);
    expect(db.log).toHaveLength(0);
  });

  it("spends the proof once the salon exists", async () => {
    // One proven address makes one salon, not a supply of them.
    const db = spyDb();
    getDb.mockResolvedValue(db);
    await appRouter.createCaller(ctx()).salonSignup.create(good);
    expect(db.log.some(l => l.op === "delete" && l.table === "signup_verifications")).toBe(true);
  });
});
