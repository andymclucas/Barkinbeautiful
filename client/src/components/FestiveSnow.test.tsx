import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FestiveSnow } from "./FestiveSnow";

const overlay = () => screen.getByTestId("festive-snow");
const flakes = () => Array.from(overlay().querySelectorAll(".festive-snowflake")) as HTMLElement[];

describe("FestiveSnow", () => {
  it("falls as many flakes as it says it will", () => {
    render(<FestiveSnow count={12} />);
    expect(flakes()).toHaveLength(12);
  });

  it("cannot be clicked through to, or clicked on", () => {
    // It covers the whole screen including the New Appointment button. A
    // flake eating a click would be the worst possible trade for a bit of
    // decoration.
    render(<FestiveSnow count={3} />);
    expect(overlay().className).toContain("pointer-events-none");
  });

  it("is fixed and clipped, so it adds no scroll", () => {
    // The flakes travel to 110vh. Without overflow-hidden on a fixed
    // overlay that would lengthen the page by a tenth of a screen.
    const cls = overlay.bind(null);
    render(<FestiveSnow count={3} />);
    expect(cls().className).toContain("fixed");
    expect(cls().className).toContain("overflow-hidden");
  });

  it("is hidden from screen readers, being decoration", () => {
    render(<FestiveSnow count={3} />);
    expect(overlay().getAttribute("aria-hidden")).toBe("true");
  });

  it("gives every flake its own speed, so it reads as depth", () => {
    render(<FestiveSnow count={30} />);
    const durations = new Set(flakes().map((f) => f.style.animationDuration));
    expect(durations.size).toBeGreaterThan(5);
  });

  it("staggers the starts, so it is already snowing rather than dropping a rank", () => {
    render(<FestiveSnow count={30} />);
    const delays = new Set(flakes().map((f) => f.style.animationDelay));
    expect(delays.size).toBeGreaterThan(5);
  });

  it("spreads them across the width", () => {
    render(<FestiveSnow count={30} />);
    const lefts = flakes().map((f) => parseFloat(f.style.left));
    expect(Math.min(...lefts)).toBeLessThan(35);
    expect(Math.max(...lefts)).toBeGreaterThan(65);
  });

  it("drifts sideways in both directions, so it is snow and not rain", () => {
    render(<FestiveSnow count={40} />);
    const drifts = flakes().map((f) => parseFloat(f.style.getPropertyValue("--drift")));
    expect(drifts.some((d) => d < 0)).toBe(true);
    expect(drifts.some((d) => d > 0)).toBe(true);
  });

  it("keeps every flake small", () => {
    // Large white circles over a working board stop being weather and
    // start being an obstruction.
    render(<FestiveSnow count={40} />);
    for (const f of flakes()) {
      const size = parseFloat(f.style.width);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(12);
    }
  });

  it("keeps every flake translucent", () => {
    render(<FestiveSnow count={40} />);
    for (const f of flakes()) {
      const opacity = parseFloat(f.style.opacity);
      expect(opacity).toBeGreaterThan(0.2);
      expect(opacity).toBeLessThan(0.85);
    }
  });
});
