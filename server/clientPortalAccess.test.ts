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
    expect(isClientPortalLinkExpired(new Date(Date.now() - 1))).toBe(true);
    expect(isClientPortalLinkExpired(new Date(Date.now() + 1))).toBe(false);
  });
});
