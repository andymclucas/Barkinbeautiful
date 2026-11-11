/**
 * Last visit, today's visit and next visit — by CALENDAR DAY in Brisbane.
 *
 * Andy, 11/11/2026: "If it is the appt on the day it still needs to show the
 * previous appt as last. Once that day passes, it then shows that appt that
 * they just finished as the previous one. Current appt is the day of the appt
 * and any dates in the future are future appts. These all need to be AEST
 * timezone. No alternatives."
 *
 * So, comparing Brisbane calendar dates (AEST, UTC+10, no daylight saving):
 *  - last:  the most recent visit on a day BEFORE today;
 *  - today: every visit on today's date — the current appointment, however
 *           far through the day it is, even when finished;
 *  - next:  the soonest visit on a day AFTER today.
 * Cancelled and no-show bookings are not visits.
 *
 * It replaced a rule that split on the current TIME, under which a dog's 8am
 * groom became its "last visit" by 8:01 — and, before that, one that took
 * the first rows of a newest-first list and showed a booking in 2027 as both.
 */
import { brisbaneDateKey } from "./localDateTime";

export type VisitLike = {
  scheduledStart: Date | string;
  status?: string | null;
  workflowState?: string | null;
};

const NOT_A_VISIT = new Set(["cancelled", "no_show"]);

export const isVisit = (a: VisitLike) =>
  !NOT_A_VISIT.has(String(a.status ?? "")) && !NOT_A_VISIT.has(String(a.workflowState ?? ""));

/** The Brisbane calendar date of an instant, "YYYY-MM-DD". */
export const brisbaneDayOf = (value: Date | string) => brisbaneDateKey(new Date(value));

export function clientVisitDates<T extends VisitLike>(
  appointments: readonly T[],
  now: Date = new Date(),
): { last: T | null; today: T[]; next: T | null } {
  const todayKey = brisbaneDateKey(now);
  let last: T | null = null;
  let next: T | null = null;
  const today: T[] = [];
  for (const a of appointments) {
    if (!isVisit(a)) continue;
    const t = new Date(a.scheduledStart).getTime();
    if (!Number.isFinite(t)) continue;
    const day = brisbaneDayOf(a.scheduledStart);
    if (day < todayKey) {
      if (!last || t > new Date(last.scheduledStart).getTime()) last = a;
    } else if (day > todayKey) {
      if (!next || t < new Date(next.scheduledStart).getTime()) next = a;
    } else {
      today.push(a);
    }
  }
  today.sort((x, y) => new Date(x.scheduledStart).getTime() - new Date(y.scheduledStart).getTime());
  return { last, today, next };
}

/** Dates shown to staff are Brisbane dates, whatever the device is set to. */
export const BRISBANE_TIME_ZONE = "Australia/Brisbane";
