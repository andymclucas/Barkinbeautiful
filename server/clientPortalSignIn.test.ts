import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => { process.env.JWT_SECRET = "test-secret-for-portal-sign-in-0123456789"; });

const claim = { clientId: 315, tenantId: 1, sessionVersion: 3, lastSignedInMs: 1_794_400_000_000 };

describe("the emailed sign-in link", () => {
  it("round-trips the facts it was issued with", async () => {
    const { createClientPortalSignInToken, verifyClientPortalSignInToken } = await import("./clientPortalSession");
    const token = await createClientPortalSignInToken(claim);
    expect(await verifyClientPortalSignInToken(token)).toEqual(claim);
  });

  it("is not a session, and a session is not a sign-in link", async () => {
    const m = await import("./clientPortalSession");
    const session = await m.createClientPortalSessionToken({ clientId: 315, tenantId: 1, sessionVersion: 3 });
    expect(await m.verifyClientPortalSignInToken(session)).toBeNull();
    const link = await m.createClientPortalSignInToken(claim);
    expect(await m.verifyClientPortalSessionToken(link)).toBeNull();
  });

  it("refuses rubbish", async () => {
    const { verifyClientPortalSignInToken } = await import("./clientPortalSession");
    expect(await verifyClientPortalSignInToken("not-a-token")).toBeNull();
    expect(await verifyClientPortalSignInToken(null)).toBeNull();
  });
});

describe("the six-digit code in the same email", () => {
  it("matches in its own window and the one after, then stops", async () => {
    const { clientPortalSignInCode, signInCodeMatches, signInCodeWindow, SIGNIN_CODE_WINDOW_MS } = await import("./clientPortalSession");
    const now = 1_794_460_000_000;
    const code = clientPortalSignInCode(claim, signInCodeWindow(now));
    expect(code).toMatch(/^\d{6}$/);
    expect(signInCodeMatches(claim, code, now)).toBe(true);
    expect(signInCodeMatches(claim, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
    expect(signInCodeMatches(claim, code, now + SIGNIN_CODE_WINDOW_MS)).toBe(true);
    expect(signInCodeMatches(claim, code, now + 2 * SIGNIN_CODE_WINDOW_MS)).toBe(false);
  });

  it("dies once anyone signs in — the last-signed-in time it was built on has moved", async () => {
    const { clientPortalSignInCode, signInCodeMatches, signInCodeWindow } = await import("./clientPortalSession");
    const now = 1_794_460_000_000;
    const code = clientPortalSignInCode(claim, signInCodeWindow(now));
    expect(signInCodeMatches({ ...claim, lastSignedInMs: claim.lastSignedInMs + 60_000 }, code, now)).toBe(false);
    expect(signInCodeMatches({ ...claim, sessionVersion: 4 }, code, now)).toBe(false);
    expect(signInCodeMatches({ ...claim, clientId: 316 }, code, now)).toBe(false);
  });

  it("refuses anything that is not six digits", async () => {
    const { signInCodeMatches } = await import("./clientPortalSession");
    expect(signInCodeMatches(claim, "12345")).toBe(false);
    expect(signInCodeMatches(claim, "abcdef")).toBe(false);
  });
});
