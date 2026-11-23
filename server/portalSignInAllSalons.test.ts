/**
 * The client portal sign-in looks in every salon, not Barkin' Beautiful
 * alone. Until 23/11/2026 all four sign-in paths filtered on tenant 1, so a
 * client of any other salon could never get in.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, sendEmail } = vi.hoisted(() => ({ getDb: vi.fn(), sendEmail: vi.fn() }));
vi.mock("./db", () => ({ getDb }));
vi.mock("./email", () => ({ sendEmail }));

import bcrypt from "bcryptjs";
import { appRouter } from "./routers";
import { clients, tenants } from "../drizzle/schema";
import { clientPortalSignInCode, signInCodeWindow, verifyClientPortalSessionToken } from "./clientPortalSession";

const originalSecret = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = "portal-sign-in-all-salons-test-secret"; });
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

const SALONS = [{ id: 1, name: "Barkin' Beautiful", email: null }, { id: 7, name: "Barkin Beautiful Barber", email: null }];
const account = (tenantId: number, id: number, passwordHash: string | null) => ({
  id, tenantId, firstName: "Sam", lastName: "Client", email: "sam@example.com",
  portalLoginEmail: "sam@example.com", portalPasswordHash: passwordHash, portalAccountStatus: "active",
  portalSessionVersion: 0, portalLastSignedInAt: null,
});

function database(accounts: Array<ReturnType<typeof account>>) {
  const make = (table?: unknown): any => {
    const rows = () => (table === tenants ? SALONS : table === clients ? accounts : []);
    const chain: any = {
      from: (t: unknown) => make(t), where: () => chain, orderBy: () => chain,
      limit: (n: number) => Promise.resolve(rows().slice(0, n)),
      then: (res: any, rej?: any) => Promise.resolve(rows()).then(res, rej),
    };
    return chain;
  };
  return {
    select: () => make(),
    update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
  };
}

/** A public caller; records the portal cookie it is given. */
function visitor() {
  const cookies: string[] = [];
  const caller = appRouter.createCaller({
    user: null, tenantId: null, accessibleTenantIds: [],
    req: { protocol: "https", headers: {}, socket: { remoteAddress: `10.0.0.${Math.floor(Math.random() * 250)}` } },
    res: { cookie: (_name: string, token: string) => cookies.push(token) },
  } as any);
  return { caller, signedInTo: async () => (await verifyClientPortalSessionToken(cookies.at(-1)!))?.tenantId };
}

let hash: string;
let otherHash: string;
beforeAll(async () => {
  hash = await bcrypt.hash("right-password", 4);
  otherHash = await bcrypt.hash("a-different-password", 4);
});
beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(true);
});

describe("password sign-in", () => {
  it("lets a client of another salon in", async () => {
    getDb.mockResolvedValue(database([account(7, 501, hash)]));
    const v = visitor();
    await expect(v.caller.clientPortal.login({ email: "Sam@Example.com", password: "right-password" }))
      .resolves.toMatchObject({ success: true });
    expect(await v.signedInTo()).toBe(7);
  });

  it("opens the salon whose password it is when the email is at two salons", async () => {
    getDb.mockResolvedValue(database([account(1, 40, otherHash), account(7, 501, hash)]));
    const v = visitor();
    await v.caller.clientPortal.login({ email: "sam@example.com", password: "right-password" });
    expect(await v.signedInTo()).toBe(7);
  });

  it("asks which salon when the same password opens both, then opens the one picked", async () => {
    getDb.mockResolvedValue(database([account(1, 40, hash), account(7, 501, hash)]));
    const v = visitor();
    await expect(v.caller.clientPortal.login({ email: "sam@example.com", password: "right-password" })).resolves.toEqual({
      success: false,
      chooseSalon: [{ tenantId: 1, name: "Barkin' Beautiful" }, { tenantId: 7, name: "Barkin Beautiful Barber" }],
    });
    await v.caller.clientPortal.login({ email: "sam@example.com", password: "right-password", salonId: 7 });
    expect(await v.signedInTo()).toBe(7);
  });

  it("still refuses a wrong password everywhere", async () => {
    getDb.mockResolvedValue(database([account(1, 40, hash), account(7, 501, hash)]));
    await expect(visitor().caller.clientPortal.login({ email: "sam@example.com", password: "nope", salonId: 7 }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("emailed sign-in", () => {
  it("sends one sign-in email per salon the address has an account with", async () => {
    getDb.mockResolvedValue(database([account(1, 40, null), account(7, 501, null)]));
    await visitor().caller.clientPortal.requestSignInLink({ email: "sam@example.com" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    // Each carries its own salon account's code.
    const codeFor = (clientId: number, tenantId: number) => {
      const code = clientPortalSignInCode({ clientId, tenantId, sessionVersion: 0, lastSignedInMs: 0 }, signInCodeWindow());
      return `${code.slice(0, 3)} ${code.slice(3)}`; // as the email prints it
    };
    expect(sendEmail.mock.calls[0][0].html).toContain(codeFor(40, 1));
    expect(sendEmail.mock.calls[1][0].html).toContain(codeFor(501, 7));
  });

  it("the code opens the salon it was sent for", async () => {
    getDb.mockResolvedValue(database([account(1, 40, null), account(7, 501, null)]));
    const code = clientPortalSignInCode(
      { clientId: 501, tenantId: 7, sessionVersion: 0, lastSignedInMs: 0 }, signInCodeWindow(),
    );
    const v = visitor();
    await v.caller.clientPortal.redeemSignInCode({ email: "sam+code@example.com", code });
    expect(await v.signedInTo()).toBe(7);
  });
});
