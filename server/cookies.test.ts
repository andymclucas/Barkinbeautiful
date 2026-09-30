import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./_core/cookies";

const req = (protocol: string, headers: Record<string, unknown> = {}) =>
  ({ protocol, headers } as unknown as Request);

describe("getSessionCookieOptions", () => {
  it("never emits SameSite=None without Secure", () => {
    // Regression: it did, and browsers drop such a cookie silently. Over
    // http://localhost the session was never stored, so signing in bounced
    // straight back to /login - an unbreakable loop, and local development
    // could not be logged into at all.
    for (const r of [req("http"), req("http", { "x-forwarded-proto": "http" }), req("http", {})]) {
      const o = getSessionCookieOptions(r);
      expect(o.secure).toBe(false);
      expect(o.sameSite).not.toBe("none");
    }
  });

  it("uses lax over plain http so the cookie is actually stored", () => {
    expect(getSessionCookieOptions(req("http"))).toMatchObject({ sameSite: "lax", secure: false });
  });

  it("keeps SameSite=None + Secure on https, unchanged from before", () => {
    expect(getSessionCookieOptions(req("https"))).toMatchObject({ sameSite: "none", secure: true });
  });

  it("trusts x-forwarded-proto, which is how Render terminates TLS", () => {
    expect(getSessionCookieOptions(req("http", { "x-forwarded-proto": "https" })))
      .toMatchObject({ sameSite: "none", secure: true });
    // A proxy chain lists protocols comma-separated.
    expect(getSessionCookieOptions(req("http", { "x-forwarded-proto": "https,http" })).secure).toBe(true);
    expect(getSessionCookieOptions(req("http", { "x-forwarded-proto": ["https"] })).secure).toBe(true);
  });

  it("is always httpOnly and root-scoped", () => {
    for (const r of [req("http"), req("https")]) {
      expect(getSessionCookieOptions(r)).toMatchObject({ httpOnly: true, path: "/" });
    }
  });
});
