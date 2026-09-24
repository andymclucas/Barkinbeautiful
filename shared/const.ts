export const COOKIE_NAME = "app_session_id";
export const CLIENT_PORTAL_COOKIE_NAME = "client_portal_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

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
