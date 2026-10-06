/**
 * Resolving a salon from the hostname a request arrived at.
 *
 * Only ever used when there is NO authenticated user. The Host header is
 * set by whoever makes the request, so trusting it for a signed-in caller
 * would let anyone read another salon's data by changing one header. See
 * createContext: a user's own tenant always wins.
 *
 * Cached, because this runs on every unauthenticated request — the online
 * booking page, the client portal, every asset-less API call — and the
 * answer changes only when a salon is created or renamed. A minute is
 * long enough to matter under load and short enough that nobody waits on
 * a new salon going live.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { hostTenantKey, normaliseHost } from "../shared/hostTenant";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { tenantId: number | null; at: number }>();

/** The platform domain salons get a subdomain of, e.g. groomigo.com. */
export function platformDomain(): string | null {
  return process.env.PLATFORM_DOMAIN?.trim() || null;
}

/**
 * Which salon this hostname belongs to, or null if it names none.
 *
 * Null is NOT "tenant 1". Callers decide what to do with an unknown host;
 * quietly serving the first salon's data to an unrecognised hostname is
 * precisely the bug this whole change exists to remove.
 */
export async function tenantIdForHost(rawHost: string | null | undefined): Promise<number | null> {
  const host = normaliseHost(rawHost);
  if (!host) return null;

  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tenantId;

  const key = hostTenantKey(host, platformDomain());
  let tenantId: number | null = null;

  try {
    const db = await getDb();
    if (db && key) {
      if (key.kind === "slug") {
        const [row] = await db.select({ id: tenants.id }).from(tenants)
          .where(eq(tenants.slug, key.slug)).limit(1);
        tenantId = row?.id ?? null;
      } else {
        const [row] = await db.select({ id: tenants.id }).from(tenants)
          .where(eq(tenants.customDomain, key.domain)).limit(1);
        tenantId = row?.id ?? null;
      }
    }
  } catch (error) {
    // A lookup failure must not take the booking page down. The caller
    // falls back to its existing behaviour.
    console.error("[host] tenant lookup failed for", host, error);
    return null;
  }

  cache.set(host, { tenantId, at: Date.now() });
  return tenantId;
}

/** Forget a cached hostname — for when a salon's domain or slug changes. */
export function forgetHostTenant(rawHost?: string | null) {
  const host = normaliseHost(rawHost);
  if (host) cache.delete(host);
  else cache.clear();
}
