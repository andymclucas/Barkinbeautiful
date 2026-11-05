import { dayInZone } from "./calendarDay";

/**
 * Clients who have stopped coming.
 *
 * The complement of shared/clientRetention.ts, not a second copy of it.
 * Retention is one row per DOG ranked by lifetime spend, and answers
 * "who is slipping". This is one row per CLIENT ranked by what is being
 * lost, and answers "who has gone, and who do I ring first". You ring a
 * person, not a dog, so the unit has to change.
 *
 * ## A visit is a DAY, not an appointment
 *
 * A two-dog household books two appointments and makes one trip. Counted
 * as appointments, their gaps alternate between zero and six weeks and
 * the median collapses to something near zero, so a household that comes
 * religiously every six weeks reads as lapsed the moment it is a day
 * late. Gaps are therefore measured between distinct days the client
 * came in — but the SPEND still sums every appointment on that day,
 * because they really did pay for both dogs.
 *
 * ## Lapsed is measured against their own rhythm
 *
 * Not a salon-wide number of weeks. A fortnightly bath and a ten-weekly
 * styled groom are both on time at completely different intervals, and
 * one figure would call half the book lapsed and let the other half
 * drift away unnoticed. Same reasoning as clientRetentionView's overdue
 * flag, and deliberately a harsher multiple: overdue means "chase",
 * lapsed means "they are not coming back on their own".
 *
 * ## What it deliberately will not say
 *
 * A client with fewer than `minVisits` trips has no rhythm to be late
 * against, and is left out rather than guessed at. Two visits is not a
 * pattern; calling such a client lapsed invents a cadence they never
 * had and puts a stranger at the top of a win-back list.
 *
 * Unpriced grooms are excluded from the spend average rather than
 * counted as zero — 737 of the salon's completed grooms carry no figure,
 * nearly all MoeGo history, and treating those as free would halve a
 * regular's apparent worth. A MEMBERSHIP groom's zero is real, so it
 * counts; but that makes a lapsed membership client look worthless here
 * when they are the most urgent case in the whole report, because they
 * are still paying weekly and not coming. The caller attaches the
 * membership and ranks on it — see the procedure.
 */

export type LapsedVisit = {
  clientId: number;
  scheduledStart: Date | string | number;
  /** What the groom was charged. Null where no figure was ever recorded. */
  price: string | number | null | undefined;
};

export type LapsedClientRow = {
  clientId: number;
  /** Distinct days they came in. The denominator for the cadence. */
  visits: number;
  /** Their own usual gap between trips, median, in days. */
  usualGapDays: number;
  lastVisit: Date;
  daysSince: number;
  /**
   * How far past their own rhythm they are. 2 means they have been away
   * twice as long as they normally leave it.
   */
  overdueFactor: number;
  /** Mean per TRIP of the trips that carry a figure. Null when none do. */
  averageSpend: number | null;
  totalSpend: number;
  /** Trips they would have made by now and did not. Whole trips only. */
  missedVisits: number;
  /** missedVisits x averageSpend. 0 where there is no figure to use. */
  estimatedLostRevenue: number;
};

export type LapsedOptions = {
  /** Usually new Date(). Passed in so the report is testable. */
  now: Date;
  timeZone: string;
  /** Trips needed before a client has a rhythm at all. */
  minVisits?: number;
  /** How many of their own gaps away counts as gone, rather than late. */
  minOverdueFactor?: number;
  /** Clients with something in the diary ahead. Never lapsed. */
  bookedClientIds?: ReadonlySet<number>;
};

export const DEFAULT_MIN_VISITS = 3;
export const DEFAULT_OVERDUE_FACTOR = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function lapsedClients(
  visits: readonly LapsedVisit[],
  options: LapsedOptions,
): LapsedClientRow[] {
  const minVisits = options.minVisits ?? DEFAULT_MIN_VISITS;
  const factorThreshold = options.minOverdueFactor ?? DEFAULT_OVERDUE_FACTOR;
  const booked = options.bookedClientIds;

  /** clientId -> day key -> what was spent that day. */
  const byClient = new Map<number, Map<string, { spend: number; priced: boolean; at: Date }>>();

  for (const visit of visits) {
    const at = toDate(visit.scheduledStart);
    if (!at) continue;
    const day = dayInZone(at, options.timeZone);
    if (!day) continue;

    let days = byClient.get(visit.clientId);
    if (!days) {
      days = new Map();
      byClient.set(visit.clientId, days);
    }
    const entry = days.get(day) ?? { spend: 0, priced: false, at };
    const amount = toAmount(visit.price);
    if (amount !== null) {
      entry.spend += amount;
      entry.priced = true;
    }
    // The earliest appointment of the day stands for the trip.
    if (at.getTime() < entry.at.getTime()) entry.at = at;
    days.set(day, entry);
  }

  const out: LapsedClientRow[] = [];

  for (const [clientId, days] of byClient) {
    if (booked?.has(clientId)) continue;
    if (days.size < minVisits) continue;

    const trips = [...days.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < trips.length; i += 1) {
      const ms = trips[i].at.getTime() - trips[i - 1].at.getTime();
      if (ms <= 0) continue;
      gaps.push(ms / DAY_MS);
    }
    const usualGapDays = median(gaps);
    if (usualGapDays === null || usualGapDays <= 0) continue;

    const lastVisit = trips[trips.length - 1].at;
    const daysSince = (options.now.getTime() - lastVisit.getTime()) / DAY_MS;
    if (daysSince <= 0) continue;

    const overdueFactor = daysSince / usualGapDays;
    if (overdueFactor < factorThreshold) continue;

    const pricedTrips = trips.filter((t) => t.priced);
    const totalSpend = trips.reduce((sum, t) => sum + t.spend, 0);
    const averageSpend = pricedTrips.length > 0 ? totalSpend / pricedTrips.length : null;

    // Whole trips only. A client 2.9 gaps away has missed one they would
    // certainly have made, not 1.9 — rounding up invents a booking.
    const missedVisits = Math.max(0, Math.floor(overdueFactor) - 1);

    out.push({
      clientId,
      visits: trips.length,
      usualGapDays,
      lastVisit,
      daysSince,
      overdueFactor,
      averageSpend,
      totalSpend,
      missedVisits,
      estimatedLostRevenue: averageSpend === null ? 0 : missedVisits * averageSpend,
    });
  }

  return out;
}
