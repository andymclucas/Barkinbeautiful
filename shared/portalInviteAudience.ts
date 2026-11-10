/**
 * Who the bulk portal invitation goes to.
 *
 * Andy, 11/11/2026: one email that gets clients to set up their portal,
 * with the service agreement as the first page. Written as a pure
 * function so the count the sender is shown and the list the send works
 * through are the same calculation.
 *
 * Every exclusion is counted, not just applied, so the screen can say
 * WHY 1,033 active clients becomes ~600 emails. A number that drops
 * without explanation reads as a bug and gets "fixed".
 */

export type PortalInviteCandidate = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  portalAccountStatus: "not_enabled" | "setup_pending" | "active" | "revoked";
  portalLoginEmail: string | null;
  /** When the client's current setup link stops working, if they have one. */
  portalSetupExpiresAt?: Date | null;
};

export type PortalInviteRecipient = {
  clientId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type PortalInviteSkipReason =
  | "no_email"
  | "already_has_portal"
  | "access_revoked"
  | "unsubscribed"
  | "on_hold"
  | "invitation_outstanding"
  | "shared_email"
  | "email_used_by_another_portal";

export const PORTAL_INVITE_SKIP_LABELS: Record<PortalInviteSkipReason, string> = {
  no_email: "No email address on file",
  already_has_portal: "Already using the portal",
  access_revoked: "Portal access was turned off by the salon",
  unsubscribed: "Unsubscribed from salon emails",
  on_hold: "On hold — not to be contacted yet",
  invitation_outstanding: "Already holds a setup link that still works",
  shared_email: "Shares an email with another client (the first one gets it)",
  email_used_by_another_portal: "Email is another client's portal login",
};

/** Above this, the sender types the number to confirm. */
export const PORTAL_INVITE_TYPED_CONFIRM_THRESHOLD = 25;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function selectPortalInviteRecipients(input: {
  candidates: readonly PortalInviteCandidate[];
  unsubscribedEmails: ReadonlySet<string>;
  heldClientIds: ReadonlySet<number>;
  /** portal login email -> the client it belongs to, across the tenant. */
  portalLoginOwners: ReadonlyMap<string, number>;
  now?: Date;
}): { recipients: PortalInviteRecipient[]; skipped: Record<PortalInviteSkipReason, number> } {
  const skipped: Record<PortalInviteSkipReason, number> = {
    no_email: 0, already_has_portal: 0, access_revoked: 0, unsubscribed: 0,
    on_hold: 0, invitation_outstanding: 0, shared_email: 0, email_used_by_another_portal: 0,
  };
  const now = (input.now ?? new Date()).getTime();
  const recipients: PortalInviteRecipient[] = [];
  const claimed = new Set<string>();

  // Lowest id first, so which of two clients sharing an address gets the
  // invitation is stable from preview to send.
  const ordered = [...input.candidates].sort((a, b) => a.id - b.id);

  for (const c of ordered) {
    if (input.heldClientIds.has(c.id)) { skipped.on_hold += 1; continue; }
    if (c.portalAccountStatus === "active") { skipped.already_has_portal += 1; continue; }
    // Somebody at the salon switched this off on purpose. A campaign must
    // not quietly switch it back on.
    if (c.portalAccountStatus === "revoked") { skipped.access_revoked += 1; continue; }
    /*
     * Somebody who already holds a working link — from an earlier send, or
     * the button on their client page — is left alone. Issuing a new one
     * would kill the link in the email they may have open right now, and
     * a second identical email is the confusing message this avoids.
     * Once that link expires they are counted again, which makes a later
     * send a reminder to exactly the people who never finished.
     */
    if (c.portalAccountStatus === "setup_pending" && c.portalSetupExpiresAt && c.portalSetupExpiresAt.getTime() > now) {
      skipped.invitation_outstanding += 1; continue;
    }

    // A half-finished setup keeps the address it was set up with.
    const email = normaliseEmail(c.portalLoginEmail) || normaliseEmail(c.email);
    if (!EMAIL.test(email)) { skipped.no_email += 1; continue; }
    if (input.unsubscribedEmails.has(email)) { skipped.unsubscribed += 1; continue; }

    const owner = input.portalLoginOwners.get(email);
    if (owner !== undefined && owner !== c.id) { skipped.email_used_by_another_portal += 1; continue; }
    // One portal login per address. A couple with two client records and
    // one inbox would otherwise get two emails, and the second link would
    // fail on the unique login the first one took.
    if (claimed.has(email)) { skipped.shared_email += 1; continue; }

    claimed.add(email);
    recipients.push({ clientId: c.id, email, firstName: c.firstName, lastName: c.lastName });
  }
  return { recipients, skipped };
}

export type PortalInviteGuard = { ok: true } | { ok: false; error: string };

/** The last check before real emails go out: same rule as mass text. */
export function guardPortalInviteSend(input: { recipientCount: number; confirmedCount: number }): PortalInviteGuard {
  if (input.recipientCount <= 0) return { ok: false, error: "Nobody is waiting for an invitation." };
  if (input.recipientCount !== input.confirmedCount) {
    return {
      ok: false,
      error: `This now reaches ${input.recipientCount} clients, not the ${input.confirmedCount} you confirmed. Check the count again.`,
    };
  }
  return { ok: true };
}

/** First name for the greeting, or a plain "Hi" when we have none. */
export function inviteGreeting(firstName: string | null | undefined): string {
  const name = (firstName ?? "").trim();
  return name ? `Hi ${name},` : "Hi,";
}
