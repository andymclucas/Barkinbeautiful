import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DogBoardHoverCard } from "./DogBoardHoverCard";

const BASE = { petName: "Rosie", workflowState: "bathing" as const };

describe("DogBoardHoverCard", () => {
  it("says plainly when there is nothing recorded", () => {
    render(<DogBoardHoverCard row={BASE} />);
    expect(screen.getByTestId("dog-hover").textContent).toContain("Nothing recorded for Rosie");
  });

  it("shows everything Andy asked for in one card", () => {
    // "ensure all details including grooming notes, add-ons, time out etc
    // are shown" — 22/10/2026.
    render(<DogBoardHoverCard row={{
      ...BASE,
      petAlertLevel: "danger",
      petWarnings: "Bites when brushed",
      collectBy: new Date(Date.now() + 90 * 60_000),
      petSizeBand: "small",
      addOns: [{ name: "Teeth Ultra Clean" }],
      groomStyleNote: "Teddy bear face, #4 body",
      notes: "Owner running late",
    }} />);
    expect(screen.getByTestId("hover-alert")).toBeInTheDocument();
    expect(screen.getByTestId("hover-collect")).toBeInTheDocument();
    expect(screen.getByTestId("hover-addons")).toBeInTheDocument();
    expect(screen.getByTestId("hover-style")).toBeInTheDocument();
    expect(screen.getByTestId("hover-notes")).toBeInTheDocument();
  });

  it("puts the alert above everything else", () => {
    // A bite risk found below a note about nail polish is found too late.
    const { container } = render(<DogBoardHoverCard row={{
      ...BASE,
      petAlertLevel: "danger",
      petWarnings: "Bites",
      addOns: [{ name: "Nail Painting" }],
      groomStyleNote: "short all over",
    }} />);
    const order = Array.from(container.querySelectorAll("[data-testid^='hover-']"))
      .map((el) => el.getAttribute("data-testid"));
    expect(order[0]).toBe("hover-alert");
  });

  it("writes the add-ons out in full, not as board shorthand", () => {
    // The badge on the row says "Teeth ultra"; there is room here for the
    // real name, and a groomer about to do it should see the real name.
    render(<DogBoardHoverCard row={{ ...BASE, addOns: [{ name: "Teeth Ultra Clean", quantity: 2 }] }} />);
    expect(screen.getByTestId("hover-addons").textContent).toContain("Teeth Ultra Clean ×2");
  });

  it("shows the out-time and how long is left when it is tight", () => {
    render(<DogBoardHoverCard row={{
      ...BASE,
      collectBy: new Date(Date.now() + 20 * 60_000),
      petSizeBand: "large",
      workflowState: "checked_in",
    }} />);
    const text = screen.getByTestId("hover-collect").textContent ?? "";
    expect(text).toMatch(/BY \d{2}:\d{2}/);
    expect(text).toMatch(/min left|min past/);
  });

  it("does not clutter a comfortable out-time with arithmetic", () => {
    render(<DogBoardHoverCard row={{
      ...BASE,
      collectBy: new Date(Date.now() + 8 * 60 * 60_000),
      petSizeBand: "small",
      workflowState: "ready",
    }} />);
    const text = screen.getByTestId("hover-collect").textContent ?? "";
    expect(text).toMatch(/BY \d{2}:\d{2}/);
    expect(text).not.toMatch(/min left/);
  });

  it("keeps the standing style note apart from today's notes", () => {
    render(<DogBoardHoverCard row={{
      ...BASE,
      groomStyleNote: "Teddy bear face",
      notes: "Owner running late",
    }} />);
    expect(screen.getByTestId("hover-style").textContent).toContain("Teddy bear face");
    expect(screen.getByTestId("hover-style").textContent).not.toContain("running late");
    expect(screen.getByTestId("hover-notes").textContent).toContain("Owner running late");
  });

  it("shows the MoeGo tags", () => {
    render(<DogBoardHoverCard row={{ ...BASE, petMoegoCodeLabels: "#7f, SENSITIVE" }} />);
    expect(screen.getByTestId("hover-codes").textContent).toContain("SENSITIVE");
  });

  it("points at the dialog for the rest", () => {
    render(<DogBoardHoverCard row={{ ...BASE, notes: "something" }} />);
    expect(screen.getByTestId("dog-hover").textContent).toContain("Click the name for the full record");
  });

  it("shows a danger flag even with no text behind it", () => {
    render(<DogBoardHoverCard row={{ ...BASE, petAlertLevel: "danger" }} />);
    expect(screen.getByTestId("hover-alert").textContent?.toLowerCase()).toContain("danger");
  });
});
