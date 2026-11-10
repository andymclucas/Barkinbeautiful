/**
 * A short, signed link that opens the service agreement for one client.
 *
 * Andy, 11/11/2026: the agreement must reach everybody who has not signed
 * it in Groomigo. The portal invitation goes by email, and 238 active
 * unsigned clients have only a mobile — no email means no portal login,
 * so for them this link IS the way to sign. It opens the agreement on
 * their phone, they sign, and that is all: no account, no password.
 *
 * Same construction as server/cardLinkToken.ts, for the same reasons: it
 * goes in a text, so it is short (~22 characters of token); it carries
 * the client id and its own expiry, signed with JWT_SECRET, so there is
 * no table behind it. The HMAC is domain-separated ("agreement-link:"
 * vs "card-link:") so a card link can never be replayed as an agreement
 * link or the other way round, even though the payloads look alike.
 *
 * What it can do is narrow on purpose: record THIS client's signature on
 * an agreement currently outstanding for them. It reads nothing else.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const AGREEMENT_LINK_TTL_DAYS = 30;
const SIGNATURE_LENGTH = 12;

function secret(): string {
  const configured = (process.env.JWT_SECRET ?? "").trim();
  if (!configured) throw new Error("JWT_SECRET is not set, so an agreement link cannot be signed");
  return configured;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`agreement-link:${payload}`).digest("hex").slice(0, SIGNATURE_LENGTH);
}

export function createAgreementLinkToken(clientId: number, now: Date = new Date()): string {
  const expiresAtMinutes = Math.floor(now.getTime() / 60000) + AGREEMENT_LINK_TTL_DAYS * 24 * 60;
  const payload = `${clientId.toString(36)}.${expiresAtMinutes.toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

export type AgreementLinkTokenResult =
  | { ok: true; clientId: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function readAgreementLinkToken(token: string, now: Date = new Date()): AgreementLinkTokenResult {
  const parts = (token ?? "").trim().split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [clientPart, expiryPart, signature] = parts;
  const clientId = parseInt(clientPart, 36);
  const expiresAtMinutes = parseInt(expiryPart, 36);
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return { ok: false, reason: "malformed" };
  if (!Number.isSafeInteger(expiresAtMinutes) || expiresAtMinutes <= 0) return { ok: false, reason: "malformed" };
  const expected = sign(`${clientPart}.${expiryPart}`);
  if (signature.length !== expected.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return { ok: false, reason: "bad_signature" };
  if (expiresAtMinutes * 60000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, clientId };
}

/** The whole link, as it goes in a text. */
export function agreementLinkUrl(baseUrl: string, clientId: number, now: Date = new Date()): string {
  return `${baseUrl.replace(/\/+$/, "")}/sign/${createAgreementLinkToken(clientId, now)}`;
}
