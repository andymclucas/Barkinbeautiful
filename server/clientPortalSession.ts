import { jwtVerify, SignJWT } from "jose";
import type { Request, Response } from "express";
import { CLIENT_PORTAL_COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

export const CLIENT_PORTAL_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

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
