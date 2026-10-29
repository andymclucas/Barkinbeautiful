import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionDogCounts } from "./SessionDogCounts";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 30, h - 10, m)).toISOString();
};
const row = (id: number, time: string, family?: number) =>
  ({ id, scheduledStart: at(time), petFamilyGroupId: family ?? null });

const value = (tone: string) =>
  screen.getByTestId(`session-count-${tone}`).querySelector("span")?.textContent;

describe("SessionDogCounts", () => {
  it("shows a number for each half of the day", () => {
    render(<SessionDogCounts rows={[row(1, "09:00"), row(2, "09:30"), row(3, "11:30")]} />);
    expect(value("morning")).toBe("2");
    expect(value("afternoon")).toBe("1");
    expect(screen.getByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("Afternoon")).toBeInTheDocument();
  });

  /** The point is that it is hard to miss. */
  it("draws the figures large rather than as body text", () => {
    render(<SessionDogCounts rows={[row(1, "09:00"), row(2, "11:30")]} />);
    const figure = screen.getByTestId("session-count-morning").querySelector("span");
    expect(figure?.className).toContain("text-2xl");
    expect(figure?.className).toContain("font-bold");
  });

  it("says which side of 11:30 each half is", () => {
    render(<SessionDogCounts rows={[row(1, "09:00"), row(2, "11:30")]} />);
    expect(screen.getByText("before 11:30")).toBeInTheDocument();
    expect(screen.getByText("11:30 on")).toBeInTheDocument();
  });

  it("shows a real zero rather than hiding an empty session", () => {
    render(<SessionDogCounts rows={[row(1, "09:00"), row(2, "10:00")]} />);
    expect(value("morning")).toBe("2");
    expect(value("afternoon")).toBe("0");
  });

  it("renders nothing at all for a day with no dogs", () => {
    const { container } = render(<SessionDogCounts rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** A family counts where its cohort sits, so the figure matches the line. */
  it("counts a straddling family in the morning, like the divider does", () => {
    render(<SessionDogCounts rows={[
      row(1, "09:00"), row(2, "11:00", 42), row(3, "11:45", 42), row(4, "12:00"),
    ]} />);
    expect(value("morning")).toBe("3");
    expect(value("afternoon")).toBe("1");
  });

  it("keeps an unreadable time visible without adding it to either session", () => {
    render(<SessionDogCounts rows={[
      row(1, "09:00"), { id: 2, scheduledStart: "rubbish", petFamilyGroupId: null },
    ]} />);
    expect(value("morning")).toBe("1");
    expect(value("afternoon")).toBe("0");
    expect(value("unknown")).toBe("1");
  });

  it("leaves the no-time box out when every dog has a time", () => {
    render(<SessionDogCounts rows={[row(1, "09:00"), row(2, "11:30")]} />);
    expect(screen.queryByTestId("session-count-unknown")).toBeNull();
  });
});
