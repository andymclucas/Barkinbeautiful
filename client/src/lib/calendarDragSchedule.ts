const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

export function buildAestDragSchedule(params: {
  sourceStart: Date;
  durationMs: number;
  minutesFromSeven: number;
}) {
  const aestSource = new Date(params.sourceStart.getTime() + AEST_OFFSET_MS);
  const aestMidnightUtc = Date.UTC(
    aestSource.getUTCFullYear(),
    aestSource.getUTCMonth(),
    aestSource.getUTCDate(),
  );
  const scheduledStart = new Date(
    aestMidnightUtc + (7 * 60 + params.minutesFromSeven) * 60_000 - AEST_OFFSET_MS,
  );
  const scheduledEnd = new Date(scheduledStart.getTime() + params.durationMs);

  return {
    scheduledStart,
    scheduledEnd,
    scheduledStartIso: scheduledStart.toISOString(),
    scheduledEndIso: scheduledEnd.toISOString(),
  };
}
