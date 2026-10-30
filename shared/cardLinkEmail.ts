/**
 * The email that asks a client to put a card on file.
 *
 * Pure so the wording can be tested without Resend, a database or a network.
 * The only thing the caller supplies is the Stripe Checkout URL, which is a
 * hosted Stripe page — not one of ours — so nothing here goes through
 * getAppBaseUrl().
 */

import { isStripeHostedUrl } from "./stripeHostedUrl";

export type CardLinkEmailInput = {
  /** The client's first name. Blank or missing is fine. */
  firstName?: string | null;
  /** Stripe Checkout URL from createCardSetupLink. */
  url: string;
  /** Salon name, for the signature. */
  salonName?: string | null;
  /** True when the client already has a card and this replaces it. */
  replacingExistingCard?: boolean;
};

export type BuiltEmail = { subject: string; html: string };


/**
 * Stripe Checkout links are https and live on Stripe's own domains.
 *
 * The check moved to `shared/stripeHostedUrl.ts` when the invoice email
 * needed the same one. Kept as a named export because this file's own
 * tests and callers use it, and because "is this an acceptable card
 * link" reads better at those call sites than the general name.
 */
export function isAcceptableCardLink(url: string): boolean {
  return isStripeHostedUrl(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCardLinkEmail(input: CardLinkEmailInput): BuiltEmail {
  if (!isAcceptableCardLink(input.url)) {
    // Refuse rather than mail a client a link we cannot vouch for.
    throw new Error("Refusing to email a card link that is not a Stripe Checkout URL");
  }

  const name = (input.firstName ?? "").trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";
  const salon = (input.salonName ?? "Barkin' Beautiful").trim();
  const replacing = input.replacingExistingCard === true;

  const subject = replacing
    ? `Update your card details for ${salon}`
    : `Save your card for ${salon}`;

  // Deliberately plain: states what the link does, that nothing is charged by
  // following it, and that the salon never sees the card number. A payment
  // email that reads like a marketing email reads like a scam.
  const html = [
    `<p>${greeting}</p>`,
    replacing
      ? `<p>Here's a secure link to update the card we keep on file for your grooming membership.</p>`
      : `<p>Here's a secure link to save a card for your grooming membership, so we can take payment automatically instead of asking you at the counter each visit.</p>`,
    `<p><a href="${escapeHtml(input.url)}">${replacing ? "Update my card" : "Save my card"}</a></p>`,
    `<p>Following this link does not charge you anything. Your details are entered on Stripe's secure page and held by them &mdash; ${escapeHtml(salon)} never sees or stores your full card number.</p>`,
    `<p>If you weren't expecting this email, you can ignore it and nothing will change.</p>`,
    `<p>&mdash; ${escapeHtml(salon)}</p>`,
  ].join("");

  return { subject, html };
}
