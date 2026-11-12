/**
 * "Forgot password?" on the client portal sign-in, and the email it sends.
 *
 * Andy, 12/11/2026, after a client who had activated her account asked
 * Lauren how to get back in once the setup link had expired: "Yes, do
 * both" — a way back to sign-in from a dead link, and a reset a client
 * can ask for herself instead of ringing the salon.
 *
 * The reset reuses the salon's own reset mechanism (a setup token on the
 * client row, opened at /portal/setup/:token). For a LIVE account that
 * keeps the old password working until the new one is set — see
 * shared/portalSetupLink.ts for the lock-out that rule exists to prevent.
 */

/**
 * A reset the client asked for herself lasts two hours.
 *
 * The salon's own setup links last 30 days, because they go out with an
 * invitation somebody may not open for a week. A reset is asked for by
 * the person about to use it, from the sign-in page, so a long life buys
 * nothing and leaves a working key sitting in an inbox.
 */
export const SELF_RESET_TTL_MS = 2 * 60 * 60 * 1000;

/** One email per address per this long, however often the button is pressed. */
export const SELF_RESET_COOLDOWN_MS = 5 * 60 * 1000;

/** Requests per IP address per hour, so the form cannot be used to spray inboxes. */
export const SELF_RESET_PER_IP_PER_HOUR = 10;

/** May this address be sent another reset now? */
export function resetEmailAllowed(lastSentMs: number | undefined, nowMs: number): boolean {
  return lastSentMs === undefined || nowMs - lastSentMs >= SELF_RESET_COOLDOWN_MS;
}

/**
 * May this IP ask again? Takes the times of its earlier requests and
 * returns the ones still inside the hour, so the caller can store them.
 */
export function ipRequestAllowed(
  earlierMs: readonly number[],
  nowMs: number,
): { allowed: boolean; keep: number[] } {
  const keep = earlierMs.filter((t) => nowMs - t < 60 * 60 * 1000);
  return { allowed: keep.length < SELF_RESET_PER_IP_PER_HOUR, keep };
}

/**
 * What the page says after any request — the same words whether or not
 * the address has an account, so the form cannot be used to find out
 * which emails are clients of the salon.
 */
export const RESET_REQUESTED_MESSAGE =
  "If that email has a client portal account, we've sent it a link to set a new password. "
  + "The link works for 2 hours. Nothing there? Check your junk folder, or call the salon.";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function expiryWords(expiresAt: Date, now: Date): string {
  const hours = (expiresAt.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 24) {
    const whole = Math.max(1, Math.round(hours));
    return `This link works for the next ${whole} hour${whole === 1 ? "" : "s"}.`;
  }
  const date = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane",
  });
  return `This link expires on ${date}.`;
}

/** The reset email, for both the salon's reset link and the self-service one. */
export function portalPasswordResetEmail(input: {
  firstName: string | null | undefined;
  resetUrl: string;
  expiresAt: Date;
  now?: Date;
}): { subject: string; html: string } {
  const name = escapeHtml((input.firstName ?? "").trim() || "there");
  return {
    subject: "Reset your Barkin' Beautiful client portal password",
    html:
      `<p>Hi ${name},</p>`
      + `<p>Here's your link to set a new password for your Barkin' Beautiful client portal account.</p>`
      + `<p><a href="${escapeHtml(input.resetUrl)}">Reset my password</a></p>`
      + `<p>${expiryWords(input.expiresAt, input.now ?? new Date())} Until you set a new one, your current password still works.</p>`
      + `<p>Didn't ask for this? You can ignore this email — nothing changes unless the link is used.</p>`,
  };
}
