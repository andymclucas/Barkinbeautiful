import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { staff } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveTenantId } from "../../shared/tenantResolution";
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
};

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
    tenantId: user ? await tenantForUser(user) : null,
  };
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
async function tenantForUser(user: User): Promise<number | null> {
  const fromUser = resolveTenantId({ userTenantId: user.tenantId });
  if (fromUser !== null) return fromUser;

  try {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select({ tenantId: staff.tenantId })
      .from(staff).where(eq(staff.userId, user.id)).limit(1);
    return resolveTenantId({ staffTenantId: row?.tenantId ?? null });
  } catch {
    // A context that throws takes down every request, including the
    // login page. An unresolved tenant is survivable; a broken boot is not.
    return null;
  }
}
