/**
 * When a groomer is unavailable, and what that stops.
 *
 * Until now a blockout was decoration: the calendar drew red hatching and
 * nothing else in the system read the table, so a client could book a
 * groomer online on a day she was on leave and staff could reschedule a
 * dog onto it. These are the rules that make it mean something, kept pure
 * so they can be tested without a database or a booking.
 *
 * ## How a blockout date is stored
 *
 * `blockout_date` is a DATE LABEL, not an instant: it is written at
 * midnight UTC and its UTC year-month-day IS the Brisbane calendar date.
 * Converting it to Brisbane time shifts it ten hours into the same day
 * and reads 10:00, which looks like a time and is not one. Always compare
 * on the UTC date parts — Calendar.tsx has always done this with getUTC*,
 * and everything here matches it.
 */

/** The reasons offered when someone blocks out their own calendar. */
export const BLOCKOUT_REASONS = ["Annual leave", "Personal leave", "Other"] as const;
export type BlockoutReason = (typeof BLOCKOUT_REASONS)[number];

/**
 * A ceiling on one range, so a slip of the keyboard cannot write a
 * decade of rows. One row per day is what the table stores, and a typo in
 * a year field would otherwise insert thousands.
 */
export const MAX_BLOCKOUT_DAYS = 180;

/** The calendar date a blockout row refers to, as YYYY-MM-DD. */
export function blockoutDateKey(blockoutDate: Date | string): string {
  const d = blockoutDate instanceof Date ? blockoutDate : new Date(blockoutDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** The instant to store for a given calendar date — midnight UTC. */
export function blockoutDateValue(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/**
 * Every calendar date from start to end inclusive.
 *
 * Inclusive because "block me out 9th to 20th" means both ends; an
 * exclusive end would quietly leave the groomer bookable on her last day
 * of leave.
 *
 * Walks in UTC so it cannot lose or repeat a day: stepping a local Date
 * by 24 hours across a daylight-saving boundary does exactly that, and
 * while Brisbane has no DST, the server does not necessarily run there.
 */
export function expandDateRange(startKey: string, endKey: string): string[] {
  const start = blockoutDateValue(startKey);
  const end = blockoutDateValue(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end.getTime() < start.getTime()) return [];

  const keys: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    keys.push(blockoutDateKey(new Date(t)));
    if (keys.length > MAX_BLOCKOUT_DAYS) break;
  }
  return keys;
}

/** How many days a range covers, before deciding whether to allow it. */
export function rangeLengthInDays(startKey: string, endKey: string): number {
  const start = blockoutDateValue(startKey);
  const end = blockoutDateValue(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() < start.getTime()) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** "HH:MM" to minutes from midnight. Null for anything unparseable. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export type BlockoutRow = {
  staffId: number;
  blockoutDate: Date | string;
  isFullDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
};

export type BlockoutSlot = {
  staffId: number;
  /** Brisbane calendar date of the slot, YYYY-MM-DD. */
  dateKey: string;
  /** Minutes from Brisbane midnight. */
  startMinutes: number;
  endMinutes: number;
};

/**
 * Does this blockout stop this booking?
 *
 * Overlap is half-open on purpose: a blockout ending at 12:00 and a groom
 * starting at 12:00 do not clash. Treating them as clashing would lose a
 * usable slot on every boundary, which over a week is a lot of grooming.
 *
 * A full-day blockout covers the whole day whatever times it carries, and
 * a partial one with unreadable times is treated as a FULL day rather
 * than as no blockout at all. Someone recorded that they are away; the
 * safe failure is a booking refused, not a dog arriving to no groomer.
 */
export function blockoutCovers(row: BlockoutRow, slot: BlockoutSlot): boolean {
  if (row.staffId !== slot.staffId) return false;
  if (blockoutDateKey(row.blockoutDate) !== slot.dateKey) return false;
  if (row.isFullDay) return true;

  const from = timeToMinutes(row.startTime);
  const to = timeToMinutes(row.endTime);
  if (from === null || to === null || to <= from) return true;

  return slot.startMinutes < to && slot.endMinutes > from;
}

/** The first blockout stopping this slot, or null if the slot is free. */
export function findBlockingBlockout(rows: BlockoutRow[], slot: BlockoutSlot): BlockoutRow | null {
  return rows.find((row) => blockoutCovers(row, slot)) ?? null;
}
