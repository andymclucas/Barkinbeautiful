import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PetWeightChart } from "./PetWeightChart";
import type { WeightEntry } from "@shared/petWeightHistory";

const e = (id: number, kg: number, iso: string): WeightEntry =>
  ({ id, weightKg: kg, recordedAt: new Date(`${iso}T00:00:00+10:00`) });

describe("PetWeightChart", () => {
  it("says so plainly when there is nothing recorded", () => {
    render(<PetWeightChart entries={[]} petName="Link" />);
    expect(screen.getByText(/No weighings recorded yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws a dot but no line for a single reading", () => {
    const { container } = render(<PetWeightChart entries={[e(1, 12, "2026-05-01")]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("svg text")!.textContent).toBe("12 kg");
  });

  it("labels only the newest reading on the chart, not every point", () => {
    // A number on every point turns a trend into a receipt. The older
    // readings are still available — as text, in the list underneath —
    // which is why this asserts on the SVG rather than the document.
    const { container } = render(
      <PetWeightChart entries={[e(1, 10, "2026-05-01"), e(2, 11, "2026-07-01"), e(3, 12, "2026-09-01")]} />,
    );
    const labels = [...container.querySelectorAll("svg text")].map((t) => t.textContent);
    expect(labels).toEqual(["12 kg"]);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it("lists every reading as text, newest first", () => {
    const { container } = render(
      <PetWeightChart entries={[e(1, 10, "2026-05-01"), e(2, 11, "2026-07-01")]} />,
    );
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("11 kg");
    expect(items[1]).toContain("10 kg");
  });

  it("does not divide by zero when the weight has not moved", () => {
    const { container } = render(
      <PetWeightChart entries={[e(1, 12, "2026-05-01"), e(2, 12, "2026-07-01")]} />,
    );
    const d = container.querySelector("path")!.getAttribute("d")!;
    expect(d).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText(/about the same as last time/)).toBeInTheDocument();
  });

  it("tells a screen reader what the picture says", () => {
    render(<PetWeightChart entries={[e(1, 10, "2026-05-01"), e(2, 12, "2026-08-01")]} petName="Link" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("Link's weight");
    expect(label).toContain("2 readings");
    expect(label).toMatch(/heavier/);
  });

  it("surfaces a notable change rather than burying it in the line", () => {
    render(<PetWeightChart entries={[e(1, 10, "2026-05-01"), e(2, 12, "2026-08-01")]} />);
    expect(screen.getByText(/worth mentioning to the owner/)).toBeInTheDocument();
  });
});
