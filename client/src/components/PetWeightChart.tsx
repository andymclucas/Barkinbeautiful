import { weightTrend, describeWeightTrend, type WeightEntry } from "@shared/petWeightHistory";

/**
 * A dog's weight over time.
 *
 * Plain props and no tRPC, so it can actually be rendered in a test —
 * CLAUDE.md §7. The page does the fetching.
 *
 * A thin line with a dot per weighing, not a bar chart and not a
 * library: a salon dog has between two and a dozen readings, and the
 * question is always "which way is it going", which one line answers
 * and twelve bars obscure. The newest reading is labelled; the rest are
 * in the tooltip and the table below, because a number on every point
 * turns a trend into a receipt.
 *
 * One hue, drawn from the brand. Weight is a single measure over time —
 * there is nothing here for a second colour to mean, and a colour that
 * means nothing is decoration.
 */

const W = 320;
const H = 90;
const PAD_X = 10;
const PAD_Y = 14;

export function PetWeightChart({
  entries,
  petName,
}: {
  entries: WeightEntry[];
  petName?: string | null;
}) {
  const trend = weightTrend(entries);
  const { points } = trend;
  const sentence = describeWeightTrend(trend);

  if (points.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No weighings recorded yet. Saving a weight starts the history.
      </p>
    );
  }

  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  /* A dog whose weight has not moved would divide by zero and draw a
     line through the roof. A flat line across the middle is the honest
     picture of "no change". */
  const span = max - min || 1;
  const times = points.map((p) => p.at.getTime());
  const firstTime = times[0]!;
  const timeSpan = (times[times.length - 1]! - firstTime) || 1;

  const x = (i: number) =>
    points.length === 1
      ? W / 2
      : PAD_X + ((times[i]! - firstTime) / timeSpan) * (W - PAD_X * 2);
  const y = (kg: number) => H - PAD_Y - ((kg - min) / span) * (H - PAD_Y * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(" ");
  const latest = points[points.length - 1]!;
  const dateOf = (at: Date) =>
    at.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[90px] w-full"
        role="img"
        aria-label={`${petName ? `${petName}'s weight` : "Weight"} over ${points.length} ${points.length === 1 ? "reading" : "readings"}. ${sentence ?? ""}`}
      >
        {/* Recessive baseline — enough to sit the line on, not enough to
            compete with it. */}
        <line
          x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y}
          stroke="currentColor" strokeWidth="1" className="text-border"
        />
        {points.length > 1 && (
          <path d={path} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="text-primary" stroke="currentColor" />
        )}
        {points.map((p, i) => (
          <circle
            key={p.id}
            cx={x(i)} cy={y(p.kg)} r={i === points.length - 1 ? 5 : 4}
            className={i === points.length - 1 ? "text-primary" : "text-primary/60"}
            fill="currentColor"
          >
            <title>{`${p.kg} kg · ${dateOf(p.at)}`}</title>
          </circle>
        ))}
        {/* Only the newest is labelled. */}
        <text
          x={Math.min(x(points.length - 1) + 8, W - 4)}
          y={Math.max(y(latest.kg) - 8, 12)}
          textAnchor={x(points.length - 1) > W - 60 ? "end" : "start"}
          className="fill-foreground text-[11px] font-semibold"
        >
          {latest.kg} kg
        </text>
      </svg>

      {sentence && <p className="text-xs text-muted-foreground">{sentence}</p>}

      {/* The same numbers as text, because a line is not readable by a
          screen reader and a graph is not a record. */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          All {points.length} {points.length === 1 ? "reading" : "readings"}
        </summary>
        <ul className="mt-1.5 space-y-0.5">
          {[...points].reverse().map((p) => (
            <li key={p.id} className="flex justify-between gap-4 tabular-nums">
              <span className="text-muted-foreground">{dateOf(p.at)}</span>
              <span className="font-semibold">{p.kg} kg</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
