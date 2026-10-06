/**
 * Working out which salon a request is about from the hostname.
 *
 * The last piece of the single-salon assumption. Every authenticated call
 * now takes its tenant from the signed-in user, but the PUBLIC surface —
 * the online booking page and the client portal — has no user to resolve
 * from. Those 23 procedures still fall back to tenant 1, which is correct
 * only while there is one salon.
 *
 * A client booking with Barkin' Beautiful arrives at a hostname that says
 * who they are, and that is the only signal available. So:
 *
 *   barkin-beautiful.groomigo.com   -> the slug, on the platform domain
 *   staff.barkinbeautiful.com.au    -> a salon's own domain, looked up
 *
 * ## This is caller-controlled input
 *
 * The Host header is set by whoever makes the request, so this may ONLY
 * be used where there is no authenticated user. A signed-in caller's own
 * tenant always wins — otherwise anyone could read another salon's data
 * by sending a different Host. See createContext.
 */

export type HostTenantKey =
  /** A subdomain of the platform domain; the first label is the slug. */
  | { kind: "slug"; slug: string }
  /** Anything else — a salon's own domain, to be looked up as written. */
  | { kind: "domain"; domain: string }
  /** Nothing usable: localhost, an IP, a bare platform domain. */
  | null;

/** Hosts that never identify a salon, however they are configured. */
const NEVER_A_TENANT = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "::1"]);

/**
 * Subdomains of the platform domain that are the platform itself rather
 * than a salon. `app.groomigo.com` must not look up a salon called "app".
 */
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "staff", "status", "docs", "help", "support",
  "mail", "smtp", "cdn", "assets", "static", "dev", "staging", "test", "demo",
]);

/** Strip port, case, trailing dot and any leading `www.`. */
export function normaliseHost(rawHost: string | null | undefined): string | null {
  if (!rawHost) return null;
  let host = rawHost.trim().toLowerCase();
  // An IPv6 literal keeps its brackets; a port is only ever after them.
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close !== -1) host = host.slice(0, close + 1);
  } else {
    const colon = host.indexOf(":");
    if (colon !== -1) host = host.slice(0, colon);
  }
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return null;
  return host;
}

/**
 * What to look the salon up by, given a hostname and the platform domain.
 *
 * `platformDomain` is the domain salons get a subdomain of — groomigo.com.
 * Null or empty means no platform domain is configured, so every host is
 * treated as a salon's own domain.
 */
export function hostTenantKey(
  rawHost: string | null | undefined,
  platformDomain: string | null | undefined,
): HostTenantKey {
  const host = normaliseHost(rawHost);
  if (!host) return null;
  if (NEVER_A_TENANT.has(host)) return null;
  // A bare IPv4 address identifies a server, never a salon.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  // `*.localhost` is a development convenience and resolves like the
  // platform domain, so a developer can work on a specific salon.
  if (host.endsWith(".localhost")) {
    const slug = host.slice(0, -".localhost".length);
    return slug && !RESERVED_SLUGS.has(slug) ? { kind: "slug", slug } : null;
  }

  const platform = normaliseHost(platformDomain);
  if (platform && host !== platform && host.endsWith(`.${platform}`)) {
    const prefix = host.slice(0, -(platform.length + 1));
    // Only a single label. `a.b.groomigo.com` is not salon "a.b"; it is
    // something unexpected, and guessing is worse than declining.
    if (!prefix || prefix.includes(".")) return null;
    if (RESERVED_SLUGS.has(prefix)) return null;
    return { kind: "slug", slug: prefix };
  }

  // The platform domain itself is the marketing site, not a salon.
  if (platform && host === platform) return null;

  return { kind: "domain", domain: host };
}

/** Is this a slug a salon could legitimately be given? */
export function isUsableSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

export const RESERVED_TENANT_SLUGS = RESERVED_SLUGS;
