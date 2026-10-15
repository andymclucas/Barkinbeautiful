/**
 * Asking a client for a photo, when the phone network will not carry one.
 *
 * A client whose dog came back with a cut tries to text a picture. It does
 * not arrive: the inbound webhook reads only the message body, and Twilio's
 * own documentation disagrees with itself about whether Australian numbers
 * can receive MMS at all. Today that ends with a staff member giving out a
 * personal mobile number, and the evidence lands on somebody's phone
 * instead of in the client's record.
 *
 * So the salon sends a link instead. The client taps it, picks a photo,
 * and it arrives against their record. No app, no login, no carrier
 * feature — a web form, which every phone has.
 *
 * The rules here are the ones that keep a link that travels by SMS safe:
 * it expires, it can be revoked, and it will not accept photos forever.
 */

import crypto from "crypto";
import { calculateSmsCost } from "./smsSegments";

/**
 * A week. Long enough that a client who reads the text on Monday and
 * remembers on Saturday is still fine, short enough that a link
 * forwarded on or left in a message thread stops working.
 */
export const CLIENT_PHOTO_REQUEST_TTL_DAYS = 7;

/**
 * Enough for a client to show a cut from three angles and think better of
 * one of them. It is a bound on abuse, not a quota to ration — the number
 * is high enough that no honest client will meet it.
 */
export const MAX_PHOTOS_PER_REQUEST = 10;

/**
 * 128 bits, as 32 hex characters, NOT the 64 the portal tokens use.
 *
 * This one has to fit in a text message beside a domain and a sentence.
 * A 64-character token pushes a one-segment message to two, and every
 * photo request the salon sends would cost twice what it needs to for
 * entropy nobody can brute-force either way: guessing a 128-bit token
 * inside its seven-day life is not a thing that happens.
 */
export function createClientPhotoToken(now: Date = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(16).toString("hex");
  return {
    token,
    tokenHash: hashClientPhotoToken(token),
    expiresAt: new Date(now.getTime() + CLIENT_PHOTO_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Only the hash is stored, so a database copy cannot be used to upload. */
export function hashClientPhotoToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type PhotoRequestRow = {
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
  uploadCount: number;
};

export type PhotoRequestState =
  | { ok: true; remaining: number }
  | { ok: false; reason: "expired" | "revoked" | "spent"; message: string };

/**
 * Can this link still take a photo?
 *
 * Revoked is checked before expired: a staff member who withdrew a link
 * should be told it was withdrawn, not that it timed out.
 *
 * The messages are read by a client on their phone, so they say what to
 * do next rather than naming a state.
 */
export function photoRequestState(row: PhotoRequestRow, now: Date = new Date()): PhotoRequestState {
  if (row.revokedAt) {
    return { ok: false, reason: "revoked", message: "This photo link has been turned off. Please contact the salon." };
  }
  const expires = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired", message: "This photo link has expired. Please ask the salon for a new one." };
  }
  if (row.uploadCount >= MAX_PHOTOS_PER_REQUEST) {
    return {
      ok: false,
      reason: "spent",
      message: `You have already sent ${MAX_PHOTOS_PER_REQUEST} photos. Please contact the salon if you need to send more.`,
    };
  }
  return { ok: true, remaining: MAX_PHOTOS_PER_REQUEST - row.uploadCount };
}

/** Where the client taps. Built from the app base URL by the caller. */
export function clientPhotoUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/photo/${token}`;
}

/**
 * The text the client receives.
 *
 * Deliberately short. The URL is already about 75 characters, so there is
 * roughly half a segment to work with, and a second segment doubles the
 * cost of every photo request the salon ever sends.
 *
 * The obvious extra sentence — "photos texted back to this number do not
 * reach us" — is NOT here, though it is the reason the link exists. It
 * costs 76 characters, which takes the message to two segments and
 * doubles the price of every photo request the salon ever sends. The
 * landing page says it instead, to a client who has already tapped.
 */
export function photoRequestSms(salonName: string, url: string): string {
  return `${salonName}: tap to send us a photo ${url} (link works for ${CLIENT_PHOTO_REQUEST_TTL_DAYS} days)`;
}

/** What the message will cost to send, for a caller that wants to check. */
export function photoRequestSmsCost(salonName: string, url: string) {
  return calculateSmsCost(photoRequestSms(salonName, url));
}
