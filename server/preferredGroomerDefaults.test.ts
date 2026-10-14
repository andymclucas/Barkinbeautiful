import { describe, it, expect } from "vitest";
import { preferredGroomerDefaults } from "@shared/preferredGroomerDefaults";

const ROSTER = [2, 3, 6, 7];           // Megs, Charlotte, Ashleigh, Stephanie
const EMPTY = { staffId: "", staffByPetId: {} };

const pets = [
  { id: 10, preferredGroomerId: 3 },   // Gus  → Charlotte
  { id: 11, preferredGroomerId: 3 },   // Beau → Charlotte
  { id: 12, preferredGroomerId: 2 },   // Olah → Megs
  { id: 13, preferredGroomerId: null }, // Teddy, no preference
  { id: 14, preferredGroomerId: 999 }, // Minnie → somebody who has left
];

const run = (petIds: string[], draft = EMPTY) =>
  preferredGroomerDefaults({ petIds, draft, pets, rosterIds: ROSTER });

describe("preferredGroomerDefaults", () => {
  it("fills one dog's usual groomer as the booking groomer", () => {
    expect(run(["10"])).toEqual({ staffId: "3", staffByPetId: {} });
  });

  it("uses one groomer when every dog agrees", () => {
    // Gus and Beau both go to Charlotte — no need to split the booking.
    expect(run(["10", "11"])).toEqual({ staffId: "3", staffByPetId: {} });
  });

  it("splits per dog when they disagree", () => {
    const out = run(["10", "12"]);
    expect(out).toEqual({ staffId: "", staffByPetId: { "10": "3", "12": "2" } });
  });

  it("does not spread one dog's preference onto a dog that has none", () => {
    // Gus goes to Charlotte. That says nothing about Teddy, so Teddy is
    // left for a human rather than quietly booked with her.
    const out = run(["10", "13"]);
    expect(out).toEqual({ staffId: "", staffByPetId: { "10": "3" } });
    expect(out?.staffByPetId["13"]).toBeUndefined();
  });

  it("ignores a preference naming somebody who has left", () => {
    // A preference outlives the person it names.
    expect(run(["14"])).toBeNull();
  });

  it("does not let a departed preference turn an agreement into a split", () => {
    // Gus and Beau still agree; Minnie's stale id is simply not a
    // preference, so she is left for a human like Teddy.
    const out = run(["10", "11", "14"]);
    expect(out).toEqual({ staffId: "", staffByPetId: { "10": "3", "11": "3" } });
  });

  it("never overrides a groomer chosen by hand", () => {
    // Rule 1. Somebody has already said who is doing this one.
    expect(run(["10", "11"], { staffId: "6", staffByPetId: {} })).toBeNull();
  });

  it("never overrides a per-dog choice already made", () => {
    const out = run(["10", "12"], { staffId: "", staffByPetId: { "10": "6" } });
    expect(out).toEqual({ staffId: "", staffByPetId: { "10": "6", "12": "2" } });
  });

  it("leaves a hand-made split alone even when the dogs agree", () => {
    // A split is the more specific choice; collapsing it to one groomer
    // would undo somebody's deliberate work.
    expect(run(["10", "11"], { staffId: "", staffByPetId: { "10": "6" } })).toBeNull();
  });

  it("says nothing when no dog has a preference", () => {
    expect(run(["13"])).toBeNull();
  });

  it("says nothing when no dogs are selected", () => {
    expect(run([])).toBeNull();
  });

  it("returns null rather than an equal object when nothing is left to fill", () => {
    // The caller runs this from an effect. Handing back a fresh object on
    // every render would set state forever.
    //
    // Both of these are already settled: the first by a per-dog entry that
    // happens to match the preference, the second by the booking groomer.
    expect(preferredGroomerDefaults({
      petIds: ["10", "12"],
      draft: { staffId: "", staffByPetId: { "10": "3", "12": "2" } },
      pets, rosterIds: ROSTER,
    })).toBeNull();
    expect(preferredGroomerDefaults({
      petIds: ["10"], draft: { staffId: "3", staffByPetId: {} }, pets, rosterIds: ROSTER,
    })).toBeNull();
  });

  it("ignores a dog that is not on the client's list", () => {
    expect(preferredGroomerDefaults({
      petIds: ["999"], draft: EMPTY, pets, rosterIds: ROSTER,
    })).toBeNull();
  });
});
