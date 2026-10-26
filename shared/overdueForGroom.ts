/**
 * Which dogs have slipped past their own grooming rhythm.
 *
 * The salon already knows its average repeat interval — that is what
 * `server/groomInterval.ts` reports. This answers the different and more
 * useful question: is THIS dog late, measured against what THIS dog
 * normally does. A cavoodle on a four-weekly clip and a labrador on a
 * twice-a-year deshed are both regulars, and a single salon-wide number
 * calls one of them overdue every month and never notices the other.
 *
 * The point is to catch a client before they book elsewhere, so the
 * whole design errs towards saying nothing rather than crying wolf:
 * a dog needs real history before it can be late, a week of grace on
 * top, and anything already booked in is not late at all.
 */
import { dayInZone, addCalendarDays } from "./calendarDay";

/** One completed groom. */
export type GroomVisit = {
  petId: number;
  /** When the groom happened. */
  scheduledStart: Date | string | number;
};

export type GroomCadence = {
  petId: number;
  /** The dog's own typical gap, in weeks. */
  medianWeeks: number;
  /** How many gaps that median is drawn from. More is more trustworthy. */
  intervalCount: number;
  lastVisit: Date;
};

export type OverdueBand = "overdue_7_13" | "overdue_14_plus";

export type OverduePet = {
  petId: number;
  medianWeeks: number;
  intervalCount: number;
  /** "YYYY-MM-DD" in the salon's zone. */
  lastVisit: string;
  /** When this dog was due back, on its own rhythm. */
  dueOn: string;
  daysOverdue: number;
  band: OverdueBand;
};

export type OverdueOptions = {
  /** The salon's clock. A day either side matters at these margins. */
  timeZone: string;
  now?: Date | number;
  /**
   * Gaps needed before a rhythm is believed. Two means three visits.
   *
   * One gap is not a rhythm — a dog that came twice is a dog that came
   * twice. Texting someone that they are overdue on that evidence is how
   * the list stops being trusted.
   */
  minIntervals?: number;
  /**
   * Days past due before a dog counts as overdue at all.
   *
   * A learned cadence is approximate, so a dog two days late is noise.
   * Seven days is the first band's floor and the grace period at once.
   */
  graceDays?: number;
  /**
   * Beyond this, a dog is not overdue — it is gone. Different problem,
   * different conversation, and leaving them in buries the dogs who
   * might still come back this week.
   */
  maxOverdueDays?: number;
  /**
   * Longest rhythm still treated as regular. A dog seen once a year is
   * not on a cadence the salon can be late against.
   */
  maxCadenceWeeks?: number;
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Each pet's own typical gap between grooms.
 *
 * The MEDIAN, not the mean. One long gap — a holiday, an illness, a
 * move — drags a mean out by weeks and then silently stops the dog ever
 * looking overdue again. The median shrugs it off.
 *
 * Same-day repeats are ignored, matching calculateGroomIntervalStats:
 * a duplicate appointment must not read as a zero-week rhythm.
 */
export function petCadences(visits: readonly GroomVisit[]): Map<number, GroomCadence> {
  const byPet = new Map<number, Date[]>();
  for (const visit of visits) {
    if (visit.petId == null) continue;
    const at = new Date(visit.scheduledStart);
    if (Number.isNaN(at.getTime())) continue;
    const list = byPet.get(visit.petId) ?? [];
    list.push(at);
    byPet.set(visit.petId, list);
  }

  const cadences = new Map<number, GroomCadence>();
  for (const [petId, dates] of Array.from(byPet.entries())) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      const ms = dates[i].getTime() - dates[i - 1].getTime();
      if (ms < DAY_MS) continue; // same day — a duplicate, not a rhythm
      gaps.push(ms / WEEK_MS);
    }
    if (gaps.length === 0) continue;
    cadences.set(petId, {
      petId,
      medianWeeks: Math.round(median(gaps) * 10) / 10,
      intervalCount: gaps.length,
      lastVisit: dates[dates.length - 1],
    });
  }
  return cadences;
}

/**
 * The dogs that are late, worst first.
 *
 * `bookedPetIds` is the important exclusion. A dog with anything in the
 * diary is not overdue however long ago it was last in — it is simply
 * due a visit that is already arranged. Leaving those in would put a
 * client who booked yesterday on a list headed "before they book
 * elsewhere", which is the one way to make this actively harmful.
 */
export function overduePets(input: {
  visits: readonly GroomVisit[];
  /** Pets with a future or in-progress appointment. Never overdue. */
  bookedPetIds?: Iterable<number>;
  /** Pets no longer coming — departed, or a duplicate record. */
  excludePetIds?: Iterable<number>;
  /**
   * Appointments in the PAST that were never marked complete, and were
   * not cancelled — so nobody knows whether the dog came.
   *
   * This is not hypothetical. On 26/10/2026 the live book held 368
   * August appointments still sitting at "scheduled": dogs that almost
   * certainly came in and were groomed, but whose workflow never
   * advanced. A pet whose most recent trace is one of those has no
   * confirmed visit since, so calling it overdue is a guess — and it
   * guessed wrong for 29 of 240 pets, a 12% error rate, every one of
   * them a client somebody would have rung for no reason.
   *
   * Silence is the right failure here: a missed lapsed client costs a
   * booking, a wrong accusation costs trust in the whole list.
   */
  unconfirmedVisits?: readonly GroomVisit[];
  options: OverdueOptions;
}): OverduePet[] {
  const {
    timeZone,
    now = Date.now(),
    minIntervals = 2,
    graceDays = 7,
    maxOverdueDays = 180,
    maxCadenceWeeks = 26,
  } = input.options;

  const booked = new Set(input.bookedPetIds ?? []);
  const excluded = new Set(input.excludePetIds ?? []);
  const nowMs = typeof now === "number" ? now : now.getTime();

  // The latest unconfirmed trace per pet, to compare against its last
  // confirmed groom below.
  const lastUnconfirmed = new Map<number, number>();
  for (const visit of input.unconfirmedVisits ?? []) {
    if (visit.petId == null) continue;
    const at = new Date(visit.scheduledStart).getTime();
    if (Number.isNaN(at) || at > nowMs) continue; // only the past counts
    const seen = lastUnconfirmed.get(visit.petId);
    if (seen === undefined || at > seen) lastUnconfirmed.set(visit.petId, at);
  }

  const out: OverduePet[] = [];
  for (const cadence of Array.from(petCadences(input.visits).values())) {
    if (booked.has(cadence.petId) || excluded.has(cadence.petId)) continue;

    // Something happened after their last confirmed groom and nobody
    // recorded the outcome. Say nothing rather than guess.
    const unconfirmed = lastUnconfirmed.get(cadence.petId);
    if (unconfirmed !== undefined && unconfirmed > cadence.lastVisit.getTime()) continue;
    if (cadence.intervalCount < minIntervals) continue;
    if (cadence.medianWeeks <= 0 || cadence.medianWeeks > maxCadenceWeeks) continue;

    const dueMs = cadence.lastVisit.getTime() + cadence.medianWeeks * WEEK_MS;
    const daysOverdue = Math.floor((nowMs - dueMs) / DAY_MS);
    if (daysOverdue < graceDays || daysOverdue > maxOverdueDays) continue;

    const lastVisit = dayInZone(cadence.lastVisit, timeZone);
    const dueOn = lastVisit
      ? addCalendarDays(lastVisit, Math.round(cadence.medianWeeks * 7))
      : null;
    if (!lastVisit || !dueOn) continue;

    out.push({
      petId: cadence.petId,
      medianWeeks: cadence.medianWeeks,
      intervalCount: cadence.intervalCount,
      lastVisit,
      dueOn,
      daysOverdue,
      band: daysOverdue >= 14 ? "overdue_14_plus" : "overdue_7_13",
    });
  }

  // Worst first: the dog furthest past its rhythm is the one most likely
  // to have gone somewhere else.
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** "3w 1d" — how far past, short enough for a badge. */
export function describeOverdue(daysOverdue: number): string {
  const days = Math.max(0, Math.floor(daysOverdue));
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  if (weeks === 0) return `${rest}d`;
  if (rest === 0) return `${weeks}w`;
  return `${weeks}w ${rest}d`;
}

export const OVERDUE_BAND_LABEL: Record<OverdueBand, string> = {
  overdue_7_13: "Overdue 7–13 days",
  overdue_14_plus: "Overdue 14+ days",
};
