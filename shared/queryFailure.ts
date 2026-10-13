/**
 * Telling a failed request apart from an empty one.
 *
 * Nearly every screen in this app reads `const { data } = useQuery(...)` and
 * then renders an empty state when `data` is undefined. 115 of 123 call
 * sites never look at `isError`. So a query that 500s is indistinguishable,
 * on screen, from a day with no bookings.
 *
 * That is not hypothetical. The Net sales chart said "No sales in this
 * period" from the day it shipped because its query was rejected by TiDB
 * every single time; the tile beside it showed $17,597.50 the whole while.
 * Nobody could have known from looking. The ready-for-pickup SMS and the
 * staff route guard failed the same quiet way.
 *
 * The fix is in two halves. This module is the decision — which failures
 * are worth telling somebody about, and what to say — kept pure so it can
 * be tested. main.tsx does the shouting, and reports to the same
 * `client_error_logs` table the window error handler already uses, so a
 * failure that nobody reports verbally still turns up in a query.
 */

/** tRPC's error shape, as much of it as matters here. */
export type QueryFailure = {
  message?: string | null;
  /** e.g. "analyticsExt.netSalesPerformance". */
  path?: string | null;
  httpStatus?: number | null;
};

/**
 * Not worth reporting: the user is being bounced to the login page anyway,
 * and on an expired session every query in flight fails at once. Reporting
 * those would bury the real failures under a dozen rows per logout.
 */
export const UNAUTHORIZED_MESSAGE = "UNAUTHORIZED";

export function isAuthFailure(failure: QueryFailure, unauthedMessage: string): boolean {
  const message = failure.message ?? "";
  return (
    message === unauthedMessage ||
    message === UNAUTHORIZED_MESSAGE ||
    failure.httpStatus === 401 ||
    failure.httpStatus === 403
  );
}

/** "Net sales performance" from "analyticsExt.netSalesPerformance". */
export function describeQueryPath(path: string | null | undefined): string {
  const last = (path ?? "").split(".").pop() ?? "";
  if (last === "") return "Some data";
  // getMembershipCoverage -> Membership coverage
  const words = last
    .replace(/^(get|list|fetch|load)/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words === "" ? "Some data" : words.charAt(0).toUpperCase() + words.slice(1);
}

export type FailureNotice = {
  /** Whether to tell the user and record it. */
  report: boolean;
  /** One line, aimed at a groomer mid-shift, not at a developer. */
  message: string;
  /** Groups repeats so a batch of eleven failures is one notice. */
  key: string;
};

/**
 * What to do about one failed query.
 *
 * The wording avoids blaming the salon's internet, because it usually is
 * not: a 500 is this app's fault and saying "check your connection" sends
 * somebody to reboot a router over a bug.
 */
export function failureNotice(failure: QueryFailure, unauthedMessage: string): FailureNotice {
  if (isAuthFailure(failure, unauthedMessage)) {
    return { report: false, message: "", key: "auth" };
  }
  const what = describeQueryPath(failure.path);
  return {
    report: true,
    message: `${what} could not be loaded. It is not empty — something went wrong fetching it.`,
    key: failure.path ?? failure.message ?? "unknown",
  };
}

/**
 * Has this failure already been reported recently?
 *
 * A dashboard fires eleven queries in one batch. When the server is
 * unwell they fail together, and eleven toasts stacked on a phone is worse
 * than none — staff learn to dismiss them without reading. One per
 * distinct failure per window.
 *
 * Takes the clock rather than reading it, so the test does not sleep.
 */
export function shouldAnnounce(
  seen: Map<string, number>,
  key: string,
  now: number,
  windowMs = 30_000,
): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  seen.set(key, now);
  return true;
}
