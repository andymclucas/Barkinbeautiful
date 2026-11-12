import { createHmac, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Request, Response } from "express";
import { CLIENT_PORTAL_COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

/**
 * A year, not 30 days (Andy, 12/11/2026). Clients come back every four to
 * eight weeks; a session that ran out between two grooms meant nearly
 * every visit started at a sign-in screen they could not get past.
 * Signing out, or a changed password (sessionVersion), still ends it.
 */
export const CLIENT_PORTAL_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365;

export type ClientPortalSession = {
  clientId: number;
  tenantId: number;
  sessionVersion: number;
};

function getClientPortalSessionSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Client portal sessions require JWT_SECRET");
  return new TextEncoder().encode(secret);
}

function readCookie(req: Request, name: string) {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return null;
  const prefix = `${name}=`;
  const pair = rawCookie.split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
  if (!pair) return null;
  return decodeURIComponent(pair.slice(prefix.length));
}

export async function createClientPortalSessionToken(session: ClientPortalSession) {
  const expiresAtSeconds = Math.floor((Date.now() + CLIENT_PORTAL_SESSION_TTL_MS) / 1000);
  return new SignJWT({
    typ: "client_portal",
    clientId: session.clientId,
    tenantId: session.tenantId,
    sessionVersion: session.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAtSeconds)
    .sign(getClientPortalSessionSecret());
}

export async function verifyClientPortalSessionToken(token: string | null | undefined): Promise<ClientPortalSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getClientPortalSessionSecret(), { algorithms: ["HS256"] });
    if (payload.typ !== "client_portal") return null;
    const clientId = Number(payload.clientId);
    const tenantId = Number(payload.tenantId);
    const sessionVersion = Number(payload.sessionVersion);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(tenantId) || tenantId <= 0 || !Number.isInteger(sessionVersion) || sessionVersion < 0) return null;
    return { clientId, tenantId, sessionVersion };
  } catch {
    return null;
  }
}

export async function readClientPortalSession(req: Request) {
  return verifyClientPortalSessionToken(readCookie(req, CLIENT_PORTAL_COOKIE_NAME));
}

export async function setClientPortalSessionCookie(res: Response, req: Request, session: ClientPortalSession) {
  const token = await createClientPortalSessionToken(session);
  res.cookie(CLIENT_PORTAL_COOKIE_NAME, token, {
    ...getSessionCookieOptions(req),
    maxAge: CLIENT_PORTAL_SESSION_TTL_MS,
  });
}

export function clearClientPortalSessionCookie(res: Response, req: Request) {
  res.clearCookie(CLIENT_PORTAL_COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: -1 });
}


/**
 * The "email me a sign-in link" token (12/11/2026).
 *
 * Signed, short-lived and single-use without a table: it carries the
 * client's portalLastSignedInAt as it was when the link was sent, and
 * signing in moves that on — so once one link has been used, it and any
 * other outstanding link stop matching. sessionVersion is carried too, so
 * a password change or a sign-out-everywhere kills it as it kills sessions.
 */
export const CLIENT_PORTAL_SIGNIN_TTL_MS = 15 * 60 * 1000;

export type ClientPortalSignIn = ClientPortalSession & { lastSignedInMs: number };

export async function createClientPortalSignInToken(input: ClientPortalSignIn) {
  const expiresAtSeconds = Math.floor((Date.now() + CLIENT_PORTAL_SIGNIN_TTL_MS) / 1000);
  return new SignJWT({
    typ: "client_portal_signin",
    clientId: input.clientId,
    tenantId: input.tenantId,
    sessionVersion: input.sessionVersion,
    lsi: input.lastSignedInMs,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAtSeconds)
    .sign(getClientPortalSessionSecret());
}

export async function verifyClientPortalSignInToken(token: string | null | undefined): Promise<ClientPortalSignIn | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getClientPortalSessionSecret(), { algorithms: ["HS256"] });
    if (payload.typ !== "client_portal_signin") return null;
    const clientId = Number(payload.clientId);
    const tenantId = Number(payload.tenantId);
    const sessionVersion = Number(payload.sessionVersion);
    const lastSignedInMs = Number(payload.lsi);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(tenantId) || tenantId <= 0) return null;
    if (!Number.isInteger(sessionVersion) || sessionVersion < 0 || !Number.isFinite(lastSignedInMs) || lastSignedInMs < 0) return null;
    return { clientId, tenantId, sessionVersion, lastSignedInMs };
  } catch {
    return null;
  }
}


/**
 * The six-digit code in the same email, for a phone that cannot follow the
 * link into the right place: on an iPhone a portal saved to the Home
 * Screen keeps its own sign-in, separate from Safari, and an emailed link
 * always opens Safari. Typing the code into the saved app signs THAT in.
 *
 * Derived, not stored: an HMAC of the same facts the link carries plus a
 * 15-minute window, so it dies with the link (any sign-in moves
 * lastSignedInMs on) and needs no table. The current and previous window
 * are accepted, so a code is good for 15 to 30 minutes. Guessing is
 * limited by the caller.
 */
export const SIGNIN_CODE_WINDOW_MS = 15 * 60 * 1000;

export function clientPortalSignInCode(input: ClientPortalSignIn, windowIndex: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Client portal sign-in requires JWT_SECRET");
  const digest = createHmac("sha256", secret)
    .update(`portal-code|${input.tenantId}|${input.clientId}|${input.sessionVersion}|${input.lastSignedInMs}|${windowIndex}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function signInCodeWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / SIGNIN_CODE_WINDOW_MS);
}

/** Does `code` match this client's current or previous window? Constant time. */
export function signInCodeMatches(input: ClientPortalSignIn, code: string, nowMs: number = Date.now()): boolean {
  const typed = String(code ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return false;
  const w = signInCodeWindow(nowMs);
  return [w, w - 1].some((windowIndex) => {
    const expected = Buffer.from(clientPortalSignInCode(input, windowIndex));
    const given = Buffer.from(typed);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
