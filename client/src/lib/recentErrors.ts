/**
 * The last few things that went wrong on this page, kept in memory so a
 * "Report a problem" can carry them (shared/issueReports.ts).
 *
 * Lauren's "it won't let me send an email" usually comes with an error the
 * app showed for two seconds and nobody wrote down. client_error_logs has
 * the serious ones, but no user column and not the ordinary refusals — "an
 * email is required" — which are exactly what a report needs. This keeps
 * both, for this tab only, and never leaves the browser unless somebody
 * sends a report.
 */
import type { IssueRecentError } from "@shared/issueReports";

const KEEP = 30;
const buffer: IssueRecentError[] = [];

export function rememberError(kind: string, message: unknown) {
  const text = String(message ?? "").trim();
  if (!text) return;
  buffer.push({ kind, message: text.slice(0, 1000), at: new Date().toISOString() });
  if (buffer.length > KEEP) buffer.splice(0, buffer.length - KEEP);
}

/** A copy, so a caller cannot reorder the buffer under the next error. */
export const recentErrors = (): IssueRecentError[] => buffer.slice();
