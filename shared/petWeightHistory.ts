/**
 * A dog's weight over time, and whether it has changed enough to say
 * something about.
 *
 * Andy approved this from the feature gap list on 05/11/2026: weight
 * tracking with history and a graph.
 *
 * ## Why history rather than one number
 *
 * `pets.weight_kg` holds ONE figure, overwritten each time it is
 * edited, so the salon can tell you what a dog weighs and never what it
 * weighed. That matters commercially — weight drives
 * `getAutoDurationMinutes`, so a dog that has grown is quietly being
 * under-booked — and it matters to the owner, who is usually the last
 * to notice a steady gain on a dog they see every day.
 *
 * ## What the salon actually has
 *
 * Measured on the real book: 2,177 of 12,557 pets carry a weight at
 * all. Most of the rest have a SIZE BAND instead, because the MoeGo
 * history came across without weights. So this has to be useful from
 * the first reading and say honestly that it knows nothing yet, rather
 * than needing a year of data before it shows anything.
 *
 * ## The threshold is 10%, and it is a conversation, not a diagnosis
 *
 * Ten per cent of body weight is the usual point at which a change in a
 * dog is considered worth noticing. A groomer is not a vet and this
 * does not pretend otherwise: it flags "this dog is noticeably lighter
 * than last time" so somebody can mention it, and nothing more.
 */

export type WeightEntry = {
  id: number;
  /** Kilograms. A string when it comes straight from the database. */
  weightKg: string | number;
  recordedAt: Date | string | number;
};

export type WeightPoint = {
  id: number;
  kg: number;
  at: Date;
};

export type WeightTrend = {
  points: WeightPoint[];
  latest: WeightPoint | null;
  previous: WeightPoint | null;
  /** Kilograms gained since the previous reading. Negative is a loss. */
  changeKg: number | null;
  /** That change as a percentage of the previous reading. */
  changePercent: number | null;
  direction: "up" | "down" | "steady" | null;
  /** Past the threshold, so worth mentioning to the owner. */
  notable: boolean;
  /** Days between the two most recent readings. */
  daysBetween: number | null;
};

/** The share of body weight that counts as a change worth mentioning. */
export const NOTABLE_CHANGE_PERCENT = 10;

/**
 * Below this, a difference is scales and stance rather than the dog.
 * A wriggling cavoodle weighs differently twice in a row.
 */
export const NOISE_FLOOR_KG = 0.1;

function toKg(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Readings in the order they happened, junk dropped rather than guessed. */
export function weightPoints(entries: readonly WeightEntry[]): WeightPoint[] {
  const points: WeightPoint[] = [];
  for (const entry of entries) {
    const kg = toKg(entry.weightKg);
    const at = toDate(entry.recordedAt);
    if (kg === null || at === null) continue;
    points.push({ id: entry.id, kg, at });
  }
  return points.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
}

export function weightTrend(entries: readonly WeightEntry[]): WeightTrend {
  const points = weightPoints(entries);
  const latest = points[points.length - 1] ?? null;
  const previous = points.length >= 2 ? points[points.length - 2]! : null;

  if (!latest || !previous) {
    // One reading is a fact, not a trend. Saying "steady" here would be
    // inventing a history the dog does not have.
    return {
      points, latest, previous,
      changeKg: null, changePercent: null, direction: null,
      notable: false, daysBetween: null,
    };
  }

  const changeKg = latest.kg - previous.kg;
  const changePercent = (changeKg / previous.kg) * 100;
  const daysBetween = (latest.at.getTime() - previous.at.getTime()) / 86_400_000;

  const direction = Math.abs(changeKg) < NOISE_FLOOR_KG
    ? "steady"
    : changeKg > 0 ? "up" : "down";

  return {
    points, latest, previous, changeKg, changePercent, daysBetween,
    direction,
    notable: direction !== "steady" && Math.abs(changePercent) >= NOTABLE_CHANGE_PERCENT,
  };
}

/** One line a receptionist can read out. Null when there is nothing to say. */
export function describeWeightTrend(trend: WeightTrend): string | null {
  if (!trend.latest) return null;
  if (!trend.previous || trend.changeKg === null || trend.changePercent === null) {
    return `${trend.latest.kg} kg — first recorded weight.`;
  }
  if (trend.direction === "steady") {
    return `${trend.latest.kg} kg — about the same as last time.`;
  }
  const word = trend.direction === "up" ? "heavier" : "lighter";
  const amount = Math.abs(trend.changeKg).toFixed(1);
  const percent = Math.abs(trend.changePercent).toFixed(0);
  const tail = trend.notable ? " — worth mentioning to the owner." : ".";
  return `${trend.latest.kg} kg — ${amount} kg ${word} than last time (${percent}%)${tail}`;
}
