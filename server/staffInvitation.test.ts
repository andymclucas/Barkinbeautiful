import { describe, expect, it } from "vitest";
import {
  canApprovedStaffAccessPortal,
  createStaffInvitationToken,
  hashStaffInvitationToken,
  isStaffInvitationExpired,
} from "../shared/staffInvitation";

describe("staff invitation safeguards", () => {
  it("creates a raw acceptance token while storing only its stable hash", () => {
    const invitation = createStaffInvitationToken();
    expect(invitation.token).toHaveLength(64);
    expect(invitation.tokenHash).toHaveLength(64);
    expect(invitation.tokenHash).toBe(hashStaffInvitationToken(invitation.token));
    expect(invitation.tokenHash).not.toBe(invitation.token);
  });

  it("requires a non-expired invitation and explicit approval for restricted portal access", () => {
    expect(isStaffInvitationExpired(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(true);
    expect(isStaffInvitationExpired(new Date("2026-01-02"), new Date("2026-01-01"))).toBe(false);
    expect(canApprovedStaffAccessPortal("staff", "approved")).toBe(true);
    expect(canApprovedStaffAccessPortal("staff", "awaiting_approval")).toBe(false);
    expect(canApprovedStaffAccessPortal("user", "approved")).toBe(false);
  });
});
