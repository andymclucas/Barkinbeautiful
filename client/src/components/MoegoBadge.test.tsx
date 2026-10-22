import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoegoBadge } from "./MoegoBadge";

describe("MoegoBadge", () => {
  it("marks an imported booking", () => {
    render(<MoegoBadge moegoAppointmentId="131493891" />);
    expect(screen.getByTestId("moego-badge").textContent).toContain("MoeGo");
  });

  it("renders nothing for a booking made in Groomigo", () => {
    // Most rows will eventually be these; an empty badge slot on every
    // one of them is clutter.
    for (const none of [null, undefined, "", "   "]) {
      const { unmount } = render(<MoegoBadge moegoAppointmentId={none} />);
      expect(screen.queryByTestId("moego-badge"), String(none)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("explains on hover why the price is left alone", () => {
    // The badge's whole job is to make "this price does not match the
    // catalogue" readable as normal rather than as a defect.
    render(<MoegoBadge moegoAppointmentId="131493891" />);
    const title = screen.getByTestId("moego-badge").getAttribute("title") ?? "";
    expect(title).toContain("131493891");
    expect(title).toMatch(/left as it was|original MoeGo figure/);
    expect(title).toContain("Pricing & Services");
  });

  it("is slate, not a warning colour", () => {
    // Nothing is wrong with an imported booking.
    const { container } = render(<MoegoBadge moegoAppointmentId="1" />);
    const cls = container.querySelector("[data-testid='moego-badge']")?.className ?? "";
    expect(cls).toContain("slate");
    expect(cls).not.toMatch(/red|amber|yellow/);
  });
});
