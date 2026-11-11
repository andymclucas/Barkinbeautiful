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

/**
 * One attachment. The name is historical — stage 1 had only pictures — and
 * kept so the stored JSON needs no migration. A video carries its type and
 * size, because its bytes are stored in pieces (server/issueVideo.ts).
 */
export type IssueImage =
  | { key: string; kind: "screenshot" | "photo" }
  | { key: string; kind: "video"; contentType: IssueVideoType; bytes: number };

// ─── Stage 2: video ─────────────────────────────────────────────────────────

export const ISSUE_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export type IssueVideoType = (typeof ISSUE_VIDEO_TYPES)[number];
export const isIssueVideoType = (t: string): t is IssueVideoType =>
  (ISSUE_VIDEO_TYPES as readonly string[]).includes(t);
/** Raw bytes per stored piece: ~4 MB base64, safely under TiDB's ~6 MB row limit. */
export const ISSUE_VIDEO_CHUNK_BYTES = 3 * 1024 * 1024;
/** About a minute of phone video, or several of a screen recording. */
export const ISSUE_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
export const ISSUE_VIDEO_MAX_CHUNKS = Math.ceil(ISSUE_VIDEO_MAX_BYTES / ISSUE_VIDEO_CHUNK_BYTES);
export const ISSUE_VIDEO_KEY_PREFIX = "issue-reports/video-";
export const isIssueVideoKey = (key: string) =>
  key.startsWith(ISSUE_VIDEO_KEY_PREFIX) && /^[a-z0-9\-/.]+$/i.test(key) && !key.includes("..");
export const videoChunkCount = (bytes: number) => Math.max(1, Math.ceil(bytes / ISSUE_VIDEO_CHUNK_BYTES));

// ─── Stage 2: sorting ───────────────────────────────────────────────────────

export const ISSUE_CATEGORIES = ["bug", "request", "question"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  bug: "Bug",
  request: "Request",
  question: "Question",
};

export const ISSUE_URGENCIES = ["urgent", "normal", "low"] as const;
export type IssueUrgency = (typeof ISSUE_URGENCIES)[number];
export const ISSUE_URGENCY_LABEL: Record<IssueUrgency, string> = {
  urgent: "Urgent",
  normal: "Normal",
  low: "Low",
};

/** What Claude returns, before it is trusted. */
export type RawTriage = {
  category: string;
  urgency: string;
  summary: string;
  duplicate_of: number | null;
};

export type Triage = {
  category: IssueCategory;
  urgency: IssueUrgency;
  summary: string;
  duplicateOfId: number | null;
};

/**
 * Claude's answer, made safe to store: known labels only, a summary that
 * fits its column, and a duplicate only if it is one of the reports it was
 * actually shown — never a number it made up, and never the report itself.
 */
export function normaliseTriage(raw: RawTriage, candidateIds: readonly number[], selfId: number): Triage | null {
  if (!(ISSUE_CATEGORIES as readonly string[]).includes(raw.category)) return null;
  if (!(ISSUE_URGENCIES as readonly string[]).includes(raw.urgency)) return null;
  const summary = raw.summary.replace(/\s+/g, " ").trim();
  if (!summary) return null;
  const dup = raw.duplicate_of;
  return {
    category: raw.category as IssueCategory,
    urgency: raw.urgency as IssueUrgency,
    summary: summary.length > 200 ? summary.slice(0, 199) + "…" : summary,
    duplicateOfId: typeof dup === "number" && dup !== selfId && candidateIds.includes(dup) ? dup : null,
  };
}

const URGENCY_RANK: Record<string, number> = { urgent: 0, normal: 1, low: 2 };

/**
 * Inbox order: open reports with the most urgent first, then newest; an
 * unsorted report counts as normal so it is never buried. Closed reports
 * stay newest-first. Pure, so the order is tested rather than eyeballed.
 */
export function sortReportsForInbox<T extends { status: IssueStatus; urgency: IssueUrgency | null; createdAt: Date | string }>(
  rows: readonly T[],
): T[] {
  const time = (r: T) => new Date(r.createdAt).getTime();
  return [...rows].sort((a, b) => {
    const openA = isOpenIssue(a.status) ? 0 : 1;
    const openB = isOpenIssue(b.status) ? 0 : 1;
    if (openA !== openB) return openA - openB;
    if (openA === 0) {
      const ua = URGENCY_RANK[a.urgency ?? "normal"];
      const ub = URGENCY_RANK[b.urgency ?? "normal"];
      if (ua !== ub) return ua - ub;
    }
    return time(b) - time(a);
  });
}

// ─── Stage 2: telling the reporter ──────────────────────────────────────────

/**
 * Whether the person who sent a report has an outcome they have not seen:
 * the owners moved it on (not the reporter themselves — Andy marking his
 * own test report is not news to Andy) and they have not looked since.
 */
export function hasUnseenOutcome(r: {
  status: IssueStatus;
  reporterUserId: number;
  statusChangedAt: Date | string | null;
  statusChangedByUserId: number | null;
  reporterSeenAt: Date | string | null;
}): boolean {
  if (r.status === "new" || !r.statusChangedAt) return false;
  if (r.statusChangedByUserId === r.reporterUserId) return false;
  if (!r.reporterSeenAt) return true;
  return new Date(r.statusChangedAt).getTime() > new Date(r.reporterSeenAt).getTime();
}

/** The line the reporter sees in their bell. */
export function outcomeHeadline(status: IssueStatus): string {
  switch (status) {
    case "fixed": return "Fixed";
    case "in_progress": return "Being worked on";
    case "dismissed": return "Closed";
    default: return "Received";
  }
}

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

/**
 * The phone notification: who, and what — Claude's one-line summary when
 * sorting has run, otherwise the first line of what they said. An urgent
 * report says so in the title, where a locked phone shows it.
 */
export function issuePushText(
  reporterName: string | null | undefined,
  message: string,
  triage?: { urgency: IssueUrgency; summary: string } | null,
) {
  const who = (reporterName ?? "").trim() || "A staff member";
  const firstLine = message.trim().split(/\r?\n/)[0] ?? "";
  const text = triage?.summary || firstLine;
  const body = text.length > 140 ? text.slice(0, 139) + "…" : text;
  const title = `${triage?.urgency === "urgent" ? "URGENT — " : ""}${who} reported a problem`;
  return { title, body: body || "(no description)" };
}
