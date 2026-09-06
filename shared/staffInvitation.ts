import crypto from "node:crypto";

export const STAFF_INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type StaffPortalStatus = "not_invited" | "invited" | "awaiting_approval" | "approved" | "revoked";

export function hashStaffInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createStaffInvitationToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashStaffInvitationToken(token),
    expiresAt: new Date(Date.now() + STAFF_INVITATION_TTL_MS),
  };
}

export function isStaffInvitationExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function canApprovedStaffAccessPortal(role: string, portalStatus: StaffPortalStatus | null | undefined): boolean {
  return role === "staff" && portalStatus === "approved";
}

/**
 * An existing account can only be reused for a staff invitation when it is
 * already linked to that exact staff profile. This prevents an invitation from
 * attaching an unrelated account that happens to share an email address.
 */
export function isLinkedStaffUser(
  staffUserId: number | null | undefined,
  existingUserId: number | null | undefined,
): boolean {
  return typeof staffUserId === "number" && staffUserId > 0 && staffUserId === existingUserId;
}
