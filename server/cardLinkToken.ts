/**
 * A short, signed stand-in for a Stripe card-setup link.
 *
 * Lauren, 10/11/2026, texting a client a card link: "Yeah I might get it
 * manually for now... that looks hectic." The client's reply was the
 * same objection in different words — "how many texts credits does the
 * link take? It looks huge."
 *
 * Both were right. A Stripe Checkout URL carries its whole state in the
 * fragment: the one in that screenshot was 299 characters before it ran
 * off the edge of the screen, and the message around it took the whole
 * text to four segments, probably five. Measured with the app's own
 * calculateSmsCost, not estimated.
 *
 * ## It also fixes something nobody had noticed
 *
 * A Stripe Checkout session EXPIRES, 24 hours after it is made. So a
 * card link texted on Friday is dead by Saturday, and the client who
 * gets round to it on Sunday sees an error page from Stripe with the
 * salon's name on it. Nothing in the app was watching for that.
 *
 * This link makes the Stripe session when the client CLICKS, so it is
 * always fresh. The text can sit in somebody's phone for a month.
 *
 * ## Why there is no table behind it
 *
 * The token carries the client id and its own expiry, signed with the
 * server's secret. Nothing to store, nothing to clean up, and no second
 * token mechanism to keep straight — `portal_setup_token_hash` on
 * clients is for portal ACCOUNTS, and issuing one of these must not
 * disturb an outstanding portal invitation.
 *
 * The trade is that an individual link cannot be revoked before it
 * expires. What it opens is a card-entry form for one client, so the
 * harm in a leak is somebody entering their own card against the wrong
 * account; rotating JWT_SECRET invalidates every one at once if it ever
 * matters.
 */
import { createHmac, timingSafeEqual } from "crypto";

/** Long enough to outlive a text somebody gets round to next month. */
export const CARD_LINK_TTL_DAYS = 30;

/** Twelve hex characters of HMAC — 48 bits, against a server-side secret. */
const SIGNATURE_LENGTH = 12;

function secret(): string {
  const configured = (process.env.JWT_SECRET ?? "").trim();
  if (!configured) {
    /* Refuse rather than sign with a default. A predictable signature on
       a link that opens somebody's card entry is worse than the feature
       being unavailable, and the salon has JWT_SECRET set. */
    throw new Error("JWT_SECRET is not set, so a card link cannot be signed");
  }
  return configured;
}

function sign(payload: string): string {
  return createHmac("sha256", secret())
    .update(`card-link:${payload}`)
    .digest("hex")
    .slice(0, SIGNATURE_LENGTH);
}

/**
 * The token for one client, valid for CARD_LINK_TTL_DAYS.
 *
 * Base 36 throughout, because this ends up in a text message and every
 * character is a seventh of a cent across ten thousand clients.
 */
export function createCardLinkToken(
  clientId: number,
  now: Date = new Date()
): string {
  const expiresAtMinutes =
    Math.floor(now.getTime() / 60000) + CARD_LINK_TTL_DAYS * 24 * 60;
  const payload = `${clientId.toString(36)}.${expiresAtMinutes.toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

export type CardLinkTokenResult =
  | { ok: true; clientId: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/**
 * Read a token back, or say why it cannot be used.
 *
 * The reason is for the LOG and for which page the client is sent to.
 * It is never shown as-is: "bad signature" to somebody who followed a
 * link from their salon reads as an accusation.
 */
export function readCardLinkToken(
  token: string,
  now: Date = new Date()
): CardLinkTokenResult {
  const parts = (token ?? "").trim().split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [clientPart, expiryPart, signature] = parts;

  const clientId = parseInt(clientPart, 36);
  const expiresAtMinutes = parseInt(expiryPart, 36);
  if (!Number.isSafeInteger(clientId) || clientId <= 0)
    return { ok: false, reason: "malformed" };
  if (!Number.isSafeInteger(expiresAtMinutes) || expiresAtMinutes <= 0)
    return { ok: false, reason: "malformed" };

  const expected = sign(`${clientPart}.${expiryPart}`);
  /* Constant time, so the signature cannot be guessed a character at a
     time by timing the responses. Both are the same length by
     construction; a different length is simply wrong. */
  if (signature.length !== expected.length)
    return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, reason: "bad_signature" };
  }

  if (expiresAtMinutes * 60000 <= now.getTime())
    return { ok: false, reason: "expired" };
  return { ok: true, clientId };
}

/** The whole link, as it goes in a text. */
export function cardLinkUrl(
  baseUrl: string,
  clientId: number,
  now: Date = new Date()
): string {
  return `${baseUrl.replace(/\/+$/, "")}/card/${createCardLinkToken(clientId, now)}`;
}
