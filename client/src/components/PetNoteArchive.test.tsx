import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PetNoteArchive } from "./PetNoteArchive";

const APPTS = [
  { id: 1, petId: 10, scheduledStart: "2026-08-01T00:00:00Z", notes: "First groom, nervous", staffName: "Megs Graham" },
  { id: 2, petId: 10, scheduledStart: "2026-10-22T00:00:00Z", notes: "very matted in ears, had to demat", staffName: "Brooklyn Cossey" },
  { id: 3, petId: 10, scheduledStart: "2026-09-01T00:00:00Z", notes: "Shaved belly shorter", staffName: "Megs Graham" },
];

describe("PetNoteArchive", () => {
  it("says so plainly when there is nothing yet", () => {
    render(<PetNoteArchive appointments={[]} petId={10} petName="Waffle" />);
    expect(screen.getByTestId("note-archive-empty").textContent).toContain("No groomer notes on Waffle yet");
  });

  it("shows the most recent note in full", () => {
    // The last note is what matters with a dog on the table.
    render(<PetNoteArchive appointments={APPTS} petId={10} petName="Waffle" />);
    expect(screen.getByText("very matted in ears, had to demat")).toBeInTheDocument();
    expect(screen.getAllByTestId("note-archive-entry")).toHaveLength(1);
  });

  it("folds the older ones away behind a count", () => {
    render(<PetNoteArchive appointments={APPTS} petId={10} petName="Waffle" />);
    expect(screen.getByTestId("note-archive-more").textContent).toContain("Show 2 earlier notes");
    expect(screen.queryByText("First groom, nervous")).not.toBeInTheDocument();
  });

  it("opens the whole history on click, newest first", async () => {
    const user = userEvent.setup();
    render(<PetNoteArchive appointments={APPTS} petId={10} petName="Waffle" />);
    await user.click(screen.getByTestId("note-archive-more"));
    const entries = screen.getAllByTestId("note-archive-entry");
    expect(entries).toHaveLength(3);
    expect(entries[0].textContent).toContain("very matted");
    expect(entries[2].textContent).toContain("First groom");
  });

  it("says 'note' not 'notes' when only one is hidden", () => {
    render(<PetNoteArchive appointments={APPTS.slice(0, 2)} petId={10} petName="Waffle" />);
    expect(screen.getByTestId("note-archive-more").textContent).toContain("Show 1 earlier note");
    expect(screen.getByTestId("note-archive-more").textContent).not.toContain("notes");
  });

  it("dates each note in Brisbane time and names the groomer", () => {
    render(<PetNoteArchive appointments={APPTS} petId={10} petName="Waffle" />);
    const entry = screen.getByTestId("note-archive-entry");
    expect(entry.textContent).toContain("22 Oct 2026");
    expect(entry.textContent).toContain("Brooklyn Cossey");
  });

  it("marks the block staff-only on the card", () => {
    // Andy: "Not for client to be able to view in their portal." Saying
    // so here means nobody has to wonder before they type.
    render(<PetNoteArchive appointments={APPTS} petId={10} petName="Waffle" />);
    expect(screen.getByTestId("note-archive").textContent).toContain("Staff only");
  });

  it("shows no earlier-notes button when there is only one", () => {
    render(<PetNoteArchive appointments={APPTS.slice(1, 2)} petId={10} petName="Waffle" />);
    expect(screen.queryByTestId("note-archive-more")).not.toBeInTheDocument();
  });

  it("keeps another dog's notes off this card", () => {
    const mixed = [...APPTS, { id: 9, petId: 11, scheduledStart: "2026-10-23T00:00:00Z", notes: "Different dog" }];
    render(<PetNoteArchive appointments={mixed} petId={10} petName="Waffle" />);
    expect(screen.queryByText("Different dog")).not.toBeInTheDocument();
  });
});
