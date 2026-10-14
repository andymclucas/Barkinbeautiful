/**
 * Preparing the workflow timing report for a chart.
 *
 * The report answers one question: where does a dog's day actually go?
 * It is the only thing on the Reporting tab that is not also on Analytics,
 * and until now it was drawn as proportion bars in plain HTML with the
 * TOTAL sitting in the same list as the stages it is made of.
 *
 * That is why it was hard to read. Every bar was scaled against the longest
 * value, and the longest value was always the total — so the stages were
 * squashed into the left third of the card and the one bar that reached the
 * end carried no information at all. A total is not a category alongside
 * its own parts; it is a headline, and it belongs above them as a number.
 */

export type TimingStage = {
  key: string;
  label: string;
  avgMinutes: number;
  sampleSize: number;
};

/** The row the server sends for the whole check-in-to-complete span. */
export const TOTAL_STAGE_KEY = "total";

export function splitTimingStages(stages: ReadonlyArray<TimingStage>): {
  total: TimingStage | null;
  stages: TimingStage[];
} {
  const total = stages.find((stage) => stage.key === TOTAL_STAGE_KEY) ?? null;
  return { total, stages: stages.filter((stage) => stage.key !== TOTAL_STAGE_KEY) };
}

/**
 * Stages are left in the order the server sends them, which is the order a
 * dog goes through them. Sorting by length would read as a ranking and lose
 * the one thing the sequence tells you — where in the day the time goes.
 */
export function timingChartRows(stages: ReadonlyArray<TimingStage>): TimingStage[] {
  return splitTimingStages(stages).stages.filter((stage) => stage.sampleSize > 0);
}

/**
 * The stage taking longest, for the one sentence worth saying out loud.
 * Null when nothing has enough data to compare.
 */
export function slowestStage(stages: ReadonlyArray<TimingStage>): TimingStage | null {
  const rows = timingChartRows(stages);
  if (rows.length === 0) return null;
  return rows.reduce((slowest, stage) => (stage.avgMinutes > slowest.avgMinutes ? stage : slowest), rows[0]);
}

/**
 * "1h 20m", "45m", "—".
 *
 * Minutes are rounded, not truncated: 89.6 minutes is an hour and a half,
 * and "1h 29m" reads as precision the average does not have.
 */
export function formatStageDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return "—";
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
