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

/** At most one renewal write per client per day, however often they look. */
export const CLIENT_PORTAL_RENEWAL_INTERVAL_MS = 1000 * 60 * 60 * 24;

/**
 * A new expiry for a link that is still being used, or null to leave it.
 *
 * The TTL above is counted from the moment the link was ISSUED and was
 * never moved again, so a link died thirty days later whatever the
 * client did with it. That was survivable while the only way in was the
 * email — an expired link meant finding a newer email, or asking the
 * salon.
 *
 * It stopped being survivable on 10/11/2026, when the portal started
 * handing out Home Screen icons that carry the token (see
 * `shared/portalManifest.ts`). An icon is a thing a client expects to
 * keep. One that silently stops working a month after it is installed —
 * and lands them on a password form for an account they do not have —
 * is worse than no icon at all.
 *
 * So the clock runs from the last visit rather than from the issue: a
 * client who opens their portal at all within thirty days keeps it, and
 * one who stops using it is still cut off thirty days later. Revoking
 * from the client record is unaffected, and so is the salon's ability
 * to replace a link — both set `status`, which is checked first.
 *
 * Returning null for a link with plenty of life left is what keeps this
 * to one write a day rather than one per page view.
 */
export function clientPortalLinkRenewal(
  expiresAt: Date,
  now = new Date(),
): Date | null {
  if (isClientPortalLinkExpired(expiresAt, now)) return null;
  const renewedAt = expiresAt.getTime() - CLIENT_PORTAL_ACCESS_TTL_MS;
  if (now.getTime() - renewedAt < CLIENT_PORTAL_RENEWAL_INTERVAL_MS) return null;
  return new Date(now.getTime() + CLIENT_PORTAL_ACCESS_TTL_MS);
}
