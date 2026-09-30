import { describe, expect, it } from "vitest";
import {
  CLIENT_PORTAL_ACCESS_TTL_MS,
  createClientPortalToken,
  hashClientPortalToken,
  isClientPortalLinkExpired,
} from "../shared/clientPortalAccess";

describe("client portal access tokens", () => {
  it("creates opaque tokens while retaining only a deterministic SHA-256 hash", () => {
    const access = createClientPortalToken();
    expect(access.token).toHaveLength(64);
    expect(access.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(access.tokenHash).toBe(hashClientPortalToken(access.token));
  });

  it("sets an expiry-bound thirty-day access window", () => {
    const before = Date.now();
    const access = createClientPortalToken();
    expect(access.expiresAt.getTime()).toBeGreaterThanOrEqual(before + CLIENT_PORTAL_ACCESS_TTL_MS - 20);
    // Seconds, not a millisecond. With a 1ms margin the clock moves between
    // building the date and reading it inside the function, so this failed
    // intermittently under a loaded full-suite run while passing every time
    // on its own - the worst kind of red, because it trains you to re-run.
    expect(isClientPortalLinkExpired(new Date(Date.now() - 5_000))).toBe(true);
    expect(isClientPortalLinkExpired(new Date(Date.now() + 5_000))).toBe(false);
  });
});
