import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  CHART_STYLES,
  CHART_STYLE_HINTS,
  CHART_STYLE_LABELS,
  type ChartIntent,
  type ChartStyle,
  chartStyleKey,
  defaultChartStyle,
  parseChartStyle,
  serialiseChartStyle,
} from "@shared/chartStyle";

/**
 * Remembering how somebody likes a particular chart drawn.
 *
 * Per user and per chart: the salon shares machines, and wanting net sales
 * as bars while the analytics trend stays a line is a coherent thing to
 * want. Storage failing is never allowed to stop a chart rendering —
 * private browsing and blocked site data both throw here.
 */
export function useChartStyle(chart: string, intent: ChartIntent) {
  const { user } = useAuth();
  const fallback = defaultChartStyle(intent);
  const [style, setStyle] = useState<ChartStyle>(fallback);

  const key = chartStyleKey(user?.id, chart);
  useEffect(() => {
    try {
      setStyle(parseChartStyle(window.localStorage.getItem(key), fallback));
    } catch {
      setStyle(fallback);
    }
  }, [key, fallback]);

  const choose = useCallback((next: ChartStyle) => {
    setStyle(next);
    try {
      window.localStorage.setItem(key, serialiseChartStyle(next));
    } catch {
      // A remembered preference is a convenience, not a requirement.
    }
  }, [key]);

  return { style, choose };
}

/**
 * The form picker, as a segmented control.
 *
 * Sits in the row of filters above the plot with the period and comparison
 * pickers, rather than floating beside the title: everything that changes
 * what the chart shows belongs in one place.
 *
 * Labelled buttons rather than icons. "Bar" and "Line" are two words and
 * a glyph of each is less legible than the word, particularly at the size
 * this sits at.
 */
export function ChartStyleToggle({
  style,
  onChange,
  label = "Chart style",
}: {
  style: ChartStyle;
  onChange: (style: ChartStyle) => void;
  label?: string;
}) {
  return (
    <div
      className="flex rounded-lg border border-border bg-muted/40 p-0.5"
      role="group"
      aria-label={label}
    >
      {CHART_STYLES.map((option) => {
        const selected = option === style;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={selected}
            title={CHART_STYLE_HINTS[option]}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {CHART_STYLE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
