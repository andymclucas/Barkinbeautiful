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
