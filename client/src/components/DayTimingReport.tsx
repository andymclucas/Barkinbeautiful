import {
  dayTimingSummary, byLongestWait, byArrival, formatMinutes,
  DAY_TIMING_STAGES, DAY_TIMING_STAGE_STATE, type DogDayTiming,
} from "@shared/dayTimingReport";
import { stageColour } from "@shared/workflowStageColours";
import { getActiveTimeZone } from "@/lib/timezone";
import { useState } from "react";

/**
 * Where a grooming day went, dog by dog.
 *
 * Each dog is one bar, every bar on the same scale, so a dog that took
 * twice as long draws twice as wide. The waits are the darker shade of
 * the stage they precede — the salon's own board colours — which makes
 * a morning pile-up read as a row of long dark blocks before any
 * number is looked at.
 *
 * Lauren, 29/10/2026: "I'm trying to work out where to fix today."
 */

const LEGEND = DAY_TIMING_STAGES.map(def => ({
  key: def.key,
  label: def.label,
  isWait: def.isWait,
  colour: stageColour(DAY_TIMING_STAGE_STATE[def.key]),
}));

const clock = (ms: number | null) =>
  ms === null ? "—" : new Date(ms).toLocaleTimeString("en-AU", {
    hour: "numeric", minute: "2-digit", timeZone: getActiveTimeZone(),
  });

export function DayTimingReport({ dogs }: { dogs: readonly DogDayTiming[] }) {
  const [order, setOrder] = useState<"arrival" | "wait">("arrival");
  const summary = dayTimingSummary(dogs);

  if (dogs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No dogs on this day.</p>;
  }

  /* One scale for every bar. Without it each dog fills its own row and
     the longest day looks exactly like the shortest. */
  const longestRun = Math.max(
    1,
    ...dogs.map(d => d.stages.reduce((sum, s) => sum + (s.minutes ?? 0), 0)),
  );

  const rows = order === "wait" ? byLongestWait(dogs) : byArrival(dogs);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">{summary.dogs} dog{summary.dogs === 1 ? "" : "s"}</span>
          <span className="text-muted-foreground">
            Median wait for a bath{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatMinutes(summary.medianWaitMinutes)}
            </span>
          </span>
          {summary.longestWaitPet && (
            <span className="text-muted-foreground">
              Longest{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatMinutes(summary.longestWaitMinutes)}
              </span>{" "}
              ({summary.longestWaitPet})
            </span>
          )}
        </div>

        <div className="flex shrink-0 rounded-md border p-0.5 text-xs">
          {([["arrival", "Arrival order"], ["wait", "Longest wait"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrder(key)}
              aria-pressed={order === key}
              className={`rounded px-2 py-1 transition-colors ${
                order === key ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Identity is never colour alone: every block is named here, and
          each dog's own figures are written beside its bar. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {LEGEND.map(l => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: l.colour }} aria-hidden="true" />
            {l.label}
          </span>
        ))}
      </div>

      <div className="divide-y">
        {rows.map(dog => {
          const run = dog.stages.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
          return (
            <div key={dog.appointmentId} className="py-2.5" data-testid="dog-row" data-dog={dog.petName}>
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">
                  {dog.petName}
                  {dog.groomerName && (
                    <span className="ml-1.5 font-normal text-muted-foreground">· {dog.groomerName}</span>
                  )}
                </p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  in {clock(dog.arrivedAt)}
                </p>
              </div>

              <div className="mt-1.5 flex h-2 gap-[2px] overflow-hidden rounded-full" role="presentation" data-testid="dog-bar">
                {dog.stages.map(stage => {
                  if (!stage.minutes) return null;
                  return (
                    <span
                      key={stage.key}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${(stage.minutes / longestRun) * 100}%`,
                        background: stageColour(DAY_TIMING_STAGE_STATE[stage.key]),
                      }}
                      title={`${stage.label} — ${formatMinutes(stage.minutes)}`}
                    />
                  );
                })}
                {run === 0 && <span className="h-full w-full rounded-full bg-muted" />}
              </div>

              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  Waited <span className="font-medium text-foreground">{formatMinutes(dog.waitForBathMinutes)}</span> for a bath
                </span>
                {dog.totalWaitMinutes !== null && (
                  <span className="tabular-nums">{formatMinutes(dog.totalWaitMinutes)} waiting in all</span>
                )}
                {dog.finished
                  ? <span className="tabular-nums">{formatMinutes(dog.totalMinutes)} in the salon</span>
                  : <span className="font-medium text-foreground">Still here · {dog.workflowState.replace(/_/g, " ")}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
