import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { asc, eq } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { salonAccess, staff } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveTenantId } from "../../shared/tenantResolution";
import { resolveActiveSalon } from "../../shared/salonAccess";
import { tenantIdForHost } from "../hostTenant";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * The salon this caller belongs to, worked out from WHO they are.
   *
   * Null for an unauthenticated request — the online booking pages and
   * the client portal are public by design and scoped by their own
   * tokens. Null must never be read as "default to 1"; that default is
   * the thing being removed.
   */
  tenantId: number | null;
  /**
   * Every salon this caller may act in.
   *
   * Almost always one. Lauren has two from 23/11/2026 — Barkin' Beautiful
   * and The Pet Pad — and the switcher in the top bar moves between them.
   *
   * Empty for an unauthenticated request. It is the list the requested
   * salon is checked against, so it must be built from the user's own
   * rows and never from anything the browser sent.
   */
  accessibleTenantIds: number[];
};

/** The salon the browser is asking to act in. Untrusted; validated below. */
const SALON_HEADER = "x-groomigo-salon";

function requestedSalon(req: CreateExpressContextOptions["req"]): number | null {
  const raw = req.headers[SALON_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    // A signed-in caller's own salon ALWAYS wins. The Host header is set
    // by whoever made the request, so resolving a tenant from it for an
    // authenticated user would let anyone read another salon's data by
    // changing one header. Host resolution is only for the public
    // surface — online booking and the client portal — which has nobody
    // signed in and no other signal to go on.
    tenantId: user
      ? await activeTenantForUser(user, requestedSalon(opts.req))
      : await tenantIdForHost(opts.req.headers.host),
    accessibleTenantIds: user ? await accessibleSalons(user) : [],
  };
}

/**
 * Every salon this user may act in.
 *
 * The union of three things, so that nothing which works today stops
 * working: an explicit salon_access grant, the salon on their user row,
 * and the salon on their staff record. An account with no grant behaves
 * exactly as it did before the table existed, which is almost every
 * account.
 *
 * Wrapped, like tenantForUser, because a context that throws takes down
 * every request including the login page. A caller who cannot be resolved
 * is survivable; a broken boot is not.
 */
export async function accessibleSalons(user: User): Promise<number[]> {
  const ids = new Set<number>();
  if (typeof user.tenantId === "number") ids.add(user.tenantId);
  const db = await getDb();

  /*
   * TWO try/catches, not one around both.
   *
   * They were together, and that made the merge order load-bearing in the
   * worst way. salon_access is created by migration 0157; merge this
   * before that runs and the first query throws, one catch swallows it,
   * and the STAFF query never executes. Lauren has users.tenant_id NULL
   * and her salon named only on her staff record — so she would resolve
   * to no salon at all and be locked out of the business she owns, which
   * is the exact person this feature is for.
   *
   * Separated, a missing salon_access costs the grants and nothing else,
   * and every account behaves as it does today. The migration should
   * still go first; this is what makes getting that wrong survivable
   * rather than an outage.
   */
  try {
    if (db) {
      const granted = await db.select({ tenantId: salonAccess.tenantId })
        .from(salonAccess).where(eq(salonAccess.userId, user.id));
      for (const row of granted) ids.add(row.tenantId);
    }
  } catch {
    // No grants readable. Their own salon still resolves below.
  }

  try {
    if (db) {
      const staffRows = await db.select({ tenantId: staff.tenantId })
        .from(staff).where(eq(staff.userId, user.id));
      for (const row of staffRows) {
        if (typeof row.tenantId === "number") ids.add(row.tenantId);
      }
    }
  } catch {
    // Fall through to whatever the user row already told us.
  }

  return [...ids].sort((a, b) => a - b);
}

/**
 * The salon THIS request acts on.
 *
 * The browser's choice is checked against what the user may actually
 * reach and discarded if it is not in it — see shared/salonAccess.ts for
 * why an unrecognised value is ignored rather than refused.
 */
export async function activeTenantForUser(
  user: User,
  requested: number | null,
): Promise<number | null> {
  const accessible = await accessibleSalons(user);
  return resolveActiveSalon({
    requested,
    accessible,
    fallback: await tenantForUser(user),
  });
}

/**
 * One extra query per authenticated request, and only when the user row
 * does not already carry the answer.
 *
 * Lauren, the owner, has users.tenant_id NULL in production and her salon
 * is named only on her staff record — so resolving strictly from the user
 * row would lock her out of her own business. Backfilling that column is
 * worth doing, but the code must not depend on it having been done.
 */
export async function tenantForUser(user: User): Promise<number | null> {
  const fromUser = resolveTenantId({ userTenantId: user.tenantId });
  if (fromUser !== null) return fromUser;

  try {
    const db = await getDb();
    if (!db) return null;
    /* Ordered, which is not tidiness. With one salon `.limit(1)` on an
       unordered read is fine; the moment Lauren has a staff row at both
       salons, which one she lands in becomes whatever the database
       returns first — and it can differ between two requests a second
       apart, with nothing to notice. */
    const [row] = await db.select({ tenantId: staff.tenantId })
      .from(staff).where(eq(staff.userId, user.id))
      .orderBy(asc(staff.tenantId)).limit(1);
    return resolveTenantId({ staffTenantId: row?.tenantId ?? null });
  } catch {
    // A context that throws takes down every request, including the
    // login page. An unresolved tenant is survivable; a broken boot is not.
    return null;
  }
}
