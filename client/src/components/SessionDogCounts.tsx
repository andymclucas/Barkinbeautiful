import { sessionDogCounts, AFTERNOON_SESSION_START } from "@shared/sessionDivider";
import type { SessionDividerRow } from "@shared/sessionDivider";

/**
 * How many dogs are in each half of the day.
 *
 * Andy, 29/10/2026: "Show the total number of dogs for the morning and
 * afternoon sessions as a noticeable number."
 *
 * It finishes what the red line started. Lauren asked for the line
 * because "today turned to shit cause too many were booked in the
 * morning" — the line shows where the split falls, but only the count
 * answers whether the day is actually balanced, which is the question
 * she was really asking. It is deliberately the largest thing in the
 * header: a number nobody notices would not have changed that day.
 *
 * Both halves read from the same rule that positions the line, so the
 * figure above the line always matches the rows above the line.
 */
export function SessionDogCounts({
  rows,
  className = "",
}: {
  rows: readonly SessionDividerRow[];
  className?: string;
}) {
  const counts = sessionDogCounts(rows);
  if (counts.total === 0) return null;

  const split = `${AFTERNOON_SESSION_START.hour}:${String(AFTERNOON_SESSION_START.minute).padStart(2, "0")}`;

  const Half = ({ label, value, tone, hint }: {
    label: string; value: number; tone: "morning" | "afternoon"; hint: string;
  }) => (
    <div
      data-testid={`session-count-${tone}`}
      className={`flex min-w-0 flex-1 items-baseline gap-2 rounded-lg border px-3 py-1.5 ${
        tone === "afternoon"
          ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30"
          : "border-border bg-muted/40"
      }`}
    >
      <span
        className={`text-2xl font-bold leading-none tabular-nums ${
          tone === "afternoon" ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block text-[10px] text-muted-foreground">{hint}</span>
      </span>
    </div>
  );

  return (
    <div className={`flex flex-wrap items-stretch gap-2 ${className}`}>
      <Half label="Morning" value={counts.morning} tone="morning" hint={`before ${split}`} />
      <Half label="Afternoon" value={counts.afternoon} tone="afternoon" hint={`${split} on`} />
      {/* Said out loud rather than left as a silent gap. These halves
          count dogs who are COMING, so they no longer add up to the
          "N appointments" beside them — and two numbers that disagree
          with no explanation is how somebody decides one is broken. */}
      {counts.excluded > 0 && (
        <div
          data-testid="session-count-excluded"
          className="flex min-w-0 items-baseline gap-2 rounded-lg border border-dashed px-3 py-1.5"
          title="Cancelled and no-show dogs still show on the board, but are not counted as work."
        >
          <span className="text-2xl font-bold leading-none tabular-nums text-muted-foreground">
            {counts.excluded}
          </span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Not coming
          </span>
        </div>
      )}
      {/* Only when there is one. A dog whose time cannot be read belongs
          to neither session, and folding it into one would overstate
          that half — but it must not simply vanish from the day. */}
      {counts.unknown > 0 && (
        <div
          data-testid="session-count-unknown"
          className="flex min-w-0 items-baseline gap-2 rounded-lg border border-dashed px-3 py-1.5"
        >
          <span className="text-2xl font-bold leading-none tabular-nums text-muted-foreground">
            {counts.unknown}
          </span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            No time
          </span>
        </div>
      )}
    </div>
  );
}

export default SessionDogCounts;
