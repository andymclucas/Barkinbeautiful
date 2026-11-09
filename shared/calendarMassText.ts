/**
 * Texting everybody booked on the day you are looking at.
 *
 * Lauren, 09/11/2026, with the diary open on Friday 13 November: "Is
 * there a way to text this days clients to let them know we are closing
 * at 12:30pm early that day. It's our xmas party girls weekend.. or do I
 * need to do it manually to each one?" And then: "would be handy - I had
 * to do this when we had the cyclone.. bulk text for random days."
 *
 * ## The engine already existed. The door did not.
 *
 * `booked_between` has been a mass-text audience since the feature was
 * written, and it is correct — Brisbane day boundaries, cancelled and
 * no-show dogs excluded, opted-out clients excluded, one row per client
 * however many dogs. With `from` and `to` set to the same day it is
 * exactly what Lauren asked for.
 *
 * What was missing is that the only way in is Communication → Messages →
 * Mass text → change the audience → type the date twice, while she is
 * standing on that day in the diary. A feature nobody can find from
 * where they are standing is a feature the salon does not have, which is
 * why she was asking whether she had to text 24 people by hand.
 *
 * So this is the rule that turns "the day on screen" into an audience.
 *
 * ## Why the week view sends to the week
 *
 * The button says "these clients", and the honest reading of that is
 * whoever is on screen. In day and agenda view that is one day; in week
 * view it is the week, which is also the cyclone case — a run of days
 * the salon is shutting.
 *
 * The off-by-one here costs real money and real messages: a week ending
 * a day late texts an extra day's clients, with no undo. Hence a pure
 * function with its own tests rather than arithmetic inline in a 6,000
 * line page.
 */

import { localCalendarDay, localCalendarDayKey } from "./localDateTime";
import { canAdministerStaff } from "./staffAdministrators";
import { canEditSection, type StaffGrant } from "./staffPermissions";

export type CalendarTextView = "day" | "week" | "agenda";

export type CalendarTextRange = { from: string; to: string };

/** How many days a week view covers. Monday through Sunday. */
export const CALENDAR_WEEK_DAYS = 7;

/**
 * The booked_between window for whatever the diary is showing.
 *
 * Both keys are "YYYY-MM-DD" on the salon's calendar, which is what the
 * audience takes and what `brisbaneExplicitRange` turns into instants.
 */
export function calendarTextRange(input: {
  viewMode: CalendarTextView;
  /** The day being shown, in day and agenda view. */
  dayKey: string;
  /** The Monday of the week being shown. */
  weekStartKey: string;
}): CalendarTextRange {
  if (input.viewMode !== "week") {
    return { from: input.dayKey, to: input.dayKey };
  }
  const start = localCalendarDay(input.weekStartKey);
  const end = new Date(start);
  // Six, not seven: Monday plus six is Sunday. Adding the full seven
  // would reach into the next Monday and text a day nobody was looking
  // at.
  end.setDate(end.getDate() + CALENDAR_WEEK_DAYS - 1);
  return { from: input.weekStartKey, to: localCalendarDayKey(end) };
}

/**
 * What the button says.
 *
 * Named off the view rather than the dates, because the dates are right
 * there on the screen above it and a button repeating them is noise.
 */
export function calendarTextLabel(viewMode: CalendarTextView): string {
  return viewMode === "week" ? "Text the week" : "Text the day";
}

/**
 * May this person send a mass text?
 *
 * Extracted 09/11/2026 when the second call site appeared. It was two
 * lines inside Messages.tsx, and copying them into the calendar is
 * exactly the shape CLAUDE.md §7 describes: `staffPortalAccess.test.ts`
 * pinned a restricted-staff route list that existed in three places and
 * only one of them was pinned.
 *
 * The server checks again on every call. This only decides whether to
 * OFFER a button that would be refused — a button that errors when
 * pressed teaches staff to distrust the screen.
 */
export function canSendMassText(
  user: { id?: number | null; email?: string | null } | null | undefined,
  grant: StaffGrant | null | undefined,
): boolean {
  return canAdministerStaff(user) || canEditSection(grant, "mass_text");
}
