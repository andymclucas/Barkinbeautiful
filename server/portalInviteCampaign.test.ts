import { describe, expect, it } from "vitest";
import { heldClientIds, portalInviteEmail } from "./portalInviteCampaign";

const base = {
  firstName: "Jane",
  salonName: "Barkin' Beautiful",
  salonPhone: "07 5555 0000",
  setupUrl: "https://portal.example/portal/setup/abc",
  expiresAt: new Date("2026-12-11T02:00:00Z"),
};

describe("portalInviteEmail", () => {
  it("tells an unsigned client the agreement comes first", () => {
    const e = portalInviteEmail({ ...base, agreementTitles: ["Barkin Beautiful Service Agreement"] });
    expect(e.subject).toBe("Set up your Barkin' Beautiful client portal");
    expect(e.html).toContain("read and sign our Barkin Beautiful Service Agreement");
    expect(e.html).toContain('href="https://portal.example/portal/setup/abc"');
    expect(e.html).toContain("11 December 2026");
  });

  it("does not mention signing to a client who already signed", () => {
    const e = portalInviteEmail({ ...base, agreementTitles: [] });
    expect(e.html).not.toContain("sign our");
    expect(e.html).toContain("choose a password");
  });

  it("escapes the client's name and never greets a blank one", () => {
    expect(portalInviteEmail({ ...base, firstName: "<b>Jo</b>", agreementTitles: [] }).html).toContain("Hi &lt;b&gt;Jo&lt;/b&gt;,");
    expect(portalInviteEmail({ ...base, firstName: "", agreementTitles: [] }).html).toContain("<p>Hi,</p>");
  });

  it("leads with a red 'add your card' box for a client with no card saved", () => {
    const html = portalInviteEmail({ ...base, agreementTitles: [], needsCard: true }).html;
    expect(html).toContain("Please add your card details");
    expect(html).toContain("#dc2626");
    // Before the setup button, where it cannot be scrolled past.
    expect(html.indexOf("Please add your card details")).toBeLessThan(html.indexOf("Set up my portal"));
  });

  it("asks for a card unless it is known one is saved", () => {
    expect(portalInviteEmail({ ...base, agreementTitles: [] }).html).toContain("Please add your card details");
    expect(portalInviteEmail({ ...base, agreementTitles: [], needsCard: false }).html).not.toContain("Please add your card details");
  });
});

describe("heldClientIds", () => {
  it("keeps Toni (15) and Holly (258) out until Andy lifts the hold", () => {
    expect(Array.from(heldClientIds(1)).sort((a, b) => a - b)).toEqual([15, 258]);
    expect(heldClientIds(2).size).toBe(0);
  });
});
