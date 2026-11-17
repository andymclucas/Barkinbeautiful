import { changeVersus } from "@shared/reportPreviousPeriod";

/**
 * "▲ 12.4% vs previous year ($590,123.00)" under a report figure.
 *
 * The earlier figure is shown as well as the percentage, so the movement
 * can be checked rather than taken on trust, and so a period with nothing
 * in it reads as "nothing to compare" instead of a made-up percentage.
 */
export function VersusPrevious({
  current,
  previous,
  name,
  format,
  loading = false,
  failed = false,
}: {
  /** The earlier period could not be fetched: say so, rather than "…" for ever. */
  failed?: boolean;
  current: number;
  /** Undefined while the earlier period is still being fetched. */
  previous: number | undefined;
  /** "previous week", "previous month", "previous year"… */
  name: string;
  format: (value: number) => string;
  loading?: boolean;
}) {
  if (failed) {
    return <p className="mt-0.5 text-[11px] text-muted-foreground">vs {name}: not available</p>;
  }
  if (loading || previous === undefined) {
    return <p className="mt-0.5 text-[11px] text-muted-foreground">vs {name}: …</p>;
  }
  const change = changeVersus(current, previous);
  if (change.percent === null) {
    return (
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        vs {name}: {current === 0 ? "nothing in either" : "nothing to compare"}
      </p>
    );
  }
  const tone = change.direction === "up"
    ? "text-emerald-700 dark:text-emerald-400"
    : change.direction === "down"
      ? "text-rose-700 dark:text-rose-400"
      : "text-muted-foreground";
  const arrow = change.direction === "up" ? "▲" : change.direction === "down" ? "▼" : "•";
  const word = change.direction === "up" ? "Up" : change.direction === "down" ? "Down" : "Level";
  return (
    <p className="mt-0.5 text-[11px] text-muted-foreground">
      <span className={`font-semibold ${tone}`}>
        <span aria-hidden="true">{arrow} </span>
        <span className="sr-only">{word} </span>
        {change.direction === "flat" ? "No change" : `${change.percent.toLocaleString("en-AU")}%`}
      </span>{" "}
      vs {name} ({format(previous)})
    </p>
  );
}
