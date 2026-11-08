/**
 * `/calendar?date=YYYY-MM-DD` — opening the diary on a particular day.
 *
 * Andy, 09/11/2026, with a screen recording: "When clicking on an appt
 * in the global search, it doesn't take the user to the correct date.
 * Just lands on today."
 *
 * The search was already building the right link. `appointmentHref` in
 * shared/globalSearch.ts has returned `/calendar?date=2026-11-03` since
 * the feature was written, and `globalSearch.test.ts` asserts it. What
 * was missing is the other half: nothing on the calendar ever read the
 * parameter, so every result for a future booking opened today's board
 * and the dog was not on it.
 *
 * ## Why not `new Date(raw)`
 *
 * "2026-11-03" is an ISO date-only string, which `Date` parses as
 * midnight **UTC**. The salon is UTC+10, so that is 10am on the 3rd
 * here — fine — but on any machine set behind UTC it is the 2nd, and
 * the diary opens on the wrong day in exactly the way commit e6a4662
 * fixed elsewhere. Splitting the parts and building a LOCAL date is the
 * only reading that cannot drift, and it matches how getTodayAEST()
 * builds the date this is compared against.
 *
 * ## Why it validates rather than trusting
 *
 * The value arrives in a URL, so it is whatever somebody typed or
 * pasted. An invalid one returns null and the diary stays where it is,
 * which is the only safe failure — a NaN date renders an empty board
 * with no explanation.
 *
 * Month and day are re-read off the constructed date, so "2026-02-31"
 * is rejected rather than silently rolling into March.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The day a calendar link asks for, as local midnight, or null.
 *
 * Takes the raw query string — with or without its leading "?" — so the
 * caller can hand it straight from wouter's useSearch().
 */
export function calendarDateFromSearch(search: string | null | undefined): Date | null {
  if (!search) return null;
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("date");
  return parseCalendarDay(raw);
}

/** "2026-11-03" as local midnight, or null if it is not a real day. */
export function parseCalendarDay(raw: string | null | undefined): Date | null {
  const match = ISO_DAY.exec((raw ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Rejects the days that do not exist. new Date(2026, 1, 31) is
  // 3 March, and a diary silently opening on a different day is worse
  // than one that does not move.
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}
