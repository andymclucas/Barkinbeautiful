/**
 * What a client's phone opens when they tap their saved Home Screen icon.
 *
 * Renee Gannon, 10/11/2026, after doing exactly what she was asked to:
 * "I deleted the previous link we saved to Home Screen. Opened new email
 * and saved that to Home Screen. I can only seem to scroll from the link
 * in the email — that physically opens. But if I try to open that same
 * link from the homescreen — it asks for password."
 *
 * ## Why it asked
 *
 * `portal.webmanifest` declared `start_url: "/portal/login"`. iOS 16.4+
 * reads the manifest when you press Add to Home Screen and uses that
 * start_url for the icon, so the icon never pointed at the page she was
 * looking at — it pointed at the account sign-in form.
 *
 * She has no account. Nor does anyone: `clients.portal_account_status`
 * defaults to "not_enabled", Renee is still on it, and the portal is
 * reached by a token in the path (`/portal/<token>`) that the salon
 * emails out. The password form is a second front door almost nobody
 * has a key to, and the icon opened that one.
 *
 * This was the SECOND thing wrong with saving the portal. The first was
 * that every page advertised the STAFF manifest, so the icon was called
 * "Groomigo" and opened the salon's own sign-in — fixed the same day,
 * which is why she was asked to delete and re-save. The icon is hers
 * now. Where it points was still wrong.
 *
 * ## The rule
 *
 * The icon opens the portal the same way her email link does: with her
 * own token. So `start_url` is the token page she is standing on when
 * she saves, and the manifest has to be built per client rather than
 * served as one static file.
 *
 * Everything here is pure so it can be tested without a browser; the
 * manifest route and the hook both read it.
 */

/** `crypto.randomBytes(32).toString("hex")` — see `createClientPortalToken`. */
export const PORTAL_ACCESS_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

/** The static manifest, for a portal page with no token in it. */
export const STATIC_PORTAL_MANIFEST_PATH = "/portal.webmanifest";

/** The staff app's own manifest. Every page outside the portal keeps it. */
export const STAFF_MANIFEST_PATH = "/manifest.webmanifest";

/**
 * Where a portal page's `start_url` should point.
 *
 * A token page points at itself. Anything else keeps `/portal/login`,
 * which is the best available answer for someone who arrived without a
 * token: they either have an account or they need to ask the salon.
 */
export function portalStartUrlFor(pathname: string): string {
  const token = portalAccessTokenIn(pathname);
  return token ? `/portal/${token}` : "/portal/login";
}

/**
 * The access token in a portal path, or null.
 *
 * Matched against the real token shape rather than "whatever is in the
 * second segment", because `/portal/login`, `/portal/card-saved` and
 * `/portal/preview/12` all have one and none of them is a token. The
 * same strictness is what makes it safe for the server to echo the
 * value straight into a JSON document.
 */
export function portalAccessTokenIn(pathname: string): string | null {
  const path = (pathname.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0]?.toLowerCase() !== "portal") {
    return null;
  }
  const candidate = segments[1] ?? "";
  return PORTAL_ACCESS_TOKEN_PATTERN.test(candidate) ? candidate : null;
}

/**
 * The manifest a portal page should advertise.
 *
 * A token page gets its own, served under the token so the token stays
 * in a path segment rather than a query string, and so the host
 * redirect leaves it alone (it ignores anything with a file extension).
 */
export function portalManifestHrefFor(pathname: string): string {
  const token = portalAccessTokenIn(pathname);
  return token
    ? `/portal/${token}/app.webmanifest`
    : STATIC_PORTAL_MANIFEST_PATH;
}

export type PortalManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }>;
};

/**
 * The portal manifest, with `start_url` pointed wherever the caller says.
 *
 * `id` stays "/portal" whatever the start_url is. It is the app's
 * identity, so pinning it to a token would make a client who is issued
 * a replacement link look like a different application to the phone.
 */
export function buildPortalManifest(startUrl: string): PortalManifest {
  return {
    id: "/portal",
    name: "Barkin' Beautiful",
    short_name: "Barkin' Beautiful",
    description:
      "Your dogs' grooming appointments, photos and bills at Barkin' Beautiful.",
    start_url: startUrl,
    scope: "/portal",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#d61572",
    icons: [
      {
        src: "/portal-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/portal-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/portal-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
