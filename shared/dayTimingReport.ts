/**
 * Where a grooming day actually went — per dog, stage by stage.
 *
 * Lauren, 29/10/2026: "Is there a way to see the progress timing report
 * for each dog's complete grooming for the day.. I'm trying to work out
 * where to fix today. Some dogs weren't bathed until 2 hours after
 * dropping off in the morning."
 *
 * The salon already records every one of these timestamps and already
 * has a timing report, but that report AVERAGES a date range, so one
 * bad morning disappears into a month. It also measures how long a bath
 * TOOK and never how long a dog WAITED for one — on 29/10/2026 every
 * bath ran 13–33 minutes, comfortably inside the review thresholds,
 * while Radley and Harvey sat 150 minutes between drop-off and bath.
 * Nothing in the system could have shown her that.
 *
 * So this breakdown keeps the gaps BETWEEN stages as first-class
 * measures rather than only the stages themselves.
 */

/** Epoch milliseconds, as the appointment columns store them. */
export type Millis = number | null | undefined;

export type DayTimingInput = {
  appointmentId: number;
  petName: string | null;
  clientName?: string | null;
  groomerName?: string | null;
  serviceType?: string | null;
  workflowState: string;
  /** This dog's own ceiling, resolved from the salon's rules. A Giant
      may be given more room than a Toy, so it cannot be one number for
      the whole day. Absent when the caller has not resolved one. */
  waitThresholdMinutes?: number | null;
  checkedInAt: Millis;
  bathingStartedAt: Millis;
  bathingCompletedAt: Millis;
  dryingStartedAt: Millis;
  dryingCompletedAt: Millis;
  groomingStartedAt: Millis;
  groomingCompletedAt: Millis;
  readyAt: Millis;
  completedAt: Millis;
};

export type DayTimingStageKey =
  | "waitBath" | "bathing" | "waitDry" | "drying"
  | "waitGroom" | "grooming" | "waitPickup";

export type DayTimingStage = {
  key: DayTimingStageKey;
  label: string;
  minutes: number | null;
  /** A gap between stages rather than work being done. */
  isWait: boolean;
};

type StageDef = {
  key: DayTimingStageKey;
  label: string;
  from: keyof DayTimingInput;
  to: keyof DayTimingInput;
  isWait: boolean;
};

/**
 * The day in order. Waits alternate with work, which is what makes a
 * pile-up legible: a row that is mostly amber was mostly queueing.
 */
export const DAY_TIMING_STAGES: readonly StageDef[] = [
  { key: "waitBath",   label: "Waiting for bath",  from: "checkedInAt",         to: "bathingStartedAt",    isWait: true  },
  { key: "bathing",    label: "Bathing",           from: "bathingStartedAt",    to: "bathingCompletedAt",  isWait: false },
  { key: "waitDry",    label: "Waiting for dry",   from: "bathingCompletedAt",  to: "dryingStartedAt",     isWait: true  },
  { key: "drying",     label: "Drying",            from: "dryingStartedAt",     to: "dryingCompletedAt",   isWait: false },
  { key: "waitGroom",  label: "Waiting for groom", from: "dryingCompletedAt",   to: "groomingStartedAt",   isWait: true  },
  { key: "grooming",   label: "Grooming",          from: "groomingStartedAt",   to: "groomingCompletedAt", isWait: false },
  { key: "waitPickup", label: "Ready, awaiting collection", from: "readyAt",    to: "completedAt",         isWait: true  },
];

/**
 * Minutes between two stamps, or null.
 *
 * Null rather than 0 for a stage that did not happen: a bath-only dog
 * never gets groomed, and a 0 would say it was groomed instantly. A
 * backwards pair is also null — a stamp written out of order is bad
 * data, not negative time.
 */
export function stageMinutes(from: Millis, to: Millis): number | null {
  if (!from || !to) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (to <= from) return null;
  return Math.round((to - from) / 60000);
}

export type DogDayTiming = {
  appointmentId: number;
  petName: string;
  clientName: string | null;
  groomerName: string | null;
  serviceType: string | null;
  workflowState: string;
  arrivedAt: number | null;
  finishedAt: number | null;
  stages: DayTimingStage[];
  /** Drop-off to the start of the bath — the measure Lauren asked for. */
  waitForBathMinutes: number | null;
  /** The configured ceiling for THIS dog, or null when none applies. */
  waitThresholdMinutes: number | null;
  /**
   * Past its ceiling. Null, not false, when there is nothing to judge:
   * a dog with no bath yet has not passed anything, and saying "within
   * target" of a dog nobody has started is worse than saying nothing.
   */
  overWait: boolean | null;
  /** Every gap added up, including the ones mid-groom. */
  totalWaitMinutes: number | null;
  /** Check-in to complete. Null until the dog has actually left. */
  totalMinutes: number | null;
  /** True once the dog is through; a dog still on the floor has no total. */
  finished: boolean;
};

export function dogDayTiming(row: DayTimingInput, now: number = Date.now()): DogDayTiming {
  const stages = DAY_TIMING_STAGES.map(def => ({
    key: def.key,
    label: def.label,
    isWait: def.isWait,
    minutes: stageMinutes(row[def.from] as Millis, row[def.to] as Millis),
  }));

  const waits = stages.filter(s => s.isWait && s.minutes !== null);
  const finished = row.workflowState === "complete";
  const waitForBath = stageMinutes(row.checkedInAt, row.bathingStartedAt);
  const ceiling = typeof row.waitThresholdMinutes === "number" && row.waitThresholdMinutes > 0
    ? row.waitThresholdMinutes
    : null;

  /* A dog still queueing has already waited this long, even though the
     bath has not started — otherwise the one dog you most want flagged
     is the one the report stays silent about. */
  const queueingFor = !waitForBath && row.checkedInAt && !row.bathingStartedAt && !finished
    ? stageMinutes(row.checkedInAt, now)
    : null;
  const judged = waitForBath ?? queueingFor;

  return {
    appointmentId: row.appointmentId,
    petName: row.petName?.trim() || "Unnamed dog",
    clientName: row.clientName?.trim() || null,
    groomerName: row.groomerName?.trim() || null,
    serviceType: row.serviceType ?? null,
    workflowState: row.workflowState,
    arrivedAt: row.checkedInAt ?? null,
    finishedAt: row.completedAt ?? null,
    stages,
    waitForBathMinutes: waitForBath,
    waitThresholdMinutes: ceiling,
    overWait: ceiling === null || judged === null ? null : judged > ceiling,
    totalWaitMinutes: waits.length ? waits.reduce((sum, s) => sum + (s.minutes ?? 0), 0) : null,
    totalMinutes: stageMinutes(row.checkedInAt, row.completedAt),
    finished,
  };
}

/**
 * The shape of the day, for the header.
 *
 * The median and the worst case are reported whether or not a wait
 * threshold is configured: they describe the day without needing a
 * standard to judge it against.
 *
 * `overWait` is counted only over the dogs whose own ceiling resolved,
 * and `judged` is that denominator — "3 of 12" is honest where a bare
 * "3" would not say out of what. In practice the salon always has a
 * ceiling, because `resolveTimingReviewThreshold` falls back to the
 * shipped default when nothing is configured; `judged` reaches 0 only
 * when a caller passes dogs with no threshold resolved at all, as the
 * unit tests do.
 */
export function dayTimingSummary(dogs: readonly DogDayTiming[]) {
  const waits = dogs
    .map(d => d.waitForBathMinutes)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);

  const median = waits.length === 0 ? null
    : waits.length % 2 === 1 ? waits[(waits.length - 1) / 2]
    : Math.round((waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2);

  const longest = dogs.reduce<DogDayTiming | null>((worst, d) => {
    if (d.waitForBathMinutes === null) return worst;
    if (!worst || worst.waitForBathMinutes === null) return d;
    return d.waitForBathMinutes > worst.waitForBathMinutes ? d : worst;
  }, null);

  const judged = dogs.filter(d => d.overWait !== null);

  return {
    dogs: dogs.length,
    /** How many had both a check-in and a bath start to measure between. */
    measured: waits.length,
    medianWaitMinutes: median,
    longestWaitMinutes: longest?.waitForBathMinutes ?? null,
    longestWaitPet: longest?.petName ?? null,
    /** Dogs with a resolved ceiling — the denominator for `overWait`. */
    judged: judged.length,
    overWait: judged.filter(d => d.overWait).length,
  };
}

/** Longest wait first — "where do I fix today" reads top-down. */
export function byLongestWait(dogs: readonly DogDayTiming[]): DogDayTiming[] {
  return [...dogs].sort((a, b) => {
    const aw = a.waitForBathMinutes, bw = b.waitForBathMinutes;
    if (aw === null && bw === null) return (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0);
    if (aw === null) return 1;
    if (bw === null) return -1;
    return bw - aw;
  });
}

/** Arrival order — how the morning actually unfolded. */
export function byArrival(dogs: readonly DogDayTiming[]): DogDayTiming[] {
  return [...dogs].sort((a, b) => {
    if (a.arrivedAt === null && b.arrivedAt === null) return 0;
    if (a.arrivedAt === null) return 1;
    if (b.arrivedAt === null) return -1;
    return a.arrivedAt - b.arrivedAt;
  });
}

/**
 * Which workflow state each stage IS, so the report can be drawn in the
 * salon's existing colours via `stageColour()`.
 *
 * Reused rather than given a palette of its own: a groomer already
 * reads amber as grooming and blue as bathing from the board and the
 * client portal, and a second scheme for the same seven things would
 * be one more thing to keep in step. The wait colours are already a
 * darker shade of the stage they precede, which is exactly the
 * distinction this report is about.
 */
export const DAY_TIMING_STAGE_STATE: Record<DayTimingStageKey, string> = {
  waitBath: "waiting_for_bath",
  bathing: "bathing",
  waitDry: "waiting_for_dry",
  drying: "drying",
  waitGroom: "waiting_for_groom",
  grooming: "grooming",
  waitPickup: "ready",
};

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
