/**
 * How often an authenticated request may rewrite users.lastSignedIn.
 *
 * It was written on every request, which with the workflow board polling
 * every few seconds on a dozen screens was the most-run statement in the
 * database (23/11/2026). Nothing reads it more precisely than "recently".
 */
export const SIGN_IN_TOUCH_INTERVAL_MS = 5 * 60_000;

export function shouldRecordSignIn(lastSignedIn: Date | string | null, now: Date): boolean {
  if (lastSignedIn === null) return true;
  const last = new Date(lastSignedIn).getTime();
  if (!Number.isFinite(last)) return true;
  // A clock skewed into the future must not freeze the value for good.
  if (last > now.getTime()) return true;
  return now.getTime() - last >= SIGN_IN_TOUCH_INTERVAL_MS;
}
