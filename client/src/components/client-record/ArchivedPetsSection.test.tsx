import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArchivedPetsSection } from "./ArchivedPetsSection";

const pets = [
  { id: 124, name: "Lena", breed: "Maltese" },
  { id: 209, name: "Nova", breed: null },
];

describe("ArchivedPetsSection", () => {
  it("renders nothing when no dog is archived", () => {
    const { container } = render(<ArchivedPetsSection pets={[]} canRestore onRestore={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is folded away until opened, with the count on the toggle", () => {
    render(<ArchivedPetsSection pets={pets} canRestore onRestore={() => {}} />);
    const toggle = screen.getByRole("button", { name: /Archived dogs \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Lena")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Lena")).toBeInTheDocument();
    expect(screen.getByText("Nova")).toBeInTheDocument();
  });

  it("restores the dog that was pressed", () => {
    const onRestore = vi.fn();
    render(<ArchivedPetsSection pets={pets} canRestore onRestore={onRestore} />);
    fireEvent.click(screen.getByRole("button", { name: /Archived dogs/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Restore/ })[1]);
    expect(onRestore).toHaveBeenCalledWith(pets[1]);
  });

  it("offers no Restore to someone who cannot archive", () => {
    render(<ArchivedPetsSection pets={pets} canRestore={false} onRestore={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Archived dogs/ }));
    expect(screen.queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();
  });

  it("shows which one is restoring and stops a double press", () => {
    render(<ArchivedPetsSection pets={pets} canRestore restoringId={124} onRestore={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Archived dogs/ }));
    expect(screen.getByRole("button", { name: /Restoring/ })).toBeDisabled();
  });
});
