import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientLink, PetLink, petRecordHref, clientRecordHref } from "./RecordLink";

describe("ClientLink", () => {
  it("links a name to that client's record", () => {
    render(<ClientLink clientId={7}>Mike Graham</ClientLink>);
    expect(screen.getByRole("link", { name: "Mike Graham" })).toHaveAttribute("href", "/clients/7");
  });

  /**
   * The rule that matters most. An imported row with no client, a
   * deleted record, an aggregate that names somebody it cannot
   * identify — the NAME still has to appear. Nothing here may make a
   * name vanish because it could not be linked.
   */
  it("still shows the name when there is no id to link to", () => {
    render(<ClientLink clientId={null}>Jennine Murray</ClientLink>);
    expect(screen.getByText("Jennine Murray")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("treats client 0 as no client rather than linking to /clients/0", () => {
    render(<ClientLink clientId={0}>Nobody</ClientLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps whatever styling the name already had", () => {
    render(<ClientLink clientId={7} className="font-bold text-lg">Mike Graham</ClientLink>);
    expect(screen.getByRole("link", { name: "Mike Graham" })).toHaveClass("font-bold", "text-lg");
  });
});

describe("PetLink", () => {
  /**
   * There is no route for a pet — /clients/:id is the only page that
   * holds one — so a dog points at its OWNER, with ?pet= so the page
   * can open on that dog rather than the top of the record.
   */
  it("links a dog to its owner's record, naming the dog", () => {
    render(<PetLink clientId={7} petId={19}>Sweety</PetLink>);
    expect(screen.getByRole("link", { name: "Sweety" })).toHaveAttribute("href", "/clients/7?pet=19");
  });

  it("still links to the owner when the dog has no id", () => {
    render(<PetLink clientId={7} petId={null}>Sweety</PetLink>);
    expect(screen.getByRole("link", { name: "Sweety" })).toHaveAttribute("href", "/clients/7");
  });

  /** A dog with no owner on the row is plain text, not a dead link. */
  it("shows the dog's name as text when the owner is unknown", () => {
    render(<PetLink clientId={null} petId={19}>Sweety</PetLink>);
    expect(screen.getByText("Sweety")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("the href helpers", () => {
  it("agree with the components", () => {
    expect(clientRecordHref(7)).toBe("/clients/7");
    expect(clientRecordHref(null)).toBeNull();
    expect(petRecordHref(7, 19)).toBe("/clients/7?pet=19");
    expect(petRecordHref(7, null)).toBe("/clients/7");
    expect(petRecordHref(null, 19)).toBeNull();
  });
});
