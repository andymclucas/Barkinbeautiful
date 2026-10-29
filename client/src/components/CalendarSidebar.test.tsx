import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarSidebar, type CapacityByDate } from "./CalendarSidebar";

/** Every numeric field, because the panel formats all of them. */
const summary = {
  totalAppointments: 0, totalPets: 0, earnedRevenue: 0, expectedRevenue: 0,
  takenRevenue: 0, outstandingRevenue: 0, membershipPetCount: 0, payingPetCount: 0,
  membershipVisitValue: 0, unlinkedMembershipPetCount: 0, cancelledCount: 0,
} as any;

const show = (capacityByDate?: CapacityByDate, selected = new Date(2027, 0, 6)) =>
  render(<CalendarSidebar
    selected={selected} onSelectDate={() => {}}
    summary={summary} summaryLabel="Wed, 6 Jan" capacityByDate={capacityByDate} />);

const JAN: CapacityByDate = {
  "2027-01-06": { state: "room", summary: "22 of 33 clips · 11 free" },
  "2027-01-08": { state: "over", summary: "22 of 33 clips · Brooklyn Cossey over by 1" },
  "2027-01-11": { state: "closed", summary: "Nobody rostered" },
};

describe("CalendarSidebar capacity", () => {
  it("spells out the selected day's load", () => {
    show(JAN);
    expect(screen.getByTestId("capacity-summary")).toHaveTextContent("22 of 33 clips · 11 free");
  });

  /** An overbooked groomer no longer colours the dot, so this is its only home. */
  it("names an overbooked groomer on the selected day", () => {
    show(JAN, new Date(2027, 0, 8));
    expect(screen.getByTestId("capacity-summary")).toHaveTextContent("Brooklyn Cossey over by 1");
  });

  it("says nobody is rostered rather than showing a day as full", () => {
    show(JAN, new Date(2027, 0, 11));
    expect(screen.getByTestId("capacity-summary")).toHaveTextContent("Nobody rostered");
  });

  it("shows a legend so the dots mean something", () => {
    show(JAN);
    const legend = screen.getByTestId("capacity-legend");
    for (const label of ["Room", "Nearly full", "Full", "Over"]) {
      expect(legend).toHaveTextContent(label);
    }
  });

  /** Before the data lands the rail must look exactly as it did. */
  it("draws no dots, legend or summary until capacity arrives", () => {
    show(undefined);
    expect(screen.queryByTestId("capacity-legend")).toBeNull();
    expect(screen.queryByTestId("capacity-summary")).toBeNull();
  });

  it("says nothing for a day the month data does not cover", () => {
    show(JAN, new Date(2027, 1, 14));
    expect(screen.queryByTestId("capacity-summary")).toBeNull();
  });
});
