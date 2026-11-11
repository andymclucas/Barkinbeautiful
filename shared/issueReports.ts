/**
 * "Report a problem" — the rules both sides share.
 *
 * Andy, 11/11/2026: "How can I better deal with the issues that come
 * through from Lauren and the team?" Screenshots in a chat lose the one
 * thing that makes a report quick to act on: which screen, which client,
 * which dog, and what the app actually said. A report sent from inside
 * Groomigo carries all of that without anybody typing it.
 *
 * Stage 1: any staff login reports; Lauren and Andy (canAdministerStaff)
 * work through an inbox; Claude can pull the open queue into a session
 * (scripts/issue-queue.ts). Stage 2 adds video, automatic sorting, and
 * telling the reporter when it is fixed.
 */

export const ISSUE_STATUSES = ["new", "in_progress", "fixed", "dismissed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  new: "New",
  in_progress: "Working on it",
  fixed: "Fixed",
  dismissed: "Dismissed",
};

/** Still somebody's job. */
export const OPEN_ISSUE_STATUSES: readonly IssueStatus[] = ["new", "in_progress"];
export const isOpenIssue = (status: IssueStatus) => OPEN_ISSUE_STATUSES.includes(status);

export const ISSUE_MESSAGE_MAX = 4000;
/** Photos the person attaches, not counting the automatic screenshot. */
export const ISSUE_MAX_PHOTOS = 6;
/** Errors kept from the page, newest last. */
export const ISSUE_MAX_RECENT_ERRORS = 10;
/** How far back an error still counts as "just happened". */
export const ISSUE_RECENT_ERROR_WINDOW_MS = 15 * 60 * 1000;

export type IssueImage = { key: string; kind: "screenshot" | "photo" };

export type IssueRecentError = {
  kind: string;
  message: string;
  /** ISO timestamp, from the reporter's device. */
  at: string;
};

/** What the screen was showing, read from its address. */
export type IssueContext = {
  clientId?: number;
  petId?: number;
  appointmentId?: number;
  staffId?: number;
  /** The diary day, "YYYY-MM-DD", when the page has one. */
  date?: string;
  /** The raw query string, kept whole: a param nobody planned for is still evidence. */
  search?: string;
  viewport?: string;
  userAgent?: string;
};

const positiveInt = (raw: string | null | undefined): number | undefined => {
  if (!raw || !/^\d{1,10}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n > 0 ? n : undefined;
};

/** Query parameters that name a record, under the spellings the app uses. */
const PARAM_IDS: ReadonlyArray<[keyof IssueContext, readonly string[]]> = [
  ["clientId", ["clientId", "client"]],
  ["petId", ["petId", "pet"]],
  ["appointmentId", ["appointmentId", "appointment", "appt"]],
  ["staffId", ["staffId", "staff"]],
];

/**
 * The records a staff page is about, from its path and query string.
 * `/clients/1162` is client 1162; `/staff/review/7` is staff 7;
 * `?appointment=3000002` is that booking; `?date=2026-11-12` is the day.
 */
export function issueContextFromLocation(pathname: string, search: string): IssueContext {
  const context: IssueContext = {};
  const path = pathname.split("?")[0] ?? "";

  const client = /^\/clients\/(\d+)(?:\/|$)/.exec(path);
  if (client) context.clientId = positiveInt(client[1]);
  const staffReview = /^\/staff\/review\/(\d+)(?:\/|$)/.exec(path);
  if (staffReview) context.staffId = positiveInt(staffReview[1]);

  const query = search.startsWith("?") ? search.slice(1) : search;
  if (query) {
    const params = new URLSearchParams(query);
    for (const [field, names] of PARAM_IDS) {
      if (context[field] !== undefined) continue;
      for (const name of names) {
        const id = positiveInt(params.get(name));
        if (id !== undefined) {
          (context as Record<string, unknown>)[field] = id;
          break;
        }
      }
    }
    const date = params.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) context.date = date;
    context.search = "?" + query.slice(0, 500);
  }
  return context;
}

/** Keep only recent errors, newest last, capped. Pure so it can be tested. */
export function recentIssueErrors(
  errors: readonly IssueRecentError[],
  now: number,
): IssueRecentError[] {
  return errors
    .filter((e) => {
      const t = Date.parse(e.at);
      return Number.isFinite(t) && now - t <= ISSUE_RECENT_ERROR_WINDOW_MS && t <= now + 60_000;
    })
    .slice(-ISSUE_MAX_RECENT_ERRORS)
    .map((e) => ({ kind: e.kind.slice(0, 40), message: e.message.slice(0, 500), at: e.at }));
}

/** An image key this feature wrote — never a key belonging to another feature. */
export const ISSUE_IMAGE_KEY_PREFIX = "issue-reports/";
export const isIssueImageKey = (key: string) =>
  key.startsWith(ISSUE_IMAGE_KEY_PREFIX) && /^[a-z0-9\-/.]+$/i.test(key) && !key.includes("..");

/**
 * A path inside this app: starts with one "/", no scheme, no "//host",
 * no whitespace or backslash. The inbox turns a report's page into a link
 * an owner clicks, and the page comes from the reporter's browser, so it
 * is checked on the way in AND before it is rendered.
 */
export const isSafeAppPath = (path: string) => /^\/(?![\/\\])[^\s\\]*$/.test(path) && path.length <= 512;
/** A query string for such a path: "?..." with no whitespace. */
export const isSafeQuery = (search: string) => /^\?[^\s\\]*$/.test(search) && search.length <= 600;

/** The phone notification: who, and the first line of what they said. */
export function issuePushText(reporterName: string | null | undefined, message: string) {
  const who = (reporterName ?? "").trim() || "A staff member";
  const firstLine = message.trim().split(/\r?\n/)[0] ?? "";
  const body = firstLine.length > 140 ? firstLine.slice(0, 139) + "…" : firstLine;
  return { title: `${who} reported a problem`, body: body || "(no description)" };
}
