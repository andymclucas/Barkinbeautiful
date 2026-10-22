import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresenceIndicator } from "./PresenceIndicator";

const v = (userId: number, name: string, initials: string) => ({ userId, name, initials });

describe("PresenceIndicator", () => {
  it("renders nothing when nobody else is there", () => {
    // Otherwise the dialog carries an empty strip around all day.
    render(<PresenceIndicator viewers={[]} />);
    expect(screen.queryByTestId("presence")).not.toBeInTheDocument();
  });

  it("names one person and shows their initials", () => {
    render(<PresenceIndicator viewers={[v(1, "Lauren Romari", "LR")]} />);
    expect(screen.getByTestId("presence").textContent).toContain("Lauren Romari also has this open");
    expect(screen.getByText("LR")).toBeInTheDocument();
  });

  it("shows at most four faces and counts the rest", () => {
    const many = [
      v(1, "Ashleigh", "A"), v(2, "Brooklyn", "B"), v(3, "Charlotte", "C"),
      v(4, "Megs", "M"), v(5, "Zakaria", "Z"), v(6, "Sabina", "S"),
    ];
    render(<PresenceIndicator viewers={many} />);
    expect(screen.getAllByTestId("presence-avatar")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("says 'has this open', never 'is editing'", () => {
    // The system knows the dialog is on their screen and nothing more.
    render(<PresenceIndicator viewers={[v(1, "Lauren", "L")]} />);
    expect(screen.getByTestId("presence").textContent).not.toMatch(/editing|locked|in use/i);
  });

  it("announces itself politely rather than grabbing focus", () => {
    // Somebody is mid-sentence in a notes box when this appears.
    render(<PresenceIndicator viewers={[v(1, "Lauren", "L")]} />);
    const el = screen.getByTestId("presence");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("is amber, not red — nothing is wrong", () => {
    // A red banner trains everyone to dismiss it, including the one time
    // it mattered.
    const { container } = render(<PresenceIndicator viewers={[v(1, "Lauren", "L")]} />);
    const cls = container.querySelector("[data-testid='presence']")?.className ?? "";
    expect(cls).toContain("amber");
    expect(cls).not.toMatch(/\bbg-red|\bborder-red/);
  });

  it("puts the full name on hover, since initials are ambiguous", () => {
    render(<PresenceIndicator viewers={[v(1, "Megs Graham", "MG")]} />);
    expect(screen.getByTestId("presence-avatar").getAttribute("title")).toBe("Megs Graham");
  });
});
