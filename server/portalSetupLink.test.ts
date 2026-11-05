import { describe, expect, it } from "vitest";
import {
  portalLinkIssueEffect,
  portalLinkExpiryEffect,
  REDEEMABLE_PORTAL_STATUSES,
  type PortalAccountStatus,
} from "@shared/portalSetupLink";

const ALL: PortalAccountStatus[] = ["not_enabled", "setup_pending", "active", "revoked"];

describe("issuing a portal setup link", () => {
  it("keeps a live account's password when the address is unchanged", () => {
    // The bug: a client signed in on 14 October, the link was reissued,
    // and the password her manager still held had nothing to match. She
    // was certain she had it right. She did.
    const e = portalLinkIssueEffect({
      currentStatus: "active",
      currentLoginEmail: "julie@example.com",
      newLoginEmail: "julie@example.com",
    });
    expect(e.keepPassword).toBe(true);
    expect(e.status).toBe("active");
    expect(e.isReset).toBe(true);
  });

  it("does not throw a live client out of a session just for asking", () => {
    // Completing the setup bumps the session version. Requesting a link
    // is not the moment to end a session somebody is in the middle of.
    const e = portalLinkIssueEffect({
      currentStatus: "active", currentLoginEmail: "a@b.com", newLoginEmail: "a@b.com",
    });
    expect(e.bumpSessionVersion).toBe(false);
  });

  it("ignores case and surrounding space when deciding it is the same person", () => {
    const e = portalLinkIssueEffect({
      currentStatus: "active",
      currentLoginEmail: "  Julie@Example.com ",
      newLoginEmail: "julie@example.com",
    });
    expect(e.keepPassword).toBe(true);
  });

  it("clears the password when the login address is being changed", () => {
    // The usual reason to repoint a portal login is that the old address
    // was wrong or belonged to somebody else. Keeping the password would
    // be the one case where protecting it is the unsafe choice.
    const e = portalLinkIssueEffect({
      currentStatus: "active",
      currentLoginEmail: "old@example.com",
      newLoginEmail: "new@example.com",
    });
    expect(e.keepPassword).toBe(false);
    expect(e.status).toBe("setup_pending");
    expect(e.bumpSessionVersion).toBe(true);
    expect(e.isReset).toBe(false);
  });

  it("treats a client who never finished setting up as a setup, not a reset", () => {
    // Her email matched, so the old code called it a reset and emailed
    // her "Reset your password" for a password she had never had.
    const e = portalLinkIssueEffect({
      currentStatus: "setup_pending",
      currentLoginEmail: "julie@example.com",
      newLoginEmail: "julie@example.com",
    });
    expect(e.isReset).toBe(false);
    expect(e.keepPassword).toBe(false);
  });

  it("clears for every status except a live account", () => {
    for (const status of ALL) {
      const e = portalLinkIssueEffect({
        currentStatus: status, currentLoginEmail: "a@b.com", newLoginEmail: "a@b.com",
      });
      expect(e.keepPassword, status).toBe(status === "active");
    }
  });

  it("handles a client who has no login address yet", () => {
    const e = portalLinkIssueEffect({
      currentStatus: "not_enabled", currentLoginEmail: null, newLoginEmail: "new@example.com",
    });
    expect(e.keepPassword).toBe(false);
    expect(e.status).toBe("setup_pending");
  });
});

describe("a setup link that expires unused", () => {
  it("never wipes a live account", () => {
    // Without this, a working portal account would be deleted because
    // nobody clicked a link. It only becomes reachable once an active
    // account can hold a token, so it ships with that change or not at all.
    expect(portalLinkExpiryEffect("active").wipeAccount).toBe(false);
  });

  it("still tidies up a setup that was never completed", () => {
    expect(portalLinkExpiryEffect("setup_pending").wipeAccount).toBe(true);
    expect(portalLinkExpiryEffect("not_enabled").wipeAccount).toBe(true);
    expect(portalLinkExpiryEffect("revoked").wipeAccount).toBe(true);
  });
});

describe("which accounts may redeem a token", () => {
  it("is exactly setup_pending and active", () => {
    expect([...REDEEMABLE_PORTAL_STATUSES].sort()).toEqual(["active", "setup_pending"]);
  });

  it("never lets a revoked account be reactivated by an old link", () => {
    // revoked is a deliberate act by the salon. A link minted before it
    // must not undo it.
    expect(REDEEMABLE_PORTAL_STATUSES).not.toContain("revoked");
    expect(REDEEMABLE_PORTAL_STATUSES).not.toContain("not_enabled");
  });
});
