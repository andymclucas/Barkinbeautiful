/**
 * How a time series is drawn, and what colour each period gets.
 *
 * Two things live here rather than in the components, because both were
 * about to be written out twice — once on the dashboard's net sales chart
 * and once on the analytics time series — and a chart that disagrees with
 * the chart on the next tab about which colour means "last year" is worse
 * than either choice on its own.
 *
 * ## The form
 *
 * Line and bar answer slightly different questions about the same numbers.
 * A line reads as a continuous trend and makes the SHAPE of the period
 * legible — where it climbed, where it fell away. Bars read as a set of
 * discrete amounts and make one day comparable with its neighbour, which
 * is what somebody asking "was Tuesday any good" wants.
 *
 * Neither is correct in general, which is why this is a choice rather than
 * a rule. The default is the one that fits the question the chart's title
 * asks; `defaultChartStyle` holds that mapping.
 *
 * ## The colours
 *
 * Current and prior period are a CATEGORICAL pair: two identities, not a
 * magnitude and not a polarity. So they get two fixed hues, assigned in a
 * fixed order and never cycled — the prior period is always the amber, in
 * every chart, in both themes.
 *
 * Both modes were run through the palette validator (lightness band, chroma
 * floor, colour-blind separation, normal-vision floor, contrast against the
 * chart surface) on the adjacent AND all-pairs lists, because a bar chart
 * puts the two side by side where a line chart only ever has them crossing:
 *
 *   light  #7c3aed / #d97706 — CVD ΔE 34.6, normal ΔE 38.2, all pass
 *   dark   #8b5cf6 / #d97706 — CVD ΔE 32.9, normal ΔE 34.1, all pass
 *
 * Those margins are far above the ≥8 CVD target and ≥15 normal-vision
 * floor, which is why the same pair is safe as bars as well as lines. The
 * dark steps are chosen for the dark surface rather than being the light
 * ones lightened.
 */

export const CHART_STYLES = ["line", "bar"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

export const CHART_STYLE_LABELS: Record<ChartStyle, string> = {
  line: "Line",
  bar: "Bar",
};

export const CHART_STYLE_HINTS: Record<ChartStyle, string> = {
  line: "Shows the shape of the period — where it climbed and where it fell away",
  bar: "Compares one day against the next",
};

/**
 * What a chart opens on, by the question it is asking.
 *
 * `trend` is a run of days read as a shape; `comparison` is a set of
 * amounts read against each other. A chart that opens on the wrong one is
 * still readable, which is why this is a default and not a constraint.
 */
export type ChartIntent = "trend" | "comparison";

export function defaultChartStyle(intent: ChartIntent): ChartStyle {
  return intent === "comparison" ? "bar" : "line";
}

export type ChartSeriesColours = {
  /** The period being looked at. */
  current: string;
  /** Whatever it is being measured against. Always the amber. */
  prior: string;
};

const SERIES_COLOURS: Record<"light" | "dark", ChartSeriesColours> = {
  light: { current: "#7c3aed", prior: "#d97706" },
  dark: { current: "#8b5cf6", prior: "#d97706" },
};

export function chartSeriesColours(theme: string | null | undefined): ChartSeriesColours {
  return theme === "dark" ? SERIES_COLOURS.dark : SERIES_COLOURS.light;
}

/**
 * Two MEASURES on one chart, as distinct from two periods.
 *
 * Appointment revenue against membership revenue is a categorical pair
 * like current-against-prior, but it is not the same pair and must not
 * borrow those hues: amber means "the period being compared against"
 * everywhere else in the app, and reusing it for membership revenue would
 * make the legend the only thing carrying the meaning.
 *
 * These are slots 1 and 2 of the documented categorical order, taken in
 * order rather than chosen. Validated all-pairs in both modes:
 *
 *   light  #2a78d6 / #eb6834 — CVD ΔE 24.7, normal ΔE 33.6, contrast ≥3:1
 *   dark   #3987e5 / #d95926 — CVD ΔE 26.8, normal ΔE 31.8, contrast ≥3:1
 *
 * They replace #3b82f6/#f59e0b, which were never run through the checks
 * and failed two of them: the amber sat at lightness 0.769 against the
 * dark band's 0.48–0.67 ceiling, and at 2.09:1 against the light surface,
 * under the 3:1 floor. The chart also had no theme awareness at all — one
 * pair of hardcoded hexes for both surfaces.
 */
export type ChartMeasureColours = { primary: string; secondary: string };

const MEASURE_COLOURS: Record<"light" | "dark", ChartMeasureColours> = {
  light: { primary: "#2a78d6", secondary: "#eb6834" },
  dark: { primary: "#3987e5", secondary: "#d95926" },
};

export function chartMeasureColours(theme: string | null | undefined): ChartMeasureColours {
  return theme === "dark" ? MEASURE_COLOURS.dark : MEASURE_COLOURS.light;
}

/**
 * Mark geometry, so a bar on one tab is the same bar on the next.
 *
 * The radius rounds the data END only and stays square on the baseline:
 * a bar rounded at the bottom no longer starts at zero, which misreads the
 * value it is drawing. The gap is what keeps two adjacent bars from
 * reading as one block.
 */
export const CHART_MARKS = {
  /** Top corners only — the baseline stays square. */
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  /** Surface showing between adjacent bars. */
  barGap: 2,
  /** Space between one day's pair of bars and the next day's. */
  barCategoryGap: "18%",
  lineWidth: 2,
  /** Hover target, bigger than the mark it belongs to. */
  dotRadius: 4,
  activeDotRadius: 5,
} as const;

/**
 * Theme tokens the charts paint with.
 *
 * Written as `var(--token)`, NOT `hsl(var(--token))`. This app's tokens
 * are complete oklch colours (`--popover: oklch(1 0 0)`), so wrapping one
 * in `hsl()` yields `hsl(oklch(1 0 0))` — invalid CSS, which the browser
 * drops without a word.
 *
 * That is not hypothetical. Every chart here declared its grid, axis text
 * and tooltip in `hsl(var(--...))`, all of it was discarded, and the net
 * sales tooltip rendered as bare text floating over the bars with no box
 * at all. 23 declarations across three charts, none of them doing
 * anything.
 */
export const CHART_TOKENS = {
  grid: "var(--border)",
  axisText: "var(--muted-foreground)",
  surface: "var(--popover)",
  surfaceText: "var(--popover-foreground)",
  cursorLine: "var(--muted-foreground)",
  cursorFill: "var(--muted)",
} as const;

/**
 * How solid the hover card is.
 *
 * Deliberately translucent: the tooltip covers the marks it is describing,
 * and a solid panel hides the very bars being compared. At 60% the shape
 * underneath still reads.
 */
export const CHART_TOOLTIP_OPACITY = 0.6;

/**
 * The hover card's styling, shared so the charts cannot drift apart.
 *
 * The blur is what makes 60% legible. Without it, dark text at this alpha
 * over a saturated bar is a guess rather than a figure, and a tooltip you
 * have to squint at is worse than an opaque one.
 */
export function chartTooltipStyle(opacity: number = CHART_TOOLTIP_OPACITY) {
  const pct = Math.round(Math.min(1, Math.max(0, opacity)) * 100);
  return {
    background: `color-mix(in oklab, ${CHART_TOKENS.surface} ${pct}%, transparent)`,
    border: `1px solid color-mix(in oklab, ${CHART_TOKENS.grid} ${pct}%, transparent)`,
    borderRadius: 10,
    fontSize: 12,
    color: CHART_TOKENS.surfaceText,
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    // Without a shadow a translucent panel reads as part of the chart
    // rather than as something floating above it.
    boxShadow: "0 4px 16px oklch(0 0 0 / 0.14)",
  };
}

/** Per user, so one person's choice is not imposed on the next. */
export function chartStyleKey(userId: number | string | null | undefined, chart: string): string {
  return `groomigo_chart_style_v1_${chart}_${userId ?? "anon"}`;
}

export function serialiseChartStyle(style: ChartStyle): string {
  return style;
}

/**
 * Read a stored choice back.
 *
 * Falls back to the chart's own default rather than to a fixed one: a
 * corrupt value must not turn every chart in the app into a line.
 */
export function parseChartStyle(
  raw: string | null | undefined,
  fallback: ChartStyle,
): ChartStyle {
  const text = String(raw ?? "").trim().toLowerCase();
  return (CHART_STYLES as readonly string[]).includes(text) ? (text as ChartStyle) : fallback;
}
