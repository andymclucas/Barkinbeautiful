/**
 * Revenue targets that account for the size of the dogs somebody was given.
 *
 * Andy, 07/10/2026: a target "taking into account dog sizes/weight as these
 * dogs always take longer". The salon's own figures bear that out sharply —
 * its duration model (shared/appointmentDuration.ts) against twelve months
 * of real prices:
 *
 *   small        60 min   $138.25   $138/hour
 *   small_medium 60 min   $142.89   $143/hour
 *   medium       90 min   $168.07   $112/hour
 *   large       120 min   $178.81    $89/hour
 *   extra_large 180 min   $190.32    $63/hour
 *   giant       180 min   $213.65    $71/hour
 *
 * Big dogs cost more but nowhere near proportionally to the chair time they
 * take, so a groomer on giants earns roughly half the hourly rate of one on
 * smalls. A flat target punishes whoever takes the hard book.
 *
 * So the target moves with the book. A groomer whose dogs are heavier than
 * the salon's average has their target scaled DOWN in proportion to what
 * that mix can actually earn in the same hours; a groomer on a light book
 * has it scaled up. Nobody is asked for revenue their diary cannot hold.
 *
 * The rates are NOT hardcoded here. They are computed from the salon's own
 * recent appointments and passed in, because the day the salon reprices,
 * a constant in this file becomes a lie.
 */
import type { DogSizeBand } from "./dogSizeBand";

/** Chair time per dog, in hours, from the salon's own duration model. */
export const SIZE_HOURS: Record<DogSizeBand, number> = {
  small: 1,
  small_medium: 1,
  medium: 1.5,
  large: 2,
  extra_large: 3,
  giant: 3,
};

export type BandStat = {
  /** Grooms seen in the window. Thin bands are unreliable — see MIN_SAMPLE. */
  count: number;
  /** What one of these dogs brings in on average. */
  averagePrice: number;
};

export type SizeMix = Partial<Record<DogSizeBand, number>>;

/**
 * A band needs this many grooms before its average price is worth trusting.
 *
 * Giant had 37 in twelve months and extra_large 154; below about this the
 * average swings on one unusual dog, and an adjustment built on it would
 * move somebody's target for no real reason.
 */
export const MIN_SAMPLE = 20;

/**
 * What a mix of dogs can earn per chair hour.
 *
 * Uses the SALON's average price for each band rather than what this person
 * actually charged, which is the point: it measures the hand they were
 * dealt, not how they played it. Their real takings are compared against it
 * separately.
 */
export function rateForMix(mix: SizeMix, stats: Partial<Record<DogSizeBand, BandStat>>): number | null {
  let revenue = 0;
  let hours = 0;
  for (const [band, count] of Object.entries(mix) as Array<[DogSizeBand, number]>) {
    if (!count) continue;
    const stat = stats[band];
    if (!stat || stat.count < MIN_SAMPLE) continue;
    revenue += stat.averagePrice * count;
    hours += SIZE_HOURS[band] * count;
  }
  if (hours <= 0) return null;
  return revenue / hours;
}

/**
 * How this book compares with the salon's, as a multiplier.
 *
 * 1 means an ordinary mix. Below 1 means heavier than average — slower
 * money — and the target comes down by the same proportion.
 */
export function mixDifficulty(
  mix: SizeMix,
  stats: Partial<Record<DogSizeBand, BandStat>>,
  salonRate: number | null,
): number | null {
  if (!salonRate || salonRate <= 0) return null;
  const rate = rateForMix(mix, stats);
  if (rate === null) return null;
  return rate / salonRate;
}

/**
 * The most a target may be moved, in either direction.
 *
 * A groomer who happened to do three giants in a quiet week would otherwise
 * see their target halve, which reads as the system excusing them rather
 * than measuring them. A cap keeps the adjustment a correction rather than
 * a rewrite, and anything hitting it is worth a conversation instead.
 */
export const MAX_ADJUSTMENT = 0.4;

export type WeightedTarget = {
  /** What was set, scaled to the period on screen. */
  flat: number;
  /** What it becomes once the book is accounted for. */
  adjusted: number;
  /** The multiplier applied, after capping. */
  difficulty: number;
  /** True when the cap bit, which is worth saying out loud. */
  capped: boolean;
};

export function weightTargetForMix(
  flatTarget: number | null,
  mix: SizeMix,
  stats: Partial<Record<DogSizeBand, BandStat>>,
  salonRate: number | null,
): WeightedTarget | null {
  if (flatTarget === null || flatTarget <= 0) return null;
  const raw = mixDifficulty(mix, stats, salonRate);
  if (raw === null) return null;

  const floor = 1 - MAX_ADJUSTMENT;
  const ceiling = 1 + MAX_ADJUSTMENT;
  const difficulty = Math.min(ceiling, Math.max(floor, raw));
  return {
    flat: round2(flatTarget),
    adjusted: round2(flatTarget * difficulty),
    difficulty: Math.round(difficulty * 100) / 100,
    capped: raw !== difficulty,
  };
}

/** A plain-English reason, for the one line under the figure. */
export function describeDifficulty(weighted: WeightedTarget | null): string | null {
  if (!weighted) return null;
  const percent = Math.round(Math.abs(weighted.difficulty - 1) * 100);
  if (percent === 0) return "An ordinary book for this salon.";
  const heavier = weighted.difficulty < 1;
  return heavier
    ? `Heavier dogs than usual — target lowered ${percent}%${weighted.capped ? " (capped)" : ""}.`
    : `Lighter dogs than usual — target raised ${percent}%${weighted.capped ? " (capped)" : ""}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
