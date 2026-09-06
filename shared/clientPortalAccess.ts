import crypto from "node:crypto";

export const CLIENT_PORTAL_ACCESS_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function hashClientPortalToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createClientPortalToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashClientPortalToken(token),
    expiresAt: new Date(Date.now() + CLIENT_PORTAL_ACCESS_TTL_MS),
  };
}

export function isClientPortalLinkExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
