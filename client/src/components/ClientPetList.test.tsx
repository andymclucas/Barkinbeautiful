import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientPetList, PETS_SHOWN_IN_LIST, type ClientListPet } from "./ClientPetList";

/**
 * A dog that has passed away stays in the family's row, struck through,
 * with wings. That was asked for explicitly, and it is the one rule in
 * the client list, so it is the one thing worth rendering to check.
 *
 * Deliberately a rendering test and not a source grep. The grep version
 * of this would assert that "line-through" appears somewhere in the
 * file, which stays green if the dog is dropped from the list
 * altogether — CLAUDE.md §7 has three cases where exactly that
 * happened.
 */

const pet = (over: Partial<ClientListPet> = {}): ClientListPet => ({
  id: 1,
  name: "Marlo",
  breed: "Cavoodle",
  ...over,
});

describe("ClientPetList", () => {
  it("says so rather than rendering an empty cell when a client has no dogs", () => {
    render(<ClientPetList pets={[]} />);
    expect(screen.getByText("No dogs")).toBeInTheDocument();
  });

  it("names each dog with its breed", () => {
    render(<ClientPetList pets={[pet(), pet({ id: 2, name: "Link", breed: "Mastiff X" })]} />);
    expect(screen.getByText("Marlo")).toBeInTheDocument();
    expect(screen.getByText("Cavoodle")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();
    expect(screen.getByText("Mastiff X")).toBeInTheDocument();
  });

  it("keeps a departed dog in the list, struck through", () => {
    render(<ClientPetList pets={[pet({ name: "Tyson", passedAway: true })]} />);
    const name = screen.getByText("Tyson");
    // Still there — the point of the rule. Dropping it is the regression.
    expect(name).toBeInTheDocument();
    expect(name.className).toContain("line-through");
  });

  it("gives a departed dog wings and a living one none", () => {
    const { container, unmount } = render(
      <ClientPetList pets={[pet({ name: "Tyson", passedAway: true })]} />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    unmount();

    const living = render(<ClientPetList pets={[pet({ name: "Marlo" })]} />);
    expect(living.container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("does not strike through a living dog", () => {
    render(<ClientPetList pets={[pet({ name: "Marlo" })]} />);
    expect(screen.getByText("Marlo").className).not.toContain("line-through");
  });

  it("caps the list and counts the rest", () => {
    // 27 dogs is a real client (a breeder), and the row has to stay a row.
    const many = Array.from({ length: 27 }, (_, i) =>
      pet({ id: i + 1, name: `Dog ${i + 1}` }),
    );
    render(<ClientPetList pets={many} />);
    expect(screen.getByText(`Dog ${PETS_SHOWN_IN_LIST}`)).toBeInTheDocument();
    expect(screen.queryByText(`Dog ${PETS_SHOWN_IN_LIST + 1}`)).toBeNull();
    expect(screen.getByText(`+${27 - PETS_SHOWN_IN_LIST} more`)).toBeInTheDocument();
  });

  it("shows no overflow count when the dogs all fit", () => {
    const exact = Array.from({ length: PETS_SHOWN_IN_LIST }, (_, i) =>
      pet({ id: i + 1, name: `Dog ${i + 1}` }),
    );
    render(<ClientPetList pets={exact} />);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("renders a dog with no breed on file", () => {
    // 10,372 of 12,552 dogs have no weight; breed is patchy for the same reason.
    render(<ClientPetList pets={[pet({ name: "Rosie", breed: null })]} />);
    expect(screen.getByText("Rosie")).toBeInTheDocument();
  });
});
