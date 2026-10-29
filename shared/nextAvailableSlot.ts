import { clashesFor, blockingClashes, type BusyInterval } from "./groomerAvailability";

/**
 * The first slot a booking will actually fit in.
 *
 * Andy, 30/10/2026, on MoeGo's smart scheduling. Lauren's version of
 * the same thing: "it's really hard to see where I have spots left
 * until Xmas." Today the staff dialog offers every half hour from 7am
 * to 6pm with no idea whether anyone is free, so finding a gap means
 * opening days one at a time.
 *
 * Two things make a slot unusable, and they are different:
 *
 *  - a CLASH, which is this groomer already doing something then;
 *  - being AT CAPACITY, which is a whole-day fact — a groomer with
 *    eight of eight clips booked has no room at 2pm even though 2pm
 *    looks empty.
 *
 * The second is the one the board could not see. It is also the one
 * that matters when a day is lightly booked but already spoken for.
 */

export type DayAvailability = {
  /** "YYYY-MM-DD", salon time. */
  dateKey: string;
  busy: readonly BusyInterval[];
  /** Clips already on this groomer for the day. */
  booked: number;
  /** Null when this person carries no clip capacity — a bather. */
  capacity: number | null;
  /** Nobody working: leave, or a day the salon is shut. */
  closed?: boolean;
};

export type FoundSlot = {
  dateKey: string;
  startMinutes: number;
  /** How many days past the earliest one asked for. */
  daysAhead: number;
};

export type NextSlotOptions = {
  durationMinutes: number;
  /** Candidate starts for a given day, in salon minutes. */
  slotStartsFor: (dateKey: string) => readonly number[];
  /** Today's key and the time now, so today's past slots are skipped. */
  todayKey?: string | null;
  nowMinutes?: number | null;
  /** Latest a booking may still be RUNNING. Default 6pm. */
  closeMinutes?: number;
};

export const DEFAULT_CLOSE_MINUTES = 18 * 60;

/**
 * Whether this day can take the booking at all, before looking at times.
 *
 * Separated so the caller can say WHY a day was skipped — "Charlotte is
 * full that day" reads very differently from "nothing fits".
 */
export function dayIsBookable(day: DayAvailability): { ok: boolean; reason?: "closed" | "atCapacity" } {
  if (day.closed) return { ok: false, reason: "closed" };
  if (day.capacity !== null && day.booked >= day.capacity) return { ok: false, reason: "atCapacity" };
  return { ok: true };
}

export function firstFreeSlot(
  days: readonly DayAvailability[],
  opts: NextSlotOptions,
): FoundSlot | null {
  const span = opts.durationMinutes > 0 ? opts.durationMinutes : 0;
  if (span <= 0) return null;
  const close = opts.closeMinutes ?? DEFAULT_CLOSE_MINUTES;

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    if (!dayIsBookable(day).ok) continue;

    for (const start of opts.slotStartsFor(day.dateKey)) {
      /* A booking that would still be running at closing is not a slot,
         however empty the diary looks after it. */
      if (start + span > close) continue;

      /* Today only: a slot that has already started is not available,
         and offering 8am at 3pm makes the whole feature untrustworthy. */
      if (opts.todayKey && day.dateKey === opts.todayKey
          && typeof opts.nowMinutes === "number" && start < opts.nowMinutes) continue;

      /* Leave blocks a slot outright. Another dog does not: the salon
         overlaps deliberately, and `blockingClashes` is the existing
         rule for which of the two a clash is. */
      const clashes = clashesFor(start, start + span, day.busy);
      if (blockingClashes(clashes).length > 0) continue;
      if (clashes.length > 0) continue;

      return { dateKey: day.dateKey, startMinutes: start, daysAhead: i };
    }
  }
  return null;
}

/**
 * Which weekdays this salon actually trades on, learned from its own
 * diary.
 *
 * Nothing records opening days. Closed days are not blockouts — they
 * simply have no bookings — so a search that only knew about clashes
 * and leave happily offered Saturday 31/10/2026, a day the salon is
 * shut. Booking a dog into a closed day is worse than offering no slot
 * at all.
 *
 * Inferred rather than configured, for two reasons: there is no column
 * to read, and a hardcoded Tue-to-Fri would be this salon's habit
 * baked into everyone's product. It also self-corrects — start opening
 * Saturdays and Saturdays become bookable without anyone changing a
 * setting.
 *
 * A weekday counts when it traded in at least half the weeks looked at.
 * Over the eight weeks to 30/10/2026 that is Tue-Fri, which traded
 * every week, and not Saturday, which had four dogs across two days.
 */
export function tradingWeekdays(
  /** One entry per weekday 0-6: how many distinct days it traded. */
  daysTradedByWeekday: Readonly<Record<number, number>>,
  weeksObserved: number,
): Set<number> {
  const threshold = Math.max(1, weeksObserved / 2);
  const out = new Set<number>();
  for (let weekday = 0; weekday < 7; weekday++) {
    if ((daysTradedByWeekday[weekday] ?? 0) >= threshold) out.add(weekday);
  }
  /* Never return nothing. A brand-new salon has no history, and a
     scheduler that says "closed forever" is useless — better to offer
     every day and let the clash and capacity rules do the work. */
  return out.size > 0 ? out : new Set([0, 1, 2, 3, 4, 5, 6]);
}

/** Why nothing was found, for a message a person can act on. */
export function describeNoSlot(days: readonly DayAvailability[]): string {
  if (days.length === 0) return "No days to look at.";
  const closed = days.filter((d) => dayIsBookable(d).reason === "closed").length;
  const full = days.filter((d) => dayIsBookable(d).reason === "atCapacity").length;
  const searched = days.length;
  if (full === searched) return `Fully booked for the next ${searched} days.`;
  if (closed + full === searched) return `Nothing open in the next ${searched} days.`;
  return `No gap long enough in the next ${searched} days.`;
}
