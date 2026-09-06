export type LiveStageTimerInput = {
  workflowState: string;
  stageStartedAt?: number | null;
  checkedInAt?: number | null;
  scheduledStart: Date | string | number;
};

const NON_TIMED_STATES = new Set(["scheduled", "waiting_for_bath", "waiting_for_dry", "waiting_for_groom", "complete", "cancelled", "no_show"]);

/**
 * Returns the active-stage duration in whole seconds. The persisted stage entry
 * timestamp is authoritative, with check-in and scheduled-time fallbacks for
 * migrated appointments that pre-date workflow timing fields.
 */
export function getLiveStageElapsedSeconds(input: LiveStageTimerInput, now = Date.now()): number | null {
  if (NON_TIMED_STATES.has(input.workflowState)) return null;
  const startedAt = input.stageStartedAt ?? input.checkedInAt ?? new Date(input.scheduledStart).getTime();
  const elapsedMs = now - startedAt;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return Math.floor(elapsedMs / 1000);
}

export function formatLiveStageElapsed(seconds: number | null): string | null {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
