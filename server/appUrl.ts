import { PRODUCTION_APP_URL } from "@shared/const";

/**
 * Single source of truth for the base URL of every client-facing link.
 *
 * WHY THIS EXISTS
 *
 * Eight call sites used to inline this fallback:
 *
 *   process.env.VITE_APP_URL ?? "https://groomingsos-mqzfsvzv.manus.space"
 *
 * That host is the decommissioned Manus deployment. When VITE_APP_URL was unset
 * or misspelled, password-reset emails, Pet Tracker SMS, staff invitations and
 * campaign unsubscribe links all pointed at a dead domain — and nothing was
 * logged, so the failure was invisible until a customer complained. Commit
 * a238972 fixed one round of exactly this.
 *
 * DESIGN CHOICE: warn loudly, do not throw.
 *
 * Throwing at boot would turn a misconfiguration into a total outage for a live
 * salon. Instead we fall back to the real production origin and make the
 * misconfiguration extremely visible in the logs. A slightly-wrong base URL on a
 * preview environment is recoverable; a downed booking system on a Saturday is
 * not.
 */

let warnedMissing = false;
let warnedInvalid = false;

function normalise(raw: string): string {
  // Trailing slashes would produce `//track/abc` in interpolated links.
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Returns the configured public base URL with no trailing slash.
 *
 * Falls back to PRODUCTION_APP_URL, logging an error the first time it has to.
 */
export function getAppBaseUrl(): string {
  const configured = process.env.VITE_APP_URL;

  if (configured && configured.trim()) {
    const normalised = normalise(configured);
    try {
      const parsed = new URL(normalised);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return normalised;
      }
      if (!warnedInvalid) {
        warnedInvalid = true;
        console.error(
          `[appUrl] VITE_APP_URL has unsupported protocol "${parsed.protocol}" — ` +
            `falling back to ${PRODUCTION_APP_URL}. Client-facing links may be wrong.`,
        );
      }
    } catch {
      if (!warnedInvalid) {
        warnedInvalid = true;
        console.error(
          `[appUrl] VITE_APP_URL is not a valid URL (got "${configured}") — ` +
            `falling back to ${PRODUCTION_APP_URL}. Client-facing links may be wrong.`,
        );
      }
    }
    return PRODUCTION_APP_URL;
  }

  if (!warnedMissing) {
    warnedMissing = true;
    console.error(
      `[appUrl] VITE_APP_URL is not set — falling back to ${PRODUCTION_APP_URL}. ` +
        `Set VITE_APP_URL in the environment so password-reset, Pet Tracker, ` +
        `staff-invitation and unsubscribe links are correct.`,
    );
  }
  return PRODUCTION_APP_URL;
}

/**
 * Logs the resolved base URL at startup so a misconfiguration is obvious in the
 * deploy log rather than discovered via a customer's dead link.
 */
export function logAppUrlConfiguration(): void {
  const configured = process.env.VITE_APP_URL;
  if (configured && configured.trim()) {
    console.log(`[appUrl] Client-facing links will use ${getAppBaseUrl()}`);
  } else {
    // getAppBaseUrl() emits the detailed error itself.
    getAppBaseUrl();
  }
}
