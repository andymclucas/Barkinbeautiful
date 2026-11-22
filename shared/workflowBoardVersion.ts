/**
 * The workflow board used to reload the whole day every 5 seconds on every
 * screen in the salon. Each reload joins pets, clients, staff, contacts,
 * notes and add-ons, and with a dozen tablets, phones and the wall display
 * open all day that alone took TiDB to ~1,000 request units a second during
 * salon hours and past its monthly spending limit (23/11/2026).
 *
 * Now each screen asks every few seconds for a fingerprint of the day — how
 * many bookings and when the newest one last changed — which reads only the
 * day's handful of rows through idx_appt_tenant_date. It reloads the board
 * when the fingerprint changes, and in full once a minute regardless, which
 * catches edits that never touch the appointment row (a pet note, a style
 * note) and two edits landing in the same second.
 */
export const WORKFLOW_BOARD_CHECK_INTERVAL_MS = 5_000;
export const WORKFLOW_BOARD_FULL_REFRESH_INTERVAL_MS = 60_000;

/** The salon day as UTC instants. AEST = UTC+10, no daylight saving. */
export function workflowBoardDayBounds(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d - 1, 14, 0, 0, 0)),
    end: new Date(Date.UTC(y, m - 1, d, 13, 59, 59, 999)),
  };
}

export function workflowBoardVersion(bookings: number, lastChanged: Date | string | null): string {
  const changedMs = lastChanged === null ? 0 : new Date(lastChanged).getTime();
  return `${Number(bookings)}:${Number.isFinite(changedMs) ? changedMs : 0}`;
}

/**
 * Whether a fresh fingerprint means the board should reload. The first one a
 * screen sees is not a change: the board loaded alongside it.
 */
export function boardVersionChanged(previous: string | undefined, next: string | undefined): boolean {
  return previous !== undefined && next !== undefined && previous !== next;
}
