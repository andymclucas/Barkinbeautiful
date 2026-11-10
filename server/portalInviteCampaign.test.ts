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
});

describe("heldClientIds", () => {
  it("keeps Toni (15) and Holly (258) out until Andy lifts the hold", () => {
    expect(Array.from(heldClientIds(1)).sort((a, b) => a - b)).toEqual([15, 258]);
    expect(heldClientIds(2).size).toBe(0);
  });
});
