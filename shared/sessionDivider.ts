/**
 * The line that splits the grooming day in two.
 *
 * Lauren, 29/10/2026: "Can we please request a red line at the start of
 * the 11:30am dogs as that's the start of the afternoon session. Our
 * goal is to divide the day. Today turned to shit cause too many were
 * booked in the morning."
 *
 * It is a booking aid, not a rule: nothing stops anyone booking across
 * it. The point is that whoever is filling the diary can see the shape
 * of the day while they do it, which is the part that was missing.
 *
 * NOT yet a per-salon setting. 11:30 is Barkin' Beautiful's split and
 * means nothing at another salon, so this belongs in `tenants`
 * alongside the other per-salon config. That needs a migration, and a
 * migration has to land before the code that reads the column (see
 * CLAUDE.md §6), so the constant lives here in ONE place until then
 * rather than being spelled into the calendar.
 */
export const AFTERNOON_SESSION_START = { hour: 11, minute: 30 } as const;

export const AFTERNOON_SESSION_LABEL = "Afternoon";

/**
 * Where to draw it, in pixels down the grid — or null when the split
 * falls outside the hours the calendar is showing.
 *
 * Returning null rather than a clamped number on purpose: a line pinned
 * to the top or bottom edge of the grid would read as "the afternoon
 * starts at 7am", which is worse than no line at all.
 */
export function sessionDividerTop(opts: {
  dayStartHour: number;
  dayEndHour: number;
  hourHeight: number;
  split?: { hour: number; minute: number };
}): number | null {
  const split = opts.split ?? AFTERNOON_SESSION_START;
  const hours = split.hour + split.minute / 60;
  if (hours < opts.dayStartHour || hours > opts.dayEndHour) return null;
  return (hours - opts.dayStartHour) * opts.hourHeight;
}

/**
 * Minutes past local midnight, in the salon's timezone.
 *
 * Via Intl rather than `getHours()`, which reads the viewer's machine.
 * A groomer checking the board from a phone still on UK time would
 * otherwise see the divider in a different place from the salon iPad
 * standing next to them (`e6a4662` is the same bug on reminders).
 */
export function minutesIntoLocalDay(
  value: Date | string | number,
  timeZone: string = "Australia/Brisbane",
): number | null {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export type SessionDividerRow = {
  id: number;
  scheduledStart: Date | string | number;
  petFamilyGroupId?: number | null;
};

/**
 * Which row the afternoon starts at, for a LIST rather than a grid.
 *
 * The calendar can put the line at a pixel offset; the workflow board
 * is a table, so the line goes between two rows and the only question
 * is which pair.
 *
 * It measures a row by its COHORT's time, not its own. `groupFamilyWorkflowRows`
 * anchors a family to its earliest member and keeps the siblings
 * adjacent, so a pair booked 11:00 and 11:45 both sit at the 11:00
 * anchor. Measuring each dog separately would put the divider between
 * them — through the middle of the bracket that says they go home
 * together.
 *
 * Null when the line would say nothing: no afternoon dogs, no morning
 * dogs, or an empty board. A line above the first row does not divide
 * anything.
 */
type SessionOpts = { timeZone?: string; split?: { hour: number; minute: number } };

/**
 * Which session each row belongs to, by its family cohort's time.
 *
 * The one place that decides. The divider's position and the session
 * counts both read this, so a board cannot show five dogs above the
 * line and call it four.
 */
function sessionOf(rows: readonly SessionDividerRow[], opts: SessionOpts): ("morning" | "afternoon" | "unknown")[] {
  const split = opts.split ?? AFTERNOON_SESSION_START;
  const cutoff = split.hour * 60 + split.minute;

  const anchors = new Map<number, number>();
  for (const row of rows) {
    const family = row.petFamilyGroupId;
    if (family == null) continue;
    const at = new Date(row.scheduledStart).getTime();
    if (Number.isNaN(at)) continue;
    anchors.set(family, Math.min(anchors.get(family) ?? at, at));
  }

  return rows.map((row) => {
    const family = row.petFamilyGroupId;
    const when = family != null && anchors.has(family) ? anchors.get(family)! : row.scheduledStart;
    const minutes = minutesIntoLocalDay(when, opts.timeZone);
    if (minutes === null) return "unknown";
    return minutes >= cutoff ? "afternoon" : "morning";
  });
}

export function afternoonSessionRowIndex(
  rows: readonly SessionDividerRow[],
  opts: SessionOpts = {},
): number | null {
  const index = sessionOf(rows, opts).indexOf("afternoon");
  /* 0 means every dog is in the afternoon; -1 means none is. Neither
     divides a day. */
  return index <= 0 ? null : index;
}

/**
 * How many dogs are in each half of the day.
 *
 * Lauren, 29/10/2026, on why the line exists at all: "Our goal is to
 * divide the day. Today turned to shit cause too many were booked in
 * the morning." The line shows WHERE the split falls; this is the
 * number that says whether the day is actually balanced, which is the
 * thing she was trying to judge.
 *
 * `unknown` is counted separately rather than folded into the morning.
 * A dog with an unreadable time is not evidence about either session,
 * and silently adding it to one would overstate that half.
 */
export function sessionDogCounts(
  rows: readonly SessionDividerRow[],
  opts: SessionOpts = {},
): { morning: number; afternoon: number; unknown: number; total: number } {
  const sessions = sessionOf(rows, opts);
  return {
    morning: sessions.filter((s) => s === "morning").length,
    afternoon: sessions.filter((s) => s === "afternoon").length,
    unknown: sessions.filter((s) => s === "unknown").length,
    total: rows.length,
  };
}
