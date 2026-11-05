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
 * ## A gap under a week is not a rhythm
 *
 * The first version put a client at the top of the report whose only
 * history was four completed grooms on four CONSECUTIVE days and
 * nothing since. Taken at face value that is a one-day cadence, over
 * four hundred days overdue, four hundred missed visits and five
 * figures of "lost revenue" from someone who effectively came once. The
 * headline total was built on rows of that shape.
 *
 * Four appointments in four days is a booking being corrected, or an
 * import artefact — not a dog groomed daily. Measured over the salon's
 * own 6,420 completed gaps: 78.8% are 28 days or more, 13.1% are 14-27,
 * and only 2.9% fall under a week; memberships run on a five-week
 * appointment interval. So gaps shorter than a week are dropped before
 * the median, exactly as clientRetention already drops same-day pairs
 * and for the same reason — and a client left with no plausible gap at
 * all has no rhythm, so they are excluded rather than guessed at.
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

/**
 * The shortest gap that can be a grooming rhythm rather than a
 * correction. See the note above for the measurement behind it.
 */
export const MIN_PLAUSIBLE_GAP_DAYS = 7;
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
      const days = (trips[i].at.getTime() - trips[i - 1].at.getTime()) / DAY_MS;
      // Anything inside a week is a correction, a redo or an import
      // artefact. Counting it makes a client who came four days running
      // look like a daily regular who is four hundred days overdue.
      if (days < MIN_PLAUSIBLE_GAP_DAYS) continue;
      gaps.push(days);
    }
    const usualGapDays = median(gaps);
    // No plausible gap at all means no rhythm to be late against.
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

/**
 * Sorting the report.
 *
 * ## Why this is a rule and not a click handler
 *
 * The server ranks every lapsed client and then returns the first N. So
 * the sort has to happen BEFORE that slice, or sorting by "away" would
 * reorder the top two hundred BY REVENUE and silently drop the forty-one
 * clients who did not make that cut — a table that looks complete,
 * answers the wrong question, and gives no sign of it. That means the
 * comparator belongs beside the report it orders, not in the component
 * that draws it.
 *
 * ## The membership pin survives every sort
 *
 * A client on an active membership who has stopped coming is the most
 * urgent row in the book and the one the money calls worthless: their
 * grooms are $0 because the weekly fee covers them. The report promises
 * in its own subtitle that they come first "whatever the spend says", so
 * they stay pinned under every column, not just the default one. The
 * "still paying" badge beside the name is what explains the exception.
 */
export const LAPSED_SORT_KEYS = [
  "name", "visits", "usualGap", "lastSeen", "away", "missed", "notTaken",
] as const;

export type LapsedSortKey = (typeof LAPSED_SORT_KEYS)[number];
export type LapsedSortDir = "asc" | "desc";

/**
 * The direction a column opens on, chosen per column rather than one
 * blanket rule, because the useful end differs: nobody wants the fewest
 * missed visits first, and nobody wants the most recent visit first on a
 * report about people who have stopped coming.
 */
export const LAPSED_SORT_DEFAULT_DIR: Readonly<Record<LapsedSortKey, LapsedSortDir>> = {
  name: "asc",
  visits: "desc",
  usualGap: "desc",
  // Longest ago first. Same ordering as `away` descending, which is the
  // same fact measured from the other end.
  lastSeen: "asc",
  away: "desc",
  missed: "desc",
  notTaken: "desc",
};

/** The fields the comparator needs. Extra fields on the row are ignored. */
export type LapsedSortable = {
  clientId: number;
  visits: number;
  usualGapDays: number;
  lastVisit: Date | string | number;
  daysSince: number;
  missedVisits: number;
  estimatedLostRevenue: number;
  onMembership?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  /** Only used to break a tie on the default column — see sortLapsedRows. */
  totalSpend?: number;
};

function nameOf(row: LapsedSortable): string {
  return `${row.lastName ?? ""} ${row.firstName ?? ""}`.trim().toLowerCase();
}

function valueFor(row: LapsedSortable, key: LapsedSortKey): number | string {
  switch (key) {
    case "name": return nameOf(row);
    case "visits": return row.visits;
    case "usualGap": return row.usualGapDays;
    case "lastSeen": return toDate(row.lastVisit)?.getTime() ?? 0;
    case "away": return row.daysSince;
    case "missed": return row.missedVisits;
    case "notTaken": return row.estimatedLostRevenue;
  }
}

/**
 * Order the report, members first, then by the chosen column.
 *
 * Returns a new array; the input is not touched. The clientId tiebreak is
 * there so two clients with identical figures — which the Camerons in the
 * salon's own book are, to the dollar — never swap places between
 * renders.
 */
export function sortLapsedRows<T extends LapsedSortable>(
  rows: readonly T[],
  key: LapsedSortKey,
  dir: LapsedSortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (Boolean(a.onMembership) !== Boolean(b.onMembership)) return a.onMembership ? -1 : 1;
    const av = valueFor(a, key);
    const bv = valueFor(b, key);
    if (typeof av === "string" || typeof bv === "string") {
      const cmp = String(av).localeCompare(String(bv));
      if (cmp !== 0) return cmp * sign;
    } else if (av !== bv) {
      return (av - bv) * sign;
    }
    // Lifetime spend breaks a tie on the default column, which is what the
    // report did before it was sortable: two clients owed the same money
    // are not equally worth ringing. Kept to that column, because ranking
    // by spend inside a name sort would be surprising.
    if (key === "notTaken" && (a.totalSpend ?? 0) !== (b.totalSpend ?? 0)) {
      return ((a.totalSpend ?? 0) - (b.totalSpend ?? 0)) * sign;
    }
    return a.clientId - b.clientId;
  });
}
