/**
 * Who comes back, how often, and what they are worth.
 *
 * Andy, 04/11/2026: "Build the client retention report - add in the
 * client & dog details, avg weeks between appts and their average
 * spend." The Reporting page has carried a "Client Retention — Avg.
 * weeks between visits per client / Coming soon" placeholder since it
 * was written; this is it.
 *
 * One row per DOG, not per client. Cadence is a property of the dog —
 * a cavoodle on a four-weekly clip and a labrador on a twice-yearly
 * deshed belong to the same household and share no rhythm at all, and
 * averaging them produces a number that describes neither. The owner's
 * details ride along on the row so the report still reads as a client
 * list.
 *
 * ## The gap is a MEDIAN, and the spend is a MEAN
 *
 * Not inconsistency — they fail differently.
 *
 * A gap has outliers that are not signal: a dog on a settled 6-weekly
 * rhythm that missed a season once has a mean nobody recognises, and
 * the median ignores it. `petCadences` in shared/overdueForGroom.ts
 * already computes exactly this and is what decides whether a dog is
 * overdue, so the report and the chase-list cannot disagree.
 *
 * A spend outlier IS signal: a client who normally pays $90 and once
 * paid $300 really did pay $300, and a retention report is about what
 * the salon loses if they stop coming. So spend is the plain mean of
 * what they were actually charged.
 *
 * ## What is deliberately not counted
 *
 * Unpriced grooms are left out of the spend average rather than
 * counted as zero. 737 of the salon's 7,811 completed grooms carry no
 * figure at all, nearly all of them MoeGo history, and treating "no
 * price recorded" as "paid nothing" would quietly halve a regular's
 * apparent value.
 *
 * A membership dog's groom IS a real zero — the weekly fee already
 * covered it — so it counts, and the row says `onMembership` so a low
 * average is read as "pays weekly" rather than "cheap client".
 */

export type RetentionVisit = {
  petId: number;
  scheduledStart: Date | string | number;
  /** What the groom was charged. Null where no figure was ever recorded. */
  price: string | number | null | undefined;
};

export type RetentionRow = {
  petId: number;
  /** Completed grooms on record. The denominator for everything else. */
  visits: number;
  /** The dog's own usual gap in weeks, median. Null without enough history. */
  usualGapWeeks: number | null;
  /** Mean of the grooms that carry a figure. Null when none do. */
  averageSpend: number | null;
  /** How many grooms the average is drawn from. Fewer is less trustworthy. */
  pricedVisits: number;
  /** Everything they have ever been charged, for ranking by value. */
  totalSpend: number;
  lastVisit: Date | null;
};

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Whole weeks between consecutive visits, oldest first. */
function gapsInWeeks(dates: readonly Date[]): number[] {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const ms = sorted[i].getTime() - sorted[i - 1].getTime();
    // A same-day pair is a correction or a second dog on one booking,
    // not a six-day rhythm. Dropped rather than counted as zero.
    if (ms <= 0) continue;
    out.push(ms / (7 * 24 * 60 * 60 * 1000));
  }
  return out;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function retentionRows(
  visits: readonly RetentionVisit[],
  options: { minGaps?: number } = {},
): Map<number, RetentionRow> {
  /*
   * One gap is not a rhythm. A dog that came twice is a dog that came
   * twice, and calling six weeks its "usual" invites somebody to chase
   * a client who was never a regular. Same default as the overdue
   * rule, for the same reason.
   */
  const minGaps = options.minGaps ?? 2;

  const byPet = new Map<number, { dates: Date[]; prices: number[] }>();
  for (const visit of visits) {
    if (!Number.isFinite(visit.petId)) continue;
    const when = toDate(visit.scheduledStart);
    if (!when) continue;
    const entry = byPet.get(visit.petId) ?? { dates: [], prices: [] };
    entry.dates.push(when);
    const amount = toAmount(visit.price);
    if (amount !== null) entry.prices.push(amount);
    byPet.set(visit.petId, entry);
  }

  const rows = new Map<number, RetentionRow>();
  for (const [petId, { dates, prices }] of byPet) {
    const gaps = gapsInWeeks(dates);
    const total = prices.reduce((sum, p) => sum + p, 0);
    rows.set(petId, {
      petId,
      visits: dates.length,
      usualGapWeeks: gaps.length >= minGaps ? Math.round(median(gaps)! * 10) / 10 : null,
      averageSpend: prices.length > 0 ? Math.round((total / prices.length) * 100) / 100 : null,
      pricedVisits: prices.length,
      totalSpend: Math.round(total * 100) / 100,
      lastVisit: dates.reduce<Date | null>((latest, d) => (!latest || d > latest ? d : latest), null),
    });
  }
  return rows;
}
