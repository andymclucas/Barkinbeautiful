/**
 * How long a dog spent in each workflow stage, including the waits.
 *
 * The existing timing only captured bathing, drying and grooming - the three
 * stages where someone is actively working. The three waiting_for_* stages,
 * where nobody is, were not measured at all. That is the wrong half: a dog
 * sitting 45 minutes in "waiting for dry" is the thing worth knowing about,
 * because it points at either a capacity problem or a training one, and until
 * now it left no trace.
 *
 * Nothing new needs storing. workflowLogs already records every transition
 * with a timestamp, so every duration is the gap between entering a state and
 * leaving it. This derives them, so it can be unit-tested without a database
 * and reused by the board, the staff profile and any later reporting.
 */

export const WORKFLOW_STAGE_ORDER = [
  "scheduled",
  "checked_in",
  "waiting_for_bath",
  "bathing",
  "waiting_for_dry",
  "drying",
  "waiting_for_groom",
  "grooming",
  "ready",
  "complete",
] as const;

export type TimedStage = (typeof WORKFLOW_STAGE_ORDER)[number];

/** The stages where a dog is waiting on us rather than being worked on. */
export const WAITING_STAGES: readonly TimedStage[] = [
  "waiting_for_bath",
  "waiting_for_dry",
  "waiting_for_groom",
  "ready", // waiting for collection - also a wait, and also worth watching
];

export const isWaitingStage = (stage: string): boolean =>
  (WAITING_STAGES as readonly string[]).includes(stage);

/** One row of workflow_logs, reduced to what a duration needs. */
export interface StageTransition {
  toState: string;
  /** Epoch ms. workflowLogs.changedAtMs, falling back to changedAt. */
  changedAtMs: number;
}

export interface StageDuration {
  stage: string;
  minutes: number;
  isWaiting: boolean;
  /** True when the dog is still in this stage, so the clock is running. */
  ongoing: boolean;
}

/**
 * Durations per stage, in the order they happened.
 *
 * `now` lets the caller measure a dog still on the floor: the last stage runs
 * up to now rather than being dropped. Pass the same clock you display with.
 *
 * Transitions are sorted defensively - workflow_logs is usually in order, but
 * a clock skew or a bulk import should not produce negative durations.
 */
export function stageDurations(
  transitions: StageTransition[],
  now: number,
  options: { includeOngoing?: boolean } = {},
): StageDuration[] {
  const { includeOngoing = true } = options;
  const sorted = [...transitions]
    .filter((t) => Number.isFinite(t.changedAtMs))
    .sort((a, b) => a.changedAtMs - b.changedAtMs);
  if (sorted.length === 0) return [];

  const out: StageDuration[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const entered = sorted[i];
    const left = sorted[i + 1];
    const isLast = !left;
    if (isLast && !includeOngoing) break;

    const endedAt = left ? left.changedAtMs : now;
    const ms = Math.max(0, endedAt - entered.changedAtMs);
    out.push({
      stage: entered.toState,
      minutes: Math.round(ms / 60000),
      isWaiting: isWaitingStage(entered.toState),
      ongoing: isLast,
    });
  }
  return out;
}

/** Total minutes spent waiting, across every waiting stage. */
export function totalWaitMinutes(durations: StageDuration[]): number {
  return durations.reduce((n, d) => n + (d.isWaiting ? d.minutes : 0), 0);
}

/** Total minutes of actual work - the complement of the waits. */
export function totalActiveMinutes(durations: StageDuration[]): number {
  return durations.reduce((n, d) => n + (d.isWaiting ? 0 : d.minutes), 0);
}

/**
 * The single longest wait, which is the one a manager wants surfaced.
 * Returns null when the dog has not waited anywhere.
 */
export function longestWait(durations: StageDuration[]): StageDuration | null {
  const waits = durations.filter((d) => d.isWaiting && d.minutes > 0);
  if (waits.length === 0) return null;
  return waits.reduce((worst, d) => (d.minutes > worst.minutes ? d : worst));
}

/** "Waiting for dry" from "waiting_for_dry", for display. */
export function stageLabel(stage: string): string {
  return stage
    .split("_")
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ")
    .replace(/^Waiting for/, "Waiting for");
}
