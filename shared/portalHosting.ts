/**
 * Which door a page belongs to, once the client portal has its own host.
 *
 * Andy, 05/11/2026: "I really would like the entire client portal platform
 * moved to the client.barkinbeautiful.com.au URL." The reason is a client
 * who spent a week at the staff sign-in, certain her password was wrong,
 * because the only address anyone had given her was the staff one. The
 * comment on issueAccountSetupLink records the same thing happening to
 * another client before her.
 *
 * ## Why a rule rather than a prefix check
 *
 * "/portal" is not the split. Two things get it wrong:
 *
 *  - `/portal/preview/:clientId` is a STAFF screen — an admin looking at a
 *    client's portal from the client record. Sending that to the client
 *    host would hand staff a page their session cannot open.
 *  - `/portal-messages` is the staff inbox for portal messages. It starts
 *    with the five characters "/portal" and has nothing to do with the
 *    client portal, so prefix matching alone moves it to the wrong host.
 *
 * And half the client-facing pages are not under /portal at all: the Pet
 * Tracker, the photo request, the waitlist offer and the shared grooming
 * card are all links the system texts to a client.
 *
 * ## What is deliberately NOT here
 *
 * `/book`, `/join` and `/waitlist` are public entry points that may be
 * linked from the salon's own website, a Google listing or a printed card.
 * Moving those changes an address the salon advertises, which is a
 * business decision rather than a routing one. They stay on the main host
 * until somebody asks; the redirect works in both directions, so changing
 * our mind later costs one line.
 */

export type PortalAudience = "client" | "staff";

/**
 * Page trees a client is sent to. Matched on whole path segments, so
 * "/portal" never catches "/portal-messages".
 */
export const CLIENT_PATH_ROOTS: readonly string[] = [
  "/portal",
  "/track",
  "/photo",
  "/slot",
  "/card",
  // Where an owner agrees to extra work found mid-groom. Texted to them
  // while the dog is on the table, so it belongs on the client host with
  // everything else they are sent.
  "/quote",
  // The service agreement, texted to clients with no email (11/11/2026).
  // Segment-matched, so "/signup" (a salon signing up) is unaffected.
  "/sign",
];

/** Staff surface that happens to sit inside a client tree. */
export const STAFF_PATH_EXCEPTIONS: readonly string[] = [
  "/portal/preview",
];

/** Never redirected: the API, and anything that looks like a file. */
export function isRoutablePage(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname === "/api") return false;
  // An extension means an asset — index-abc123.js, a favicon, a source map.
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return !/\.[a-z0-9]+$/i.test(last);
}

function startsWithSegment(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function normalise(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? "";
  const lowered = withoutQuery.toLowerCase();
  // One trailing slash is the same page; "/" itself must survive.
  return lowered.length > 1 ? lowered.replace(/\/+$/, "") : lowered;
}

export function audienceForPath(pathname: string): PortalAudience {
  const path = normalise(pathname);
  for (const exception of STAFF_PATH_EXCEPTIONS) {
    if (startsWithSegment(path, exception)) return "staff";
  }
  for (const root of CLIENT_PATH_ROOTS) {
    if (startsWithSegment(path, root)) return "client";
  }
  return "staff";
}

export type HostRedirect = { to: string } | null;

/**
 * Where this request should actually be served, or null to leave it alone.
 *
 * Returns null — deliberately, and in this order — when:
 *
 *  - the portal host is not configured, or is the same as the app host.
 *    This is what makes the code safe to merge before the DNS exists: with
 *    VITE_PORTAL_URL unset nothing redirects and nothing changes.
 *  - the request arrived on neither host. Localhost, a Render preview and
 *    the bare onrender.com address all keep serving everything, so dev and
 *    any emergency access by IP still work.
 *  - it is not a page request.
 */
export function hostRedirectFor(input: {
  requestHost: string;
  pathAndQuery: string;
  appBaseUrl: string;
  portalBaseUrl: string;
}): HostRedirect {
  const appHost = hostOf(input.appBaseUrl);
  const portalHost = hostOf(input.portalBaseUrl);
  if (!appHost || !portalHost || appHost === portalHost) return null;

  const host = input.requestHost.toLowerCase();
  if (host !== appHost && host !== portalHost) return null;

  const path = input.pathAndQuery.split(/[?#]/)[0] ?? "/";
  if (!isRoutablePage(path)) return null;

  const wantBase = audienceForPath(path) === "client" ? input.portalBaseUrl : input.appBaseUrl;
  const wantHost = hostOf(wantBase);
  if (!wantHost || wantHost === host) return null;

  return { to: `${wantBase.replace(/\/+$/, "")}${input.pathAndQuery}` };
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
