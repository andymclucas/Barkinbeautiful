import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  // Filled out in full rather than partially. Logout cares about none of
  // these, but a half-built user is how a fixture quietly stops resembling
  // the row the procedures actually receive -- which is what the missing
  // tenantId here would have meant for any test that reused it.
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    tenantId: 1,
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    passwordHash: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    role: "user",
    timezone: null,
    staffColumnOrder: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    // The salon this caller belongs to, and every salon they may act in.
    // Both are part of the context every procedure receives; a fixture
    // without them is not the shape the router is handed.
    tenantId: 1,
    accessibleTenantIds: [1],
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});
