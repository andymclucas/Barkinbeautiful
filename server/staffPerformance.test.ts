import { describe, it, expect } from "vitest";
import { averagePerAppointment, revenueShare } from "../shared/staffPerformance";

describe("averagePerAppointment", () => {
  it("divides the takings by the visits", () => {
    expect(averagePerAppointment({ appointments: 45, revenue: 3783 })).toBeCloseTo(84.07, 2);
  });

  /**
   * Bailey Clifford, Nathan Romari, Andy McLucas and Christie McLucas all
   * sat at 0 appointments and $0 on 29/10/2026. 0/0 is NaN, and the page
   * printed whatever it was handed.
   */
  it("has no average for a groomer who saw nobody", () => {
    expect(averagePerAppointment({ appointments: 0, revenue: 0 })).toBeNull();
    expect(averagePerAppointment({ appointments: 0, revenue: 500 })).toBeNull();
  });

  it("refuses a negative or unreadable count rather than inventing a figure", () => {
    expect(averagePerAppointment({ appointments: -3, revenue: 100 })).toBeNull();
    expect(averagePerAppointment({ appointments: NaN, revenue: 100 })).toBeNull();
    expect(averagePerAppointment({ appointments: 10, revenue: NaN })).toBeNull();
    expect(averagePerAppointment({ appointments: Infinity, revenue: 100 })).toBeNull();
  });

  it("keeps full precision so each caller can round as it likes", () => {
    // The CSV wants 2dp, the table 0dp. Rounding here would cost one of them.
    expect(averagePerAppointment({ appointments: 3, revenue: 100 })).toBeCloseTo(33.3333, 4);
  });
});

describe("revenueShare", () => {
  it("is the percentage of the period's takings", () => {
    expect(revenueShare({ appointments: 1537, revenue: 219691.14 }, 908845.55)).toBeCloseTo(24.17, 2);
  });

  it("gives the whole hundred to a sole earner", () => {
    expect(revenueShare({ appointments: 5, revenue: 400 }, 400)).toBe(100);
  });

  /** An empty period is not "everyone contributed 0.0%". */
  it("has no share when the period took nothing", () => {
    expect(revenueShare({ appointments: 0, revenue: 0 }, 0)).toBeNull();
    expect(revenueShare({ appointments: 2, revenue: 50 }, -10)).toBeNull();
    expect(revenueShare({ appointments: 2, revenue: 50 }, NaN)).toBeNull();
  });

  it("reports a zero earner inside a paying period as a real 0%", () => {
    // Distinct from the case above: there IS data, this groomer earned none.
    expect(revenueShare({ appointments: 4, revenue: 0 }, 1000)).toBe(0);
  });
});
