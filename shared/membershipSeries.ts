/**
 * Laying a year of membership grooms into a groomer's calendar.
 *
 * A membership is a cadence: every 2, 4, 5, 6 weeks, same day, same time.
 * Twelve months of that is ten or twenty appointments, and over that span
 * the chosen slot WILL hit something — the groomer already booked, a
 * week of annual leave, a day the salon is shut.
 *
 * The existing repeat-booking engine skips those occurrences and reports
 * them. That is right for a staff member creating a series in front of
 * the calendar, who can see what was skipped and fix it. It is wrong for
 * a client signing up on their phone: a silent gap means a dog that
 * misses a groom, and the first anyone hears of it is the complaint.
 *
 * So this moves the clash instead of dropping it, and says by how much,
 * so the client confirms the dates they are ACTUALLY getting rather than
 * a cadence the calendar cannot honour.
 *
 * Pure, and takes the busy intervals as data: the caller decides what
 * counts as busy — other appointments, staff blockouts, whatever a salon
 * models later — and this does the placing. One database round trip for
 * the whole year, then all of the reasoning happens here where it can be
 * tested without a calendar.
 */

import { brisbaneDateKey } from "./localDateTime";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;

/** Anything that makes a slot unavailable. Half-open: [start, end). */
export type BusyInterval = { start: Date; end: Date };

export type SeriesOccurrence = {
  /** 1-based, so "visit 3 of 10" reads correctly in the UI. */
  index: number;
  /** Where the fixed cadence says this groom falls. */
  idealStart: Date;
  /** Where it actually lands. Null when nothing free was found nearby. */
  start: Date | null;
  /** Whole Brisbane days between ideal and actual. 0 when it kept its date. */
  shiftedDays: number;
  /** Minutes between ideal and actual time of day, when it kept its date. */
  shiftedMinutes: number;
};

export type MembershipSeriesPlan = {
  occurrences: SeriesOccurrence[];
  /** How many found a slot. */
  placedCount: number;
  /** How many had to move off their ideal time. */
  shiftedCount: number;
  /** How many found nothing within the search window. */
  unplacedCount: number;
};

/**
 * How far either side of the ideal date to look.
 *
 * A fortnight each way would find a slot almost always, and would also
 * turn a 4-weekly membership into a 6-weekly one without saying so. Four
 * days keeps a moved groom recognisably the same week — and when nothing
 * is free inside that, the honest answer is to show the client a gap and
 * let the salon sort it, not to quietly reschedule them a fortnight out.
 */
export const DEFAULT_SERIES_SEARCH_DAYS = 4;

/** Does [aStart, aEnd) overlap [bStart, bEnd)? */
function overlaps(aStart: number, aEnd: number, b: BusyInterval): boolean {
  return aStart < b.end.getTime() && aEnd > b.start.getTime();
}

/**
 * Day offsets to try, nearest first: 0, +1, -1, +2, -2, …
 *
 * Later before earlier at the same distance. A groom that slips a day is
 * a dog whose coat is a day longer; one pulled a day forward can land
 * inside the previous visit's interval, which is the thing a membership
 * cadence exists to prevent.
 */
function searchOffsets(searchDays: number): number[] {
  const offsets = [0];
  for (let d = 1; d <= searchDays; d++) offsets.push(d, -d);
  return offsets;
}

export function planMembershipSeries(input: {
  firstStart: Date;
  durationMinutes: number;
  intervalWeeks: number;
  occurrenceCount: number;
  busy: readonly BusyInterval[];
  /**
   * Legal slot starts for a Brisbane date key. Injected rather than
   * computed here so opening hours, closed days and the slot grid stay
   * defined in exactly one place — this inherits whatever they become.
   */
  slotsForDate: (dateKey: string, durationMinutes: number) => Date[];
  searchDays?: number;
}): MembershipSeriesPlan {
  const {
    firstStart, durationMinutes, intervalWeeks, occurrenceCount,
    busy, slotsForDate, searchDays = DEFAULT_SERIES_SEARCH_DAYS,
  } = input;

  const occurrences: SeriesOccurrence[] = [];
  if (occurrenceCount <= 0 || intervalWeeks <= 0 || durationMinutes <= 0) {
    return { occurrences, placedCount: 0, shiftedCount: 0, unplacedCount: 0 };
  }

  const durationMs = durationMinutes * MINUTE_MS;
  const offsets = searchOffsets(searchDays);
  // Occurrences placed so far block later ones: a series must not collide
  // with itself when two ideal dates get pushed onto the same free slot.
  const taken: BusyInterval[] = [...busy];

  for (let i = 0; i < occurrenceCount; i++) {
    // Anchored to the ORIGINAL cadence, never to where the previous one
    // landed. Chaining off the actual date lets one shifted groom drag
    // every later one off the weekday the client chose, so a single
    // clash in March quietly moves Christmas to a Wednesday.
    const idealStart = new Date(firstStart.getTime() + i * intervalWeeks * WEEK_MS);

    let best: { start: Date; dayOffset: number; minuteDelta: number } | null = null;

    for (const dayOffset of offsets) {
      const dayKey = brisbaneDateKey(new Date(idealStart.getTime() + dayOffset * DAY_MS));
      for (const slot of slotsForDate(dayKey, durationMinutes)) {
        const slotStart = slot.getTime();
        const slotEnd = slotStart + durationMs;
        // Never earlier than the slot the client actually chose. The search
        // looks both ways, so without this the FIRST groom can be pulled
        // backwards — in the worst case to a date that has already passed,
        // which is a booking nobody can keep.
        if (slotStart < firstStart.getTime()) continue;
        // Never place a groom before the one that precedes it.
        const previous = occurrences[i - 1];
        if (previous?.start && slotStart < previous.start.getTime()) continue;
        if (taken.some((b) => overlaps(slotStart, slotEnd, b))) continue;

        const minuteDelta = Math.abs(slotStart - idealStart.getTime()) / MINUTE_MS;
        if (best === null || minuteDelta < best.minuteDelta) {
          best = { start: slot, dayOffset, minuteDelta };
        }
      }
      // Nearest day wins outright: an hour late on the right day beats
      // the exact time on the wrong one, so stop as soon as a day yields.
      if (best) break;
    }

    if (best === null) {
      occurrences.push({ index: i + 1, idealStart, start: null, shiftedDays: 0, shiftedMinutes: 0 });
      continue;
    }

    taken.push({ start: best.start, end: new Date(best.start.getTime() + durationMs) });
    const sameDay = brisbaneDateKey(best.start) === brisbaneDateKey(idealStart);
    occurrences.push({
      index: i + 1,
      idealStart,
      start: best.start,
      shiftedDays: sameDay ? 0 : brisbaneDayGap(idealStart, best.start),
      shiftedMinutes: sameDay ? Math.round((best.start.getTime() - idealStart.getTime()) / MINUTE_MS) : 0,
    });
  }

  const placedCount = occurrences.filter((o) => o.start !== null).length;
  return {
    occurrences,
    placedCount,
    shiftedCount: occurrences.filter((o) => o.start !== null && (o.shiftedDays !== 0 || o.shiftedMinutes !== 0)).length,
    unplacedCount: occurrences.length - placedCount,
  };
}

/**
 * Signed whole-day gap between two instants, counted in Brisbane days.
 *
 * Differencing the timestamps would be wrong at the edges: 17:00 Tuesday
 * to 08:00 Wednesday is 15 hours, which floors to zero days when it is
 * plainly the next day.
 */
export function brisbaneDayGap(from: Date, to: Date): number {
  const fromDay = Date.parse(brisbaneDateKey(from) + "T00:00:00Z");
  const toDay = Date.parse(brisbaneDateKey(to) + "T00:00:00Z");
  return Math.round((toDay - fromDay) / DAY_MS);
}

/**
 * How many grooms a 12-month sign-up buys at this cadence.
 *
 * Floor, not round: a 5-weekly membership delivers ten grooms in a year,
 * and quoting a client 10.4 grooms reads as a mistake. Matches
 * visitsPerYearFor in membershipAssignable, deliberately.
 */
export function occurrencesForMonths(intervalWeeks: number, months: number): number {
  if (!Number.isFinite(intervalWeeks) || intervalWeeks <= 0) return 0;
  if (!Number.isFinite(months) || months <= 0) return 0;
  return Math.max(1, Math.floor((months * 52) / (12 * intervalWeeks)));
}

/** One line a client can read: what they are actually getting. */
export function describeSeriesPlan(plan: MembershipSeriesPlan): string {
  if (plan.placedCount === 0) return "No appointments could be booked at that time.";
  const parts = [`${plan.placedCount} ${plan.placedCount === 1 ? "groom" : "grooms"} booked`];
  if (plan.shiftedCount > 0) {
    parts.push(`${plan.shiftedCount} moved to the nearest free time`);
  }
  if (plan.unplacedCount > 0) {
    parts.push(`${plan.unplacedCount} the salon will arrange with you`);
  }
  return parts.join(", ") + ".";
}
