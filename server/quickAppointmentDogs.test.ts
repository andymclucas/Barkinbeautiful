import { describe, it, expect } from "vitest";
import {
  QUICK_DEFAULT_MINUTES,
  QUICK_EXTRA_DOG_MINUTES,
  QUICK_MAX_DOGS,
  quickDurationMinutes,
  usableQuickDogs,
} from "@shared/quickAppointment";

/**
 * Several dogs on one walk-in.
 *
 * Lauren, 09/11/2026, asked what happens when a family brings more than
 * one: "2 dogs for nails same family. Same invoice. One lady has 4 x
 * dogs having nails... takes like 5 min for each dog."
 */
describe("quickDurationMinutes", () => {
  it("leaves a single dog exactly as it was", () => {
    // Most walk-ins are one dog, and that slot must not move.
    expect(quickDurationMinutes(1)).toBe(QUICK_DEFAULT_MINUTES);
  });

  it("adds Lauren's five minutes for each dog after the first", () => {
    // The greeting, the lead off and the payment do not repeat, so only
    // the clipping does.
    expect(quickDurationMinutes(2)).toBe(QUICK_DEFAULT_MINUTES + QUICK_EXTRA_DOG_MINUTES);
    expect(quickDurationMinutes(4)).toBe(30);
  });

  it("does not block out an hour for a four-dog family", () => {
    // A flat 15 each would take 60 minutes off a board other people are
    // trying to book into, for half an hour of work.
    expect(quickDurationMinutes(4)).toBeLessThan(4 * QUICK_DEFAULT_MINUTES);
  });

  it("treats nonsense as one dog rather than a zero-length booking", () => {
    for (const n of [0, -3, 0.4]) expect(quickDurationMinutes(n)).toBe(QUICK_DEFAULT_MINUTES);
  });
});

describe("usableQuickDogs", () => {
  it("ignores a row somebody added and left blank", () => {
    // The form offers another row on request; changing your mind about
    // it must not stop the walk-in saving.
    expect(usableQuickDogs([{ name: "Bella" }, { name: "  " }, { name: "" }]))
      .toEqual([{ name: "Bella" }]);
  });

  it("keeps the order they were typed in", () => {
    expect(usableQuickDogs([{ name: "Bella" }, { name: "Max" }]).map((d) => d.name))
      .toEqual(["Bella", "Max"]);
  });

  it("will not put the same dog on the board twice", () => {
    // Typing a name into two rows at a counter is a slip, not a second
    // animal — and it would charge the family for a dog that was not there.
    expect(usableQuickDogs([{ name: "Bella" }, { name: "bella " }]).length).toBe(1);
  });

  it("trims what was typed", () => {
    expect(usableQuickDogs([{ name: "  Rusty " }])[0].name).toBe("Rusty");
  });

  it("stops at the cap", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Dog${i}` }));
    expect(usableQuickDogs(many).length).toBe(QUICK_MAX_DOGS);
  });

  it("carries the breed through", () => {
    expect(usableQuickDogs([{ name: "Rusty", breed: "Cavoodle" }])[0].breed).toBe("Cavoodle");
  });
});
