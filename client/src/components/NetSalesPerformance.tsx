import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPARISON_LABELS, type ComparisonMode } from "@shared/comparisonPeriod";

/**
 * Net sales over the selected range, against a comparison period.
 *
 * The comparison is a choice because the two questions are different ones.
 * Month-on-month flatters or punishes a seasonal business — a grooming salon
 * is flat out before Christmas and quiet in January, so December always wins
 * and January always looks like a collapse. Year-on-year is the one that says
 * whether the business is actually growing.
 *
 * "Net sales" here is the same figure the summary cards call collected, from
 * the same query shape, so the two never disagree about one week.
 *
 * Colours are stepped per mode rather than flipped: both pairs were run
 * through the palette validator against their own surface (lightness band,
 * chroma, colour-blind separation, and contrast). The amber holds in both;
 * only the violet changes step.
 */
const SERIES = {
  light: { current: "#7c3aed", prior: "#d97706" },
  dark: { current: "#8b5cf6", prior: "#d97706" },
};

const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export function NetSalesPerformance({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const [comparison, setComparison] = useState<ComparisonMode>("prior_period");
  const { resolvedTheme } = useTheme();
  const colours = resolvedTheme === "dark" ? SERIES.dark : SERIES.light;

  const { data, isLoading, isError } = trpc.analyticsExt.netSalesPerformance.useQuery({
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    comparison,
  });

  const points = data?.points ?? [];
  const change = data?.percentChange ?? null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        {/* Filters in one row above the plot. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">Net sales performance</CardTitle>
            {data && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {money(data.currentTotal)}
                {change === null ? (
                  // No baseline to divide by — saying "up ∞%" would be noise.
                  <span className="ml-1.5">· no comparable sales</span>
                ) : (
                  <span className={`ml-1.5 font-semibold ${change < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {change < 0 ? "▼" : "▲"} {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </p>
            )}
          </div>
          <Select value={comparison} onValueChange={(v) => setComparison(v as ComparisonMode)}>
            <SelectTrigger className="h-8 w-[15rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prior_period">{COMPARISON_LABELS.prior_period}</SelectItem>
              <SelectItem value="prior_year">{COMPARISON_LABELS.prior_year}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          /* Not the same as no sales, and saying so matters: this chart read
             "No sales in this period" for months while its query was being
             rejected by the database on every single load. */
          <p className="py-16 text-center text-sm text-amber-700 dark:text-amber-300" role="alert">
            Sales could not be loaded. This is not an empty month — something went wrong fetching it.
          </p>
        ) : points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                {/* Recessive grid and axes: the lines are the content. */}
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                {/* Crosshair + tooltip: a line chart should answer "what is
                    that point?" without anyone having to ask. */}
                <Tooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "hsl(var(--popover-foreground))",
                  }}
                  labelFormatter={(iso: string) => shortDate(String(iso))}
                  formatter={(value: unknown, name: unknown, item: any) => {
                    const label = String(name) === "net"
                      ? "This period"
                      : `Comparison${item?.payload?.priorDate ? ` (${shortDate(item.payload.priorDate)})` : ""}`;
                    // A comparison period shorter than the current one leaves
                    // null tail points; show the gap rather than a false $0.
                    if (value === null || value === undefined) return ["—", label];
                    return [money(Number(value)), label];
                  }}
                />
                <Legend
                  formatter={(v: string) => (v === "net" ? "This period" : COMPARISON_LABELS[comparison])}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {/* The comparison sits behind, dashed — a second encoding so
                    the two are told apart without relying on colour. */}
                {/* isAnimationActive off deliberately. Recharts draws the
                    line by animating stroke-dasharray with requestAnimationFrame,
                    and rAF does not run while the document is hidden — a chart
                    mounted in a background tab stays blank at dasharray "0px,
                    604px" instead of drawing. A revenue screen should be
                    readable the instant it renders anyway. */}
                <Line
                  type="monotone"
                  dataKey="priorNet"
                  name="priorNet"
                  stroke={colours.prior}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="net"
                  stroke={colours.current}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            {data?.priorRange?.from && (
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                Comparing {shortDate(data.currentRange.from!)} – {shortDate(data.currentRange.to!)} against{" "}
                {shortDate(data.priorRange.from)} – {shortDate(data.priorRange.to!)}
                {data.previousTotal > 0 ? ` (${money(data.previousTotal)})` : ""}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
