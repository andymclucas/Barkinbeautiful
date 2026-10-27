/**
 * Telling whether the server is serving a newer build than this page.
 *
 * The Pet Tracker display lives on a TV on the salon wall and is never
 * navigated, reloaded or closed. Nothing in the app made it fetch new
 * code: the lazy-chunk reload added on 27/10/2026 only fires when an
 * import FAILS, and a page that never changes route never imports
 * anything again. So the TV kept running whatever bundle it happened
 * to load, for as long as the browser stayed open — which is how it
 * came to show Monday's header above Tuesday's dogs.
 *
 * The marker is the hashed filename of the entry bundle, which Vite
 * changes whenever the contents change:
 *
 *     <script type="module" crossorigin src="/assets/index-CKCfpWYC.js">
 *
 * Comparing that against the one this page is running answers the
 * question without a version endpoint, a build-time constant, or
 * anything that could be forgotten when the build changes.
 */

/**
 * The entry bundle named by a page of HTML, or null.
 *
 * Null in development, where Vite serves `/src/main.tsx` unhashed —
 * which is correct, and makes the caller skip the check rather than
 * reload on every poll.
 */
export function extractBuildId(html: string): string | null {
  const match = /\/assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html);
  return match ? match[1] : null;
}

/**
 * Whether the page should reload to pick up a new build.
 *
 * Deliberately false whenever either side is unknown. A failed fetch,
 * a captive-portal login page, or a dev server all produce a missing
 * or unrecognisable id, and reloading on those would put a wall screen
 * into a loop that nobody is standing next to.
 */
export function isNewBuild(current: string | null, latest: string | null): boolean {
  if (!current || !latest) return false;
  return current !== latest;
}
