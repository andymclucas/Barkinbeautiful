/**
 * What issuing a client-portal setup link should actually write, and what
 * letting one expire should.
 *
 * ## The bug this exists to stop
 *
 * Issuing a link used to clear `portal_password_hash` and force the account
 * back to `setup_pending`, unconditionally. For a client who had never set
 * up, that is correct — there is nothing to lose. For a client who was
 * ALREADY ACTIVE it quietly deleted a working password, and if the email
 * did not arrive they were locked out of an account they had been using,
 * with a password their manager still held and nothing to match it against.
 *
 * That is exactly what happened to a client on 05/11/2026: signed in
 * successfully on 14 October, link reissued some time after, then two
 * password-reset attempts that could never have worked. They were certain
 * their password was right. It was — the credential had been deleted
 * underneath them.
 *
 * `auth.requestPasswordReset` already carries this scar in its own comment:
 * a previous version overwrote `passwordHash` with the reset token, so
 * REQUESTING a reset destroyed the real password with no way back if the
 * email never came. The portal had the same shape and had not been fixed.
 *
 * So: a reset link for an active account is a reset link. The old password
 * keeps working until the new one is set.
 *
 * ## And the expiry is worse than the issue
 *
 * An expired link resets the account to `not_enabled` and nulls the
 * password AND the login email. On a never-completed setup that is tidy.
 * On an ACTIVE account whose unused reset link went stale, it would delete
 * a working portal account because nobody clicked a link. Nothing has hit
 * that yet only because active accounts never carried a setup token before
 * this change — which means the fix cannot ship without this half.
 */

export type PortalAccountStatus = "not_enabled" | "setup_pending" | "active" | "revoked";

export type PortalLinkIssue = {
  /** Leave `portal_password_hash` alone instead of nulling it. */
  keepPassword: boolean;
  /** What `portal_account_status` becomes. */
  status: PortalAccountStatus;
  /**
   * Whether to invalidate the client's existing sessions.
   *
   * No, for a reset on an active account: asking for a reset link is not a
   * reason to throw somebody out of a session they are in the middle of.
   * Completing the setup bumps it, which is where a session should end.
   */
  bumpSessionVersion: boolean;
  /** True when this is a reset of a live account rather than a first setup. */
  isReset: boolean;
};

export function portalLinkIssueEffect(input: {
  currentStatus: PortalAccountStatus;
  currentLoginEmail: string | null | undefined;
  newLoginEmail: string;
}): PortalLinkIssue {
  const sameAddress =
    (input.currentLoginEmail ?? "").trim().toLowerCase() === input.newLoginEmail.trim().toLowerCase();

  /*
   * Only an ACTIVE account keeps its password, and only when the address is
   * not changing.
   *
   * A changed address is deliberately treated as a new account. The usual
   * reason to repoint a portal login is that the old address was wrong or
   * belonged to somebody else, and in that case the existing password is a
   * credential held by the wrong person. Keeping it would be the one case
   * where protecting the password is the unsafe choice.
   */
  if (input.currentStatus === "active" && sameAddress) {
    return { keepPassword: true, status: "active", bumpSessionVersion: false, isReset: true };
  }
  return { keepPassword: false, status: "setup_pending", bumpSessionVersion: true, isReset: false };
}

/**
 * What to do when somebody opens a setup link that has expired.
 *
 * `wipeAccount` false means: clear the dead token and its expiry, and leave
 * the account exactly as it was. The client carries on with the password
 * they already had and can ask for another link.
 */
export function portalLinkExpiryEffect(currentStatus: PortalAccountStatus): { wipeAccount: boolean } {
  return { wipeAccount: currentStatus !== "active" };
}

/** Which statuses a setup token may be redeemed against. */
export const REDEEMABLE_PORTAL_STATUSES: readonly PortalAccountStatus[] = ["setup_pending", "active"];

/**
 * Which address a portal set-up email goes to, and so becomes the login.
 *
 * Lauren, 17/11/2026: "I emailed a portal link and updated to the new email
 * address above. she didn't get it. So I resent it but noticed the top
 * right corner had her old address written again."
 *
 * The first send saved the client's email as their portal login, and every
 * later send looked for that saved login FIRST. Edit details changes the
 * client's email only, so once one set-up email had gone to a wrong or old
 * address, every resend went there too, and no screen could change it.
 *
 * The saved login only deserves to win once somebody is actually using it:
 *
 *  - ACTIVE account: the login the client signs in with. Changing it under
 *    them is how people get locked out, and `portalLinkIssueEffect` treats
 *    a changed address on a live account as a brand-new account. So an
 *    active account keeps its login, exactly as before.
 *  - Anything else (never set up, set-up pending, turned off): nobody is
 *    signing in with it, so the email on the client record is the truth,
 *    and the saved login is only a fallback for a record with no email.
 *
 * An address given explicitly by the caller always wins.
 */
export function portalSetupAddress(input: {
  explicitEmail?: string | null;
  status: PortalAccountStatus | null | undefined;
  portalLoginEmail: string | null | undefined;
  clientEmail: string | null | undefined;
}): string {
  const clean = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  const explicit = clean(input.explicitEmail);
  if (explicit) return explicit;
  const login = clean(input.portalLoginEmail);
  const onRecord = clean(input.clientEmail);
  if (input.status === "active") return login || onRecord;
  return onRecord || login;
}
