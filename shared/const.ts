export const COOKIE_NAME = "app_session_id";
export const CLIENT_PORTAL_COOKIE_NAME = "client_portal_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// One-time nonce cookie that binds an OAuth login to the browser that started
// it. The `__Host-` prefix forces the cookie host-only (Secure, Path=/, no
// Domain), so a sibling *.manus.space site cannot plant a matching value in a
// victim's browser.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. Defined here so the client encoder and server decoder never drift.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};

// Canonical public origin of the live staff app. Used as the LAST-RESORT base
// for client-facing links when VITE_APP_URL is not configured.
//
// It exists because the previous fallback was the decommissioned Manus host
// `https://groomingsos-mqzfsvzv.manus.space`, which silently produced dead
// links in password-reset emails, Pet Tracker SMS, staff invitations and
// campaign unsubscribe links (see commit a238972, and CLAUDE.md §8).
//
// Always prefer the configured VITE_APP_URL. Read it via `getAppBaseUrl()` in
// server/appUrl.ts, which logs loudly whenever it has to fall back to this.
export const PRODUCTION_APP_URL = "https://staff.barkinbeautiful.com.au";
