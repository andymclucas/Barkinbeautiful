/**
 * The email-campaign audience "On the portal, no card yet".
 *
 * Andy, 16/11/2026: "an email campaign for anyone that has setup a client
 * portal account but hasn't added their card". That morning 44 clients were
 * on the portal and 14 of them had a card.
 *
 * It is an audience rather than a one-off list for the same reason the mass
 * text's "Members with no card on file" is: it counts down as cards come in,
 * so sending it again reaches whoever is still outstanding and nobody who
 * has already done it.
 *
 * Pure, so the rule is tested without a database. The PREVIEW and the SEND
 * both ask this; a preview that counts one set of people and a send that
 * reaches another is the drift this codebase keeps paying for.
 */

export const PORTAL_NO_CARD_AUDIENCE_TYPE = "portal_no_card";

export const PORTAL_NO_CARD_AUDIENCE_LABEL = "On the portal, no card yet";

export type PortalNoCardCandidate = {
  id: number;
  /** clients.status */
  status: string | null;
  /** clients.portal_account_status */
  portalAccountStatus: string | null;
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
};

/**
 * "Has a card" is the same rule the Charge button uses
 * (shared/cardOnFileCharge.ts): a Stripe customer AND a default payment
 * method. A customer with no method cannot be charged, so they still need
 * the email.
 */
export function hasCardOnFile(c: {
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
}): boolean {
  return Boolean(c.stripeCustomerId && c.stripeDefaultPaymentMethodId);
}

/**
 * On the portal means the account is `active`: they finished setup and can
 * sign in. `setup_pending` has been invited but has nowhere to add a card
 * yet, and `revoked` has been shut out on purpose.
 */
export function isPortalNoCardRecipient(
  c: PortalNoCardCandidate,
  heldClientIds: ReadonlySet<number>,
): boolean {
  if (heldClientIds.has(c.id)) return false;
  if (c.status !== "active") return false;
  if (c.portalAccountStatus !== "active") return false;
  return !hasCardOnFile(c);
}

export function portalNoCardRecipients<T extends PortalNoCardCandidate>(
  rows: readonly T[],
  heldClientIds: ReadonlySet<number>,
): T[] {
  return rows.filter((row) => isPortalNoCardRecipient(row, heldClientIds));
}
