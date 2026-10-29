import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaffPerformanceCard, type StaffPerformanceCardData } from "./StaffPerformanceCard";

/**
 * The phone view of Staff Performance.
 *
 * It exists because the table had to scroll sideways inside its card at
 * 375px, putting Revenue off the edge. These pin that each figure is
 * actually present — a test that only checked the card rendered would
 * have passed on the old behaviour too.
 */

const staff = (over: Partial<StaffPerformanceCardData> = {}): StaffPerformanceCardData => ({
  name: "Charlotte Purcell", appointments: 1537, revenue: 219691.14, colour: "#6366f1", ...over,
});

const show = (data: StaffPerformanceCardData, total = 908845.55) =>
  render(<StaffPerformanceCard staff={data} totalRevenue={total} />);

describe("StaffPerformanceCard", () => {
  it("shows all five of the table's values", () => {
    show(staff());
    expect(screen.getByText("Charlotte Purcell")).toBeInTheDocument();
    expect(screen.getByText("$219,691.14")).toBeInTheDocument();      // Revenue
    expect(screen.getByText(/1537 appts/)).toBeInTheDocument();       // Appointments
    expect(screen.getByText(/\$143 avg/)).toBeInTheDocument();        // Avg per Appt
    expect(screen.getByText("24.2%")).toBeInTheDocument();            // Share
  });

  /** The table could only fit "Charlotte". A card has the room. */
  it("gives the full name, not just the first", () => {
    show(staff());
    expect(screen.getByText("Charlotte Purcell")).toBeInTheDocument();
    expect(screen.queryByText("Charlotte")).toBeNull();
  });

  it("says appt, not appts, for a single visit", () => {
    show(staff({ appointments: 1, revenue: 84 }));
    expect(screen.getByText(/^1 appt\b/)).toBeInTheDocument();
  });

  /**
   * Four of the thirteen groomers had no appointments at all on
   * 29/10/2026. 0/0 is NaN and would have rendered as "$NaN avg".
   */
  it("shows no average for a groomer who saw nobody", () => {
    show(staff({ name: "Bailey Clifford", appointments: 0, revenue: 0 }));
    expect(screen.getByText("0 appts")).toBeInTheDocument();
    expect(screen.queryByText(/avg/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("shows a dash rather than 0.0% when the period took nothing", () => {
    show(staff({ appointments: 0, revenue: 0 }), 0);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  /** The bar is the share drawn; it must not outrun its track. */
  it("draws the share as a bar that cannot exceed full width", () => {
    const { container } = show(staff({ revenue: 5000 }), 1000);
    const bar = container.querySelector<HTMLElement>(".h-full.rounded-full");
    expect(bar?.style.width).toBe("100%");
  });

  it("leaves the bar out entirely when there is no share to draw", () => {
    const { container } = show(staff({ revenue: 0 }), 0);
    expect(container.querySelector(".h-full.rounded-full")).toBeNull();
  });
});
