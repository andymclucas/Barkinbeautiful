import { describe, expect, it } from "vitest";
import { guardPortalInviteSend, inviteGreeting, selectPortalInviteRecipients, type PortalInviteCandidate } from "./portalInviteAudience";

const c = (id: number, over: Partial<PortalInviteCandidate> = {}): PortalInviteCandidate => ({
  id, firstName: "A", lastName: "B", email: `c${id}@example.com`, portalAccountStatus: "not_enabled", portalLoginEmail: null, ...over,
});
const run = (candidates: PortalInviteCandidate[], extra: Partial<Parameters<typeof selectPortalInviteRecipients>[0]> = {}) =>
  selectPortalInviteRecipients({
    candidates, unsubscribedEmails: new Set(), heldClientIds: new Set(), portalLoginOwners: new Map(), ...extra,
  });

describe("selectPortalInviteRecipients", () => {
  it("invites clients without a portal, lower-cased", () => {
    const r = run([c(1, { email: " Jane@Example.com " })]);
    expect(r.recipients).toEqual([{ clientId: 1, email: "jane@example.com", firstName: "A", lastName: "B" }]);
  });

  it("re-invites a half-finished setup at the address it was set up with", () => {
    const r = run([c(2, { portalAccountStatus: "setup_pending", portalLoginEmail: "login@example.com", email: "other@example.com" })]);
    expect(r.recipients[0].email).toBe("login@example.com");
  });

  it("skips active, revoked, held, unsubscribed and no-email clients, and counts each", () => {
    const r = run(
      [
        c(1, { portalAccountStatus: "active" }),
        c(2, { portalAccountStatus: "revoked" }),
        c(15),
        c(4, { email: "gone@example.com" }),
        c(5, { email: null }),
        c(6, { email: "not-an-email" }),
      ],
      { heldClientIds: new Set([15]), unsubscribedEmails: new Set(["gone@example.com"]) },
    );
    expect(r.recipients).toEqual([]);
    expect(r.skipped).toMatchObject({ already_has_portal: 1, access_revoked: 1, on_hold: 1, unsubscribed: 1, no_email: 2 });
  });

  it("sends one email per address, to the lowest client id", () => {
    const r = run([c(9, { email: "home@example.com" }), c(3, { email: "HOME@example.com" })]);
    expect(r.recipients.map((x) => x.clientId)).toEqual([3]);
    expect(r.skipped.shared_email).toBe(1);
  });

  it("leaves alone a client whose setup link still works, and counts them again once it expires", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    const live = c(7, { portalAccountStatus: "setup_pending", portalSetupExpiresAt: new Date("2026-11-20T00:00:00Z") });
    const dead = c(8, { portalAccountStatus: "setup_pending", portalSetupExpiresAt: new Date("2026-11-02T00:00:00Z") });
    const r = run([live, dead], { now });
    expect(r.recipients.map((x) => x.clientId)).toEqual([8]);
    expect(r.skipped.invitation_outstanding).toBe(1);
  });

  it("skips an address that is already another client's portal login", () => {
    const r = run([c(4, { email: "taken@example.com" })], { portalLoginOwners: new Map([["taken@example.com", 99]]) });
    expect(r.skipped.email_used_by_another_portal).toBe(1);
  });
});

describe("guardPortalInviteSend", () => {
  it("refuses when the count moved since it was confirmed", () => {
    expect(guardPortalInviteSend({ recipientCount: 601, confirmedCount: 600 }).ok).toBe(false);
  });
  it("refuses nobody", () => {
    expect(guardPortalInviteSend({ recipientCount: 0, confirmedCount: 0 }).ok).toBe(false);
  });
  it("passes a matching count", () => {
    expect(guardPortalInviteSend({ recipientCount: 600, confirmedCount: 600 })).toEqual({ ok: true });
  });
});

describe("inviteGreeting", () => {
  it("never greets a blank name", () => {
    expect(inviteGreeting("  ")).toBe("Hi,");
    expect(inviteGreeting("Jo")).toBe("Hi Jo,");
  });
});
