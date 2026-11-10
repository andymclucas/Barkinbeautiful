import { describe, expect, it } from "vitest";
import {
  CLIENT_PORTAL_ACCESS_TTL_MS,
  clientPortalLinkRenewal,
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

describe("keeping a link alive while it is being used", () => {
  const DAY = 1000 * 60 * 60 * 24;
  const now = new Date("2026-11-10T02:00:00Z");
  /** The expiry a link issued `days` ago would carry. */
  const issuedDaysAgo = (days: number) =>
    new Date(now.getTime() - days * DAY + CLIENT_PORTAL_ACCESS_TTL_MS);

  it("leaves a link that was renewed within the day alone", () => {
    // Renee Gannon's icon will call the portal several times a visit.
    // Writing a new expiry on each one would be a write per page view.
    expect(clientPortalLinkRenewal(issuedDaysAgo(0), now)).toBeNull();
    expect(clientPortalLinkRenewal(issuedDaysAgo(0.5), now)).toBeNull();
  });

  it("pushes the expiry back out for a link in regular use", () => {
    const renewed = clientPortalLinkRenewal(issuedDaysAgo(10), now);
    expect(renewed).not.toBeNull();
    expect(renewed!.getTime()).toBe(now.getTime() + CLIENT_PORTAL_ACCESS_TTL_MS);
  });

  it("saves a link on its last day, which is the whole point", () => {
    // 29 days in, one day left. Before this, a Home Screen icon that a
    // client used every week still died on day 30.
    const renewed = clientPortalLinkRenewal(issuedDaysAgo(29), now);
    expect(renewed!.getTime()).toBe(now.getTime() + CLIENT_PORTAL_ACCESS_TTL_MS);
  });

  it("will not resurrect a link that has already run out", () => {
    // Expiry is checked before this is ever called, but a renewal that
    // revived a dead link would turn "ask the salon for a new one" into
    // a link that works again forever.
    expect(clientPortalLinkRenewal(issuedDaysAgo(30), now)).toBeNull();
    expect(clientPortalLinkRenewal(issuedDaysAgo(45), now)).toBeNull();
  });

  it("still cuts off a client who stops visiting", () => {
    // Renewal must not become "never expires". Thirty days after the
    // LAST visit, the link is gone.
    const lastVisit = new Date("2026-11-10T02:00:00Z");
    const renewed = clientPortalLinkRenewal(issuedDaysAgo(10), lastVisit)!;
    const thirtyOneDaysLater = new Date(lastVisit.getTime() + 31 * DAY);
    expect(isClientPortalLinkExpired(renewed, thirtyOneDaysLater)).toBe(true);
  });
});
