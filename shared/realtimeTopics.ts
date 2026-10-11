/**
 * Which screens go stale when something changes.
 *
 * A mutation names its own router — `workflow.updateState` is "workflow" — but
 * the screens that need rereading are rarely just that one. Moving a dog
 * through the board changes the calendar's day counts and the tracker the
 * client is watching. Taking a payment changes the appointment, the invoice
 * list and the analytics.
 *
 * So this is a dependency map, not a pass-through, and it lives here as a pure
 * function because it is business knowledge rather than plumbing: getting it
 * wrong means a groomer stares at a board that quietly stopped being true.
 *
 * Being too generous costs a refetch. Being too mean costs someone working
 * from stale data, so where it is a close call this errs towards refetching.
 */

/** The tRPC router namespace a procedure belongs to. */
export function topicForPath(path: string | null | undefined): string {
  const first = String(path ?? "").split(".")[0]?.trim();
  return first || "";
}

/**
 * Everything that should be refetched when `topic` changes, including itself.
 *
 * Only listed where a change genuinely reaches another screen. A namespace
 * with no entry invalidates only itself, which is the common case.
 */
const ALSO_STALE: Record<string, string[]> = {
  // The board and the diary are two views of one set of appointments.
  workflow: ["calendar", "tracker", "analytics", "analyticsExt"],
  calendar: ["workflow", "tracker", "analytics", "analyticsExt"],
  tracker: ["workflow", "calendar"],
  // Money moving shows up on the appointment, the invoice list and the numbers.
  payments: ["calendar", "workflow", "clients", "analytics", "analyticsExt", "stripeBilling"],
  stripeBilling: ["payments", "memberships", "clients", "analytics", "analyticsExt"],
  memberships: ["clients", "calendar", "analytics", "analyticsExt", "stripeBilling"],
  storeCredit: ["clients", "payments", "analytics", "analyticsExt"],
  retail: ["payments", "analytics", "analyticsExt"],
  // A client or pet edit is visible on every screen that names a dog.
  clients: ["calendar", "workflow", "tracker", "pets", "memberships"],
  pets: ["clients", "calendar", "workflow", "tracker", "family"],
  family: ["pets", "workflow", "calendar"],
  clientNotes: ["clients"],
  petPaperwork: ["clients", "pets"],
  agreements: ["clients"],
  clientReviews: ["clients"],
  packages: ["clients", "memberships"],
  // Staff and pricing change what the booking form offers.
  staff: ["calendar", "workflow", "settings"],
  pricing: ["calendar", "retail", "analytics"],
  settings: ["calendar", "workflow", "staff"],
  // Messaging surfaces share one unread count.
  sms: ["clientPortal", "campaigns"],
  clientPortal: ["sms", "clients"],
  campaigns: ["sms", "clients"],
  // A finished groom writes a card and moves the dog on.
  groomingReports: ["workflow", "calendar", "clients"],
  groomNotes: ["workflow", "clients"],
  groomStylePresets: ["workflow"],
  onlineBooking: ["calendar", "workflow", "clients"],
  workflowReview: ["workflow", "analytics"],
};

/**
 * The topics a client should invalidate for a change in `topic`.
 *
 * Always includes the topic itself, is deduplicated, and is sorted so two
 * callers produce an identical list — which makes it comparable in a test and
 * in a log line.
 */
export function staleTopicsFor(topic: string | null | undefined): string[] {
  const key = String(topic ?? "").trim();
  if (!key) return [];
  // Array.from, not spread: the tsconfig target downlevels iteration.
  return Array.from(new Set([key, ...(ALSO_STALE[key] ?? [])])).sort();
}

/**
 * Whether a mutation on this path should announce itself at all.
 *
 * Authentication and the portal session are per-caller: nobody else's screen
 * goes stale because one person signed in, and broadcasting it would wake
 * every tab in the salon for nothing.
 */
const SILENT = new Set(["auth", "system", "migration"]);

export function shouldBroadcast(path: string | null | undefined): boolean {
  const topic = topicForPath(path);
  return topic !== "" && !SILENT.has(topic);
}
