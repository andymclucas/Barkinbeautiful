/**
 * The email that asks a client to put a card on file.
 *
 * Pure so the wording can be tested without Resend, a database or a network.
 * The only thing the caller supplies is the Stripe Checkout URL, which is a
 * hosted Stripe page — not one of ours — so nothing here goes through
 * getAppBaseUrl().
 */

import { isStripeHostedUrl } from "./stripeHostedUrl";
import { clientSalonName } from "./salonBrand";

export type CardLinkEmailInput = {
  /** The client's first name. Blank or missing is fine. */
  firstName?: string | null;
  /** Stripe Checkout URL from createCardSetupLink. */
  url: string;
  /** Salon name, for the signature. */
  salonName?: string | null;
  /** True when the client already has a card and this replaces it. */
  replacingExistingCard?: boolean;
  /**
   * The salon's own client host (getPortalBaseUrl). When given, the short
   * signed card link on that host is accepted as well as a Stripe URL.
   */
  ownBaseUrl?: string | null;
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
export function isAcceptableCardLink(url: string, ownBaseUrl?: string | null): boolean {
  return isStripeHostedUrl(url) || isOwnShortCardLink(url, ownBaseUrl);
}

/**
 * The salon's own short card link: https, on the salon's client host,
 * /card/<client>.<expiry>.<12 hex signature> — server/cardLinkToken.ts.
 *
 * Lauren, 11/11/2026: "Email it to ..." on Ask for a card failed with
 * "Refusing to email a card link that is not a Stripe Checkout URL". The
 * emailed link became the short one on 10/11/2026 (it makes the Stripe
 * session when clicked, so it outlives Stripe's 24-hour expiry), and this
 * check still only knew Stripe's hosts — so every card email was refused.
 *
 * Still strict: the exact host the server itself uses for client links,
 * and a token of exactly the shape the server signs. It does not verify
 * the signature — the redirect does that when the client clicks — but a
 * link that is not shaped like ours on our own host is refused.
 */
export function isOwnShortCardLink(url: string, ownBaseUrl?: string | null): boolean {
  if (!ownBaseUrl) return false;
  let link: URL;
  let base: URL;
  try {
    link = new URL(url);
    base = new URL(ownBaseUrl);
  } catch {
    return false;
  }
  if (link.protocol !== "https:" || link.host.toLowerCase() !== base.host.toLowerCase()) return false;
  if (link.search || link.hash) return false;
  return /^\/card\/[0-9a-z]+\.[0-9a-z]+\.[0-9a-f]{12}$/.test(link.pathname);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCardLinkEmail(input: CardLinkEmailInput): BuiltEmail {
  if (!isAcceptableCardLink(input.url, input.ownBaseUrl)) {
    // Refuse rather than mail a client a link we cannot vouch for.
    throw new Error("Refusing to email a card link that is not a Stripe Checkout URL");
  }

  const name = (input.firstName ?? "").trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";
  const salon = clientSalonName(input.salonName);
  const replacing = input.replacingExistingCard === true;

  const subject = replacing
    ? `Update your card details for ${salon}`
    : `Save your card for ${salon}`;

  // Deliberately plain: states what the link does, that nothing is charged by
  // following it, and that the salon never sees the card number. A payment
  // email that reads like a marketing email reads like a scam.
  //
  // The one loud thing is the ask itself. Lauren, 23/11/2026, after the
  // portal invite got a red "Please add your card details" box: "Can the
  // email to add card section (link have the same thing.)". Clients were
  // reading past a plain line, so it gets the same red box, and the link
  // becomes a button rather than a word in a sentence.
  const html = [
    `<p>${greeting}</p>`,
    `<div style="margin:16px 0;padding:14px 16px;border:2px solid #dc2626;border-radius:10px;background:#fef2f2"><p style="margin:0;font-size:18px;font-weight:bold;color:#dc2626">${replacing ? "Please update your card details" : "Please add your card details"}</p></div>`,
    replacing
      ? `<p>Here's a secure link to update the card we keep on file for your grooming membership.</p>`
      : `<p>Here's a secure link to save a card for your grooming membership, so we can take payment automatically instead of asking you at the counter each visit.</p>`,
    `<p style="margin:20px 0"><a href="${escapeHtml(input.url)}" style="background:#db2777;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;display:inline-block">${replacing ? "Update my card" : "Save my card"}</a></p>`,
    `<p>Following this link does not charge you anything. Your details are entered on Stripe's secure page and held by them &mdash; ${escapeHtml(salon)} never sees or stores your full card number.</p>`,
    `<p>If you weren't expecting this email, you can ignore it and nothing will change.</p>`,
    `<p>&mdash; ${escapeHtml(salon)}</p>`,
  ].join("");

  return { subject, html };
}
