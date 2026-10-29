import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayTimingReport } from "./DayTimingReport";
import { dogDayTiming, type DayTimingInput } from "@shared/dayTimingReport";

/** Brisbane wall-clock on 29/10/2026. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.UTC(2026, 9, 29, h - 10, m);
};

const dog = (over: Partial<DayTimingInput> = {}) => dogDayTiming({
  appointmentId: 1, petName: "Frankie", clientName: "A Client",
  groomerName: "Megs Graham", serviceType: "classic_groom", workflowState: "complete",
  checkedInAt: at("07:28"), bathingStartedAt: at("07:43"), bathingCompletedAt: at("08:14"),
  dryingStartedAt: at("08:14"), dryingCompletedAt: at("08:30"),
  groomingStartedAt: at("08:30"), groomingCompletedAt: at("09:28"),
  readyAt: at("10:29"), completedAt: at("10:45"),
  ...over,
});

/** The real 29/10/2026 shape: a calm start, then the pile-up. */
const radley = dog({
  appointmentId: 2, petName: "Radley", groomerName: "Charlotte Purcell",
  checkedInAt: at("09:23"), bathingStartedAt: at("11:53"), bathingCompletedAt: at("12:05"),
  dryingStartedAt: at("12:05"), dryingCompletedAt: at("12:17"),
  groomingStartedAt: at("12:17"), groomingCompletedAt: at("13:01"),
  readyAt: at("14:32"), completedAt: at("14:50"),
});

describe("DayTimingReport", () => {
  it("leads with the day's median and worst wait", () => {
    const { container } = render(<DayTimingReport dogs={[dog(), radley]} />);
    const head = container.firstElementChild!.firstElementChild!;
    expect(within(head as HTMLElement).getByText("2 dogs")).toBeInTheDocument();
    expect((head as HTMLElement).textContent).toContain("Median wait for a bath");
    expect((head as HTMLElement).textContent).toContain("2h 30m");   // Radley's wait
    expect((head as HTMLElement).textContent).toContain("(Radley)");
  });

  it("names every dog, its groomer and when it arrived", () => {
    render(<DayTimingReport dogs={[dog()]} />);
    const row = screen.getByTestId("dog-row");
    expect(within(row).getByText(/Frankie/)).toBeInTheDocument();
    expect(within(row).getByText(/Megs Graham/)).toBeInTheDocument();
    expect(within(row).getByText("in 7:28 am")).toBeInTheDocument();
  });

  it("spells out each dog's wait rather than leaving it to the bar", () => {
    render(<DayTimingReport dogs={[radley]} />);
    const row = screen.getByTestId("dog-row");
    expect(row.textContent).toContain("Waited");
    expect(row.textContent).toContain("2h 30m");
    expect(row.textContent).toContain("for a bath");
  });

  /** Arrival order is the default: it is how the morning actually ran. */
  it("starts in arrival order and can be flipped to the worst waits", async () => {
    render(<DayTimingReport dogs={[radley, dog()]} />);
    const names = () => screen.getAllByTestId("dog-row").map(e => e.getAttribute("data-dog"));
    expect(names()).toEqual(["Frankie", "Radley"]);   // arrived 07:28, 09:23
    await userEvent.click(screen.getByRole("button", { name: "Longest wait" }));
    expect(names()).toEqual(["Radley", "Frankie"]);   // waited 150 min, 15 min
  });

  /**
   * Lola was still checked_in at 12:16 with nothing after it. A dog on
   * the floor is exactly who Lauren wants to see, so it must not be
   * dropped or shown as a finished 0-minute visit.
   */
  it("keeps a dog still on the floor, and says so", () => {
    render(<DayTimingReport dogs={[dog({
      appointmentId: 3, petName: "Lola", workflowState: "checked_in",
      checkedInAt: at("12:16"), bathingStartedAt: null, bathingCompletedAt: null,
      dryingStartedAt: null, dryingCompletedAt: null, groomingStartedAt: null,
      groomingCompletedAt: null, readyAt: null, completedAt: null,
    })]} />);
    const row = screen.getByTestId("dog-row");
    expect(row.getAttribute("data-dog")).toBe("Lola");
    expect(row.textContent).toContain("Still here");
    expect(row.textContent).toContain("checked in");
    expect(row.textContent).not.toContain("in the salon");
  });

  it("names every colour in a legend so the bar is never read by hue alone", () => {
    render(<DayTimingReport dogs={[dog()]} />);
    for (const label of ["Waiting for bath", "Bathing", "Drying", "Grooming"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  /** Every bar on one scale, or the longest day looks like the shortest. */
  it("draws a slower dog's bar wider than a faster one's", () => {
    render(<DayTimingReport dogs={[dog(), radley]} />);
    const bars = screen.getAllByTestId("dog-bar");
    const width = (bar: HTMLElement) => Array.from(bar.children)
      .reduce((sum, c) => sum + parseFloat((c as HTMLElement).style.width || "0"), 0);
    expect(width(bars[1])).toBeGreaterThan(width(bars[0]));   // Radley vs Frankie
    expect(width(bars[1])).toBeCloseTo(100, 0);               // the longest sets the scale
  });

  it("says so plainly when the day is empty", () => {
    render(<DayTimingReport dogs={[]} />);
    expect(screen.getByText("No dogs on this day.")).toBeInTheDocument();
  });
});
