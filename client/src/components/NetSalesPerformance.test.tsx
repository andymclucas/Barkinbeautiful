import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { cloneElement } from "react";

/**
 * Renders the chart in both forms.
 *
 * The dataviz procedure's last step is "render it and look at it" — the
 * palette validator checks colour, not geometry, and nothing else in this
 * repo would notice if the bar form simply failed to draw.
 *
 * ResponsiveContainer is stubbed with a fixed box: it measures its parent,
 * and in jsdom every element is 0x0, so recharts renders nothing at all
 * inside it and every assertion below would pass vacuously.
 */
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    // ResponsiveContainer measures its parent through ResizeObserver, which
    // jsdom does not implement — it never settles on a size, so the test
    // hangs and nothing inside it ever draws. Sizing the chart directly
    // skips the measuring entirely.
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 800, height: 260 } as Partial<unknown> & { width: number; height: number }),
  };
});

const POINTS = [
  { date: "2026-10-01", net: 420, priorNet: 380, priorDate: "2026-09-01" },
  { date: "2026-10-02", net: 610, priorNet: 540, priorDate: "2026-09-02" },
  { date: "2026-10-03", net: 300, priorNet: null, priorDate: null },
];

let queryResult: Record<string, unknown> = {};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    analyticsExt: { netSalesPerformance: { useQuery: () => queryResult } },
  },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

import { NetSalesPerformance } from "./NetSalesPerformance";

const range = { dateFrom: new Date("2026-10-01"), dateTo: new Date("2026-10-03") };

describe("NetSalesPerformance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    queryResult = {
      data: {
        points: POINTS,
        currentTotal: 1330,
        previousTotal: 920,
        percentChange: 44.57,
        currentRange: { from: "2026-10-01", to: "2026-10-03" },
        priorRange: { from: "2026-09-01", to: "2026-09-03" },
      },
      isLoading: false,
      isError: false,
    };
  });

  it("draws the line form by default", () => {
    // A run of days is a trend, and the chart's question is the shape of
    // the period.
    const { container } = render(<NetSalesPerformance {...range} />);
    expect(container.querySelectorAll(".recharts-line").length).toBe(2);
    expect(container.querySelectorAll(".recharts-bar").length).toBe(0);
  });

  it("draws the bar form when bar is chosen", () => {
    window.localStorage.setItem("groomigo_chart_style_v1_netSales_1", "bar");
    const { container } = render(<NetSalesPerformance {...range} />);
    expect(container.querySelectorAll(".recharts-bar").length).toBe(2);
    expect(container.querySelectorAll(".recharts-line").length).toBe(0);
  });

  it("offers both forms as a labelled control", () => {
    render(<NetSalesPerformance {...range} />);
    expect(screen.getByRole("group", { name: "Net sales chart style" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Line" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bar" })).toBeInTheDocument();
  });

  it("keeps the two periods on different colours in both forms", () => {
    // Identity, not magnitude. If these ever matched, the legend would be
    // the only thing telling the periods apart.
    const { container: line } = render(<NetSalesPerformance {...range} />);
    const lineStrokes = Array.from(line.querySelectorAll(".recharts-line-curve"))
      .map((el) => el.getAttribute("stroke"));
    expect(new Set(lineStrokes).size).toBe(2);

    window.localStorage.setItem("groomigo_chart_style_v1_netSales_1", "bar");
    const { container: bar } = render(<NetSalesPerformance {...range} />);
    const barFills = Array.from(bar.querySelectorAll(".recharts-bar-rectangle path"))
      .map((el) => el.getAttribute("fill"));
    expect(new Set(barFills).size).toBe(2);
  });

  it("still says a failed load is not an empty month", () => {
    // The bug this chart shipped with for months. Switching forms must not
    // have cost the distinction.
    queryResult = { data: undefined, isLoading: false, isError: true };
    render(<NetSalesPerformance {...range} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/not an empty month/i);
  });

  it("names both series in the legend whichever form is on screen", () => {
    window.localStorage.setItem("groomigo_chart_style_v1_netSales_1", "bar");
    render(<NetSalesPerformance {...range} />);
    expect(screen.getByText("This period")).toBeInTheDocument();
  });
});
