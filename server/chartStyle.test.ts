import { describe, it, expect } from "vitest";
import {
  CHART_MARKS,
  CHART_STYLES,
  CHART_STYLE_LABELS,
  chartMeasureColours,
  chartSeriesColours,
  chartStyleKey,
  defaultChartStyle,
  parseChartStyle,
  serialiseChartStyle,
} from "@shared/chartStyle";

describe("chart style", () => {
  it("offers exactly the two forms", () => {
    expect(CHART_STYLES).toEqual(["line", "bar"]);
    for (const style of CHART_STYLES) expect(CHART_STYLE_LABELS[style]).toBeTruthy();
  });

  it("opens a trend on a line and a comparison on bars", () => {
    // A run of days is read as a shape; a set of amounts is read against
    // each other. Both are legible either way, which is why it is a
    // default rather than a rule.
    expect(defaultChartStyle("trend")).toBe("line");
    expect(defaultChartStyle("comparison")).toBe("bar");
  });

  it("survives a round trip", () => {
    for (const style of CHART_STYLES) {
      expect(parseChartStyle(serialiseChartStyle(style), "line")).toBe(style);
    }
  });

  it("falls back to the chart's OWN default, not a fixed one", () => {
    // A corrupt stored value must not quietly turn every chart in the app
    // into a line.
    expect(parseChartStyle("pie", "bar")).toBe("bar");
    expect(parseChartStyle(null, "bar")).toBe("bar");
    expect(parseChartStyle("", "line")).toBe("line");
  });

  it("is forgiving about case and padding", () => {
    expect(parseChartStyle(" BAR ", "line")).toBe("bar");
  });

  it("keeps one person's choice off the next person's screen", () => {
    // The salon shares machines.
    expect(chartStyleKey(7, "netSales")).not.toBe(chartStyleKey(9, "netSales"));
    expect(chartStyleKey(null, "netSales")).toContain("anon");
  });

  it("remembers each chart separately", () => {
    // Net sales as bars and the analytics trend as a line is a coherent
    // thing to want.
    expect(chartStyleKey(7, "netSales")).not.toBe(chartStyleKey(7, "analyticsTrend"));
  });
});

describe("period colours", () => {
  it("gives the prior period the same hue in both themes", () => {
    // Identity, not magnitude: amber means "what it is being measured
    // against" on every chart and in both themes, or the legend has to be
    // re-read on each tab.
    expect(chartSeriesColours("light").prior).toBe(chartSeriesColours("dark").prior);
  });

  it("steps the current period for the dark surface rather than reusing it", () => {
    // Dark mode is selected, not an automatic flip of the light palette.
    expect(chartSeriesColours("dark").current).not.toBe(chartSeriesColours("light").current);
  });

  it("never gives the two periods the same colour", () => {
    for (const theme of ["light", "dark", null, "system"]) {
      const { current, prior } = chartSeriesColours(theme);
      expect(current).not.toBe(prior);
    }
  });

  it("treats anything that is not dark as light", () => {
    expect(chartSeriesColours(null)).toEqual(chartSeriesColours("light"));
    expect(chartSeriesColours("system")).toEqual(chartSeriesColours("light"));
  });
});

describe("mark geometry", () => {
  it("rounds the data end and leaves the baseline square", () => {
    // A bar rounded at the bottom no longer starts at zero, so it misreads
    // the value it is drawing.
    const [tl, tr, br, bl] = CHART_MARKS.barRadius;
    expect([tl, tr]).toEqual([4, 4]);
    expect([br, bl]).toEqual([0, 0]);
  });

  it("leaves surface showing between adjacent bars", () => {
    // Without the gap the current and prior bars read as one block.
    expect(CHART_MARKS.barGap).toBeGreaterThan(0);
  });

  it("gives the hover target more room than the mark", () => {
    expect(CHART_MARKS.activeDotRadius).toBeGreaterThan(CHART_MARKS.dotRadius);
  });
});

describe("measure colours", () => {
  it("does not borrow the period hues", () => {
    // Amber means "the period being compared against" everywhere else.
    // Reusing it for membership revenue would leave the legend carrying
    // the whole meaning.
    const periods = chartSeriesColours("light");
    const measures = chartMeasureColours("light");
    expect(measures.primary).not.toBe(periods.prior);
    expect(measures.secondary).not.toBe(periods.prior);
  });

  it("is stepped for the dark surface rather than reused", () => {
    expect(chartMeasureColours("dark")).not.toEqual(chartMeasureColours("light"));
  });

  it("never gives two measures the same colour", () => {
    for (const theme of ["light", "dark", null]) {
      const { primary, secondary } = chartMeasureColours(theme);
      expect(primary).not.toBe(secondary);
    }
  });

  it("has dropped the pair that failed the checks", () => {
    // #f59e0b sat at lightness 0.769 against the dark band's 0.67 ceiling,
    // and 2.09:1 against the light surface, under the 3:1 floor.
    for (const theme of ["light", "dark"]) {
      const { primary, secondary } = chartMeasureColours(theme);
      expect([primary, secondary]).not.toContain("#f59e0b");
      expect([primary, secondary]).not.toContain("#3b82f6");
    }
  });
});
