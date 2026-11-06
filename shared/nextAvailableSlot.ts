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

/**
 * Every start time that is genuinely free on one day.
 *
 * Lauren, 05/11/2026, after teaching Megs to rebook: "when then when we
 * jump weeks ahead.. it would be handy to only show timeslots that are
 * free for those dates. Like 10 weeks from now.. time slots - 9am,
 * 12pm, 12:30 or no time slots on that day."
 *
 * The rebook dialog offers every half hour whether or not anyone is
 * free, so staff pick a time at the counter and find out it clashes
 * afterwards. This is the list that should be offered instead.
 *
 * firstFreeSlot is now this function's first answer, which is the
 * point: the time the dialog SUGGESTS and the times it OFFERS come
 * from one rule, so they cannot drift into disagreeing — the way three
 * copies of the restricted-staff route list did.
 */
export function freeSlotsOn(
  day: DayAvailability,
  opts: NextSlotOptions,
): number[] {
  const span = opts.durationMinutes > 0 ? opts.durationMinutes : 0;
  if (span <= 0) return [];
  if (!dayIsBookable(day).ok) return [];
  const close = opts.closeMinutes ?? DEFAULT_CLOSE_MINUTES;
  const out: number[] = [];

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

    out.push(start);
  }
  return out;
}

export function firstFreeSlot(
  days: readonly DayAvailability[],
  opts: NextSlotOptions,
): FoundSlot | null {
  for (let i = 0; i < days.length; i++) {
    const [start] = freeSlotsOn(days[i]!, opts);
    if (start !== undefined) {
      return { dateKey: days[i]!.dateKey, startMinutes: start, daysAhead: i };
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

/**
 * The next several slots, spread across days, for answering the phone.
 *
 * Lauren, 06/11/2026: "what's your idea for if someone rang up and asks
 * when's your next available booking... cause I have no fucking idea
 * off the top of my head unless I go through manually and check."
 *
 * firstFreeSlot above answers a different question. It exists to fill
 * in a date field once a booking is already being made, so one answer
 * is the right number. On the phone one answer is the wrong number:
 * the client says "no, I work Tuesdays" and you are back to scrolling.
 *
 * ## Why it caps per day
 *
 * A quiet Thursday has eleven free half-hours, and listing all eleven
 * is one answer dressed up as eleven. Two per day, across as many days
 * as it takes, is what somebody can actually read out — "Thursday the
 * 13th at 8 or half past nine, or Friday the 14th at 9".
 *
 * ## Why it does not rank or score
 *
 * Soonest-first, in diary order, and nothing cleverer. A scheduler that
 * quietly prefers one groomer or one time of day is making the salon's
 * decisions for it, and when it gets that wrong nobody can tell why.
 * The caller picks; this just has to be complete and honest about what
 * is free.
 */
export type SlotOption = FoundSlot;

export const DEFAULT_SLOT_OPTIONS = 5;
export const DEFAULT_SLOTS_PER_DAY = 2;

export function nextFreeSlots(
  days: readonly DayAvailability[],
  opts: NextSlotOptions,
  limit: number = DEFAULT_SLOT_OPTIONS,
  maxPerDay: number = DEFAULT_SLOTS_PER_DAY,
): SlotOption[] {
  const out: SlotOption[] = [];
  const wanted = Math.max(0, Math.trunc(limit));
  const perDay = Math.max(1, Math.trunc(maxPerDay));
  if (wanted === 0) return out;

  for (let i = 0; i < days.length && out.length < wanted; i++) {
    const day = days[i]!;
    for (const startMinutes of freeSlotsOn(day, opts).slice(0, perDay)) {
      out.push({ dateKey: day.dateKey, startMinutes, daysAhead: i });
      if (out.length >= wanted) break;
    }
  }
  return out;
}

/**
 * How many days of the search had nothing in them, and why.
 *
 * So the panel can say "the next four days are full" rather than just
 * showing a date a fortnight out with no explanation. A client hearing
 * "the 20th" wants to know whether that is because the salon is busy
 * or because it is shut.
 */
export function summariseSearch(days: readonly DayAvailability[]): {
  searched: number; closed: number; full: number;
} {
  let closed = 0;
  let full = 0;
  for (const day of days) {
    const reason = dayIsBookable(day).reason;
    if (reason === "closed") closed++;
    else if (reason === "atCapacity") full++;
  }
  return { searched: days.length, closed, full };
}
