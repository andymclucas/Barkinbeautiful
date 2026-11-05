/**
 * The token an owner answers a quote with.
 *
 * Separate from shared/groomQuote.ts so the rules there stay importable by
 * the client bundle without dragging node:crypto in behind them.
 *
 * 128 bits of randomness, stored as SHA-256 and never in the clear — the
 * same shape as the waitlist offer token, and for the same reason: the link
 * travels by SMS and sits in the owner's message thread indefinitely, so a
 * database copy must not be enough to answer somebody else's quote.
 *
 * It is a bearer token with no sign-in behind it, which is deliberate. The
 * dog is on the table and the groomer needs an answer in minutes; putting a
 * portal login in front of that is how the answer never comes. The exposure
 * is bounded by the four-hour expiry and by what the token can do, which is
 * approve or decline one named piece of work at one frozen price.
 */
import crypto from "crypto";

/** 32 lowercase hex characters, matching the waitlist token's shape. */
export const QUOTE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function hashQuoteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createQuoteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(16).toString("hex");
  return { token, tokenHash: hashQuoteToken(token) };
}
