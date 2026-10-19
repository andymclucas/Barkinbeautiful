import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import { chartSeriesColours, CHART_MARKS, CHART_TOKENS, chartTooltipStyle, CHART_TOOLTIP_MOTION } from "@shared/chartStyle";
import { ChartStyleToggle, useChartStyle } from "@/components/ChartStyleToggle";
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
 * The line form exists because Andy asked for the picker on every chart
 * after hearing the objection: the stages are categories in a sequence,
 * not a time axis, so a line through "Bathing" and "Drying" implies a rate
 * of change between two things that are not points in time. His call.
 *
 * It is at least built to be read. A line runs left to right, so choosing
 * it turns the chart the right way up — stages along the bottom, minutes
 * up the side — rather than drawing a line down a sideways axis. The long
 * stage names are angled to fit, which is the cost of that orientation and
 * the reason bars are the default.
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
  // Opens on bars: comparing magnitude across stages is what this asks.
  const { style, choose } = useChartStyle("reportingTiming", "comparison");
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
      {/* The headline, as a number, with the form picker on the same row —
          everything that changes what the chart shows stays together. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-bold tabular-nums">{formatStageDuration(total?.avgMinutes)}</span>
          <span className="text-xs text-muted-foreground">
            average check-in to complete, over {sampleSize} {sampleSize === 1 ? "dog" : "dogs"}
          </span>
        </div>
        <ChartStyleToggle style={style} onChange={choose} label="Workflow timing chart style" />
      </div>
      {slowest && (
        <p className="text-xs text-muted-foreground">
          Longest stage: <span className="font-semibold text-foreground">{slowest.label}</span>{" "}
          at {formatStageDuration(slowest.avgMinutes)}.
        </p>
      )}

      {/* Bars read down a sideways axis so the long stage names fit; a
          line reads left to right, so it turns the chart the right way up
          and angles the labels instead. Same data, same colour, same
          tooltip — only the orientation follows the form. */}
      <ResponsiveContainer
        width="100%"
        height={style === "bar" ? Math.max(160, rows.length * 38) : 260}
      >
        <ComposedChart
          data={rows}
          layout={style === "bar" ? "vertical" : "horizontal"}
          margin={
            style === "bar"
              ? { top: 4, right: 56, left: 4, bottom: 4 }
              : { top: 12, right: 16, left: 0, bottom: 48 }
          }
          barCategoryGap={CHART_MARKS.barCategoryGap}
        >
          {/* Recessive grid, and only along the measured axis. */}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_TOKENS.grid}
            horizontal={style !== "bar"}
            vertical={style === "bar"}
          />
          {style === "bar" ? (
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: CHART_TOKENS.axisText }}
              tickFormatter={(v: number) => formatStageDuration(v)}
              tickLine={false}
              axisLine={{ stroke: CHART_TOKENS.grid }}
            />
          ) : (
            <XAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: CHART_TOKENS.axisText }}
              tickLine={false}
              axisLine={{ stroke: CHART_TOKENS.grid }}
              angle={-35}
              textAnchor="end"
              height={56}
              interval={0}
            />
          )}
          {style === "bar" ? (
            <YAxis
              type="category"
              dataKey="label"
              width={128}
              tick={{ fontSize: 11, fill: CHART_TOKENS.axisText }}
              tickLine={false}
              axisLine={false}
            />
          ) : (
            <YAxis
              type="number"
              tick={{ fontSize: 10, fill: CHART_TOKENS.axisText }}
              tickFormatter={(v: number) => formatStageDuration(v)}
              tickLine={false}
              axisLine={false}
              width={56}
            />
          )}
          <Tooltip {...CHART_TOOLTIP_MOTION}
            cursor={{ fill: CHART_TOKENS.cursorFill, fillOpacity: 0.4 }}
            contentStyle={chartTooltipStyle()}
            formatter={(value: unknown, _name: unknown, item: any) => [
              `${formatStageDuration(Number(value))} \u00b7 ${item?.payload?.sampleSize ?? 0} samples`,
              "Average",
            ]}
          />
          {/* Separate conditionals rather than a fragment: recharts inspects
              its children to find the axes, and a fragment hides them. */}
          {style === "bar" && (
            <Bar dataKey="avgMinutes" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                // Emphasis by opacity, not by a second hue: the slowest
                // stage is the one worth looking at, and another colour
                // would read as another kind of thing.
                <Cell
                  key={row.key}
                  fill={colour}
                  fillOpacity={slowest && row.key === slowest.key ? 1 : 0.55}
                />
              ))}
              {/* Direct labels, so the figures survive a screenshot. */}
              <LabelList
                dataKey="avgMinutes"
                position="right"
                formatter={(v: number) => formatStageDuration(v)}
                style={{ fontSize: 11, fill: CHART_TOKENS.axisText }}
              />
            </Bar>
          )}
          {style === "line" && (
            <Line
              type="monotone"
              dataKey="avgMinutes"
              stroke={colour}
              strokeWidth={CHART_MARKS.lineWidth}
              dot={{ r: CHART_MARKS.dotRadius, fill: colour }}
              activeDot={{ r: CHART_MARKS.activeDotRadius }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="avgMinutes"
                position="top"
                formatter={(v: number) => formatStageDuration(v)}
                style={{ fontSize: 11, fill: CHART_TOKENS.axisText }}
              />
            </Line>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
