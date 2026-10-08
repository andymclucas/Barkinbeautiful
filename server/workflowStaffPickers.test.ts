import { describe, expect, it } from "vitest";

/**
 * Who may be recorded as having bathed, dried or groomed a dog.
 *
 * Lauren, 08/10/2026: "I can't select myself still for bathing and drying."
 * Her salon role is `owner`; the bather list required `bather` or `groomer`,
 * so the person who owns the place could not be put down as having washed a
 * dog she had just washed. The work then goes unrecorded, which skews the
 * timing analytics that are built on who did what.
 */
type Member = { id: number; name: string; role: string };

/** The real roster, as at 08/10/2026. Managers are not rostered and the
 *  query no longer returns them at all. */
const ROSTERED: Member[] = [
  { id: 1, name: "Lauren Romari", role: "owner" },
  { id: 2, name: "Megs Graham", role: "groomer" },
  { id: 3, name: "Charlotte Purcell", role: "groomer" },
  { id: 4, name: "Zakaria Romari", role: "groomer" },
  { id: 5, name: "Brooklyn Cossey", role: "groomer" },
  { id: 6, name: "Ashleigh Knight", role: "groomer" },
  { id: 7, name: "Steph", role: "bather" },
  { id: 30001, name: "Akilah", role: "bather" },
  { id: 30002, name: "Sabina", role: "bather" },
  { id: 90001, name: "Bailey", role: "bather" },
];

const groomers = (list: Member[]) => list.filter((s) => s.role !== "bather");
const bathers = (list: Member[]) => list;

describe("the bather and dryer picker", () => {
  it("includes the owner", () => {
    expect(bathers(ROSTERED).map((s) => s.name)).toContain("Lauren Romari");
  });

  it("includes every rostered person, because in a salon this size they all do it", () => {
    expect(bathers(ROSTERED)).toHaveLength(ROSTERED.length);
  });
});

describe("the groomer picker", () => {
  it("includes the owner and the groomers", () => {
    const names = groomers(ROSTERED).map((s) => s.name);
    expect(names).toContain("Lauren Romari");
    expect(names).toContain("Megs Graham");
  });

  it("leaves the bathers out", () => {
    expect(groomers(ROSTERED).map((s) => s.name)).not.toContain("Akilah");
  });

  it("no longer offers the managers, who never groom", () => {
    // Andy and Christie administer the system. They are rostered = false,
    // and workflow.getStaff now filters on that, so they never reach the
    // client — the old filter (role !== "bather") put them in every row's
    // groomer dropdown.
    const names = groomers(ROSTERED).map((s) => s.name);
    expect(names).not.toContain("Andy McLucas");
    expect(names).not.toContain("Christie McLucas");
  });
});
