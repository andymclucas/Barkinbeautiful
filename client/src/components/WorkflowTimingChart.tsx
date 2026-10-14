import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import { chartSeriesColours, CHART_MARKS } from "@shared/chartStyle";
import {
  formatStageDuration,
  slowestStage,
  splitTimingStages,
  timingChartRows,
  type TimingStage,
} from "@shared/workflowTimingChart";

/**
 * Where a dog's day actually goes.
 *
 * Horizontal, because the stage names are "Waiting for bath" and "Waiting
 * for groom" and vertical bars would turn them into tick labels at 45°.
 *
 * ONE hue, not eight. This compares magnitude across stages — a single
 * measure, minutes — and giving each stage its own colour would say the
 * stages are identities to be told apart when the only thing being asked
 * is which is longest. The slowest stage is lifted by opacity rather than
 * by a second hue, so the emphasis does not read as a second series.
 *
 * The TOTAL is a number above the plot, not a bar in it. It used to be a
 * bar: being the sum of the others it was always the longest, so every
 * stage was squashed against it and the full-width bar carried nothing.
 *
 * No line/bar picker here. The stages are categories in a sequence, not a
 * time axis — a line drawn through "Bathing" and "Drying" would imply a
 * rate of change between two things that are not points in time.
 */
export function WorkflowTimingChart({
  stages,
  sampleSize,
}: {
  stages: ReadonlyArray<TimingStage>;
  sampleSize: number;
}) {
  const { resolvedTheme } = useTheme();
  const colour = chartSeriesColours(resolvedTheme).current;
  const { total } = splitTimingStages(stages);
  const rows = timingChartRows(stages);
  const slowest = slowestStage(stages);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No workflow timing data for this period.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* The headline, as a number. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-bold tabular-nums">{formatStageDuration(total?.avgMinutes)}</span>
        <span className="text-xs text-muted-foreground">
          average check-in to complete, over {sampleSize} {sampleSize === 1 ? "dog" : "dogs"}
        </span>
      </div>
      {slowest && (
        <p className="text-xs text-muted-foreground">
          Longest stage: <span className="font-semibold text-foreground">{slowest.label}</span>{" "}
          at {formatStageDuration(slowest.avgMinutes)}.
        </p>
      )}

      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 38)}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
          barCategoryGap={CHART_MARKS.barCategoryGap}
        >
          {/* Recessive grid, and only along the measured axis. */}
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => formatStageDuration(v)}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={128}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              fontSize: 12,
              color: "hsl(var(--popover-foreground))",
            }}
            formatter={(value: unknown, _name: unknown, item: any) => [
              `${formatStageDuration(Number(value))} · ${item?.payload?.sampleSize ?? 0} samples`,
              "Average",
            ]}
          />
          <Bar dataKey="avgMinutes" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              // Emphasis by opacity, not by a second hue: the slowest stage
              // is the one worth looking at, and a different colour would
              // read as a different kind of thing.
              <Cell
                key={row.key}
                fill={colour}
                fillOpacity={slowest && row.key === slowest.key ? 1 : 0.55}
              />
            ))}
            {/* Direct labels, so the figure is readable without hovering —
                and so the chart survives being printed or screenshotted. */}
            <LabelList
              dataKey="avgMinutes"
              position="right"
              formatter={(v: number) => formatStageDuration(v)}
              style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
