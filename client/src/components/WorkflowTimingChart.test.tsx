import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cloneElement } from "react";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    // ResponsiveContainer measures through ResizeObserver, which jsdom does
    // not implement — it never settles on a size and nothing inside draws.
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 700, height: 220 } as Partial<unknown> & { width: number; height: number }),
  };
});
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

import { WorkflowTimingChart } from "./WorkflowTimingChart";

const STAGES = [
  { key: "waiting_for_bath", label: "Waiting for bath", avgMinutes: 22, sampleSize: 140 },
  { key: "bathing", label: "Bathing", avgMinutes: 35, sampleSize: 138 },
  { key: "drying", label: "Drying", avgMinutes: 48, sampleSize: 131 },
  { key: "grooming", label: "Grooming", avgMinutes: 61, sampleSize: 129 },
  { key: "total", label: "Total", avgMinutes: 186, sampleSize: 125 },
];

describe("WorkflowTimingChart", () => {
  it("draws one bar per stage", () => {
    const { container } = render(<WorkflowTimingChart stages={STAGES} sampleSize={125} />);
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(4);
  });

  it("keeps the total out of the bars and puts it above as a number", () => {
    // It is the sum of the others, so as a bar it is always longest and
    // every stage is squashed against it.
    const { container } = render(<WorkflowTimingChart stages={STAGES} sampleSize={125} />);
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(4);
    expect(screen.getByText("3h 6m")).toBeInTheDocument();
    expect(screen.getByText(/average check-in to complete/)).toBeInTheDocument();
  });

  it("names the longest stage rather than leaving it to be spotted", () => {
    render(<WorkflowTimingChart stages={STAGES} sampleSize={125} />);
    expect(screen.getByText(/Longest stage/)).toBeInTheDocument();
    // Twice over: once as the axis label, once named in the sentence.
    expect(screen.getAllByText("Grooming").length).toBeGreaterThanOrEqual(2);
  });

  it("uses one hue and separates by opacity, not a second colour", () => {
    // Magnitude across stages is one measure. Eight hues would say the
    // stages are identities to tell apart when the question is which is
    // longest.
    const { container } = render(<WorkflowTimingChart stages={STAGES} sampleSize={125} />);
    const fills = Array.from(container.querySelectorAll(".recharts-bar-rectangle path"))
      .map((el) => el.getAttribute("fill"));
    expect(new Set(fills).size).toBe(1);
    const opacities = Array.from(container.querySelectorAll(".recharts-bar-rectangle path"))
      .map((el) => el.getAttribute("fill-opacity"));
    expect(new Set(opacities).size).toBe(2);
  });

  it("labels every bar, so the figures survive a screenshot", () => {
    render(<WorkflowTimingChart stages={STAGES} sampleSize={125} />);
    for (const text of ["22m", "35m", "48m"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });

  it("says so plainly when there is nothing measured", () => {
    render(<WorkflowTimingChart stages={[]} sampleSize={0} />);
    expect(screen.getByText(/No workflow timing data/)).toBeInTheDocument();
  });

  it("drops a stage with no samples rather than drawing an empty bar", () => {
    // A zero bar with nothing behind it reads as "instant", not "not measured".
    const { container } = render(
      <WorkflowTimingChart
        stages={[...STAGES, { key: "nails", label: "Nails", avgMinutes: 0, sampleSize: 0 }]}
        sampleSize={125}
      />,
    );
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(4);
    expect(screen.queryByText("Nails")).not.toBeInTheDocument();
  });
});
