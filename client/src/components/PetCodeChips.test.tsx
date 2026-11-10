import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PetCodeChips } from "./PetCodeChips";
import { PetCodeWarningBox } from "./PetCodeWarningBox";
import { BookingWarnings } from "./BookingWarnings";

/**
 * Andy, 10/11/2026: "All warnings must be noticeable on the appt and the
 * workflow in bright red badges", and "added in the bright red warning
 * box". These three are the pieces every one of those surfaces is built
 * from, so they are tested against one catalogue.
 */
const catalogue = [
  { code: "SENSITIVE", description: "SENSITIVE", colourHex: "#22c55e", isWarning: true },
  { code: "PITA", description: "Difficult to groom", colourHex: null, isWarning: true },
  { code: "✂5f", description: "5F blade", colourHex: "#3b82f6", isWarning: false },
];
let data: typeof catalogue | undefined = catalogue;

vi.mock("@/lib/trpc", () => ({
  trpc: { petCodes: { list: { useQuery: () => ({ data }) } } },
}));

describe("PetCodeChips", () => {
  it("draws a warning as a red badge, ahead of the ordinary codes", () => {
    data = catalogue;
    render(<PetCodeChips codes="✂5f, SENSITIVE" />);
    const warning = screen.getByTestId("pet-code-chip-warning");
    expect(warning).toHaveTextContent("SENSITIVE");
    expect(warning.className).toContain("bg-red-600");
    // Red always: the green the catalogue gave SENSITIVE must not win.
    expect(warning.getAttribute("style") ?? "").not.toContain("background");
    const ordinary = screen.getByTestId("pet-code-chip");
    expect(ordinary).toHaveTextContent("✂5f");
    expect(warning.compareDocumentPosition(ordinary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /** A card too small for its codes still shows its warnings. */
  it("keeps only the warnings when asked to", () => {
    data = catalogue;
    render(<PetCodeChips codes="✂5f, SENSITIVE, PITA" warningsOnly />);
    expect(screen.getAllByTestId("pet-code-chip-warning")).toHaveLength(2);
    expect(screen.queryByTestId("pet-code-chip")).toBeNull();
  });

  it("renders nothing for a small card whose dog has no warnings", () => {
    data = catalogue;
    const { container } = render(<PetCodeChips codes="✂5f" warningsOnly />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows aggression red before the catalogue has answered", () => {
    data = undefined;
    render(<PetCodeChips codes="DOG AGGRESSIVE, SENSITIVE" />);
    expect(screen.getByTestId("pet-code-chip-warning")).toHaveTextContent("DOG AGGRESSIVE");
  });
});

describe("PetCodeWarningBox", () => {
  it("lists the dog's warnings, spelled out, and leaves ordinary codes out", () => {
    data = catalogue;
    render(<PetCodeWarningBox codes="✂5f, SENSITIVE, PITA" />);
    const box = screen.getByTestId("pet-code-warning-box");
    expect(box).toHaveAttribute("role", "alert");
    expect(box).toHaveTextContent("Warnings");
    expect(box).toHaveTextContent("SENSITIVE");
    expect(box).toHaveTextContent("PITA — Difficult to groom");
    expect(box).not.toHaveTextContent("✂5f");
  });

  it("is absent for a dog with no warnings, and for a dog with no codes", () => {
    data = catalogue;
    const { container, rerender } = render(<PetCodeWarningBox codes="✂5f" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PetCodeWarningBox codes={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("BookingWarnings", () => {
  it("puts a dog's warning codes in the red panel though its alert level is ok", () => {
    data = catalogue;
    render(
      <BookingWarnings
        pets={[{ name: "Bella", alertLevel: "ok", warnings: null, moegoCodeLabels: "✂5f, SENSITIVE" }]}
      />,
    );
    const panel = screen.getByRole("alert");
    expect(panel.className).toContain("border-red-300");
    expect(panel).toHaveTextContent("Warning");
    expect(panel).toHaveTextContent("Bella");
    expect(panel).toHaveTextContent("SENSITIVE");
    expect(panel).not.toHaveTextContent("✂5f");
  });

  it("shows no panel for a dog with ordinary codes and no alert", () => {
    data = catalogue;
    const { container } = render(
      <BookingWarnings pets={[{ name: "Bella", alertLevel: "ok", warnings: null, moegoCodeLabels: "✂5f" }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
