import { describe, expect, it } from "vitest";
import { portalAccessSummary } from "./portalAccessSummary";

const day = () => "12/11/2026";

describe("portalAccessSummary", () => {
  it("says Yes only for an active account, with when it was last used", () => {
    expect(portalAccessSummary({ portalAccountStatus: "active", portalLastSignedInAt: "2026-11-12T00:00:00Z" }, day))
      .toEqual({ hasAccess: true, label: "Yes", detail: "last used 12/11/2026" });
    expect(portalAccessSummary({ portalAccountStatus: "active" }, day).detail).toBe("never signed in");
  });

  it("says No with the reason for everything else", () => {
    expect(portalAccessSummary({ portalAccountStatus: "setup_pending" }, day)).toEqual({ hasAccess: false, label: "No", detail: "setup sent, not used" });
    expect(portalAccessSummary({ portalAccountStatus: "setup_pending", setupExpired: true }, day).detail).toBe("setup link expired");
    expect(portalAccessSummary({ portalAccountStatus: "revoked" }, day).detail).toBe("access revoked");
    expect(portalAccessSummary({ portalAccountStatus: "not_enabled" }, day).detail).toBe("not set up");
    expect(portalAccessSummary(undefined, day)).toEqual({ hasAccess: false, label: "No", detail: "not set up" });
  });
});
