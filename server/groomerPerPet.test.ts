import { describe, expect, it } from "vitest";
import {
  isSplitBooking,
  referencedStaffIds,
  resolveGroomerAssignments,
} from "@shared/groomerPerPet";

const LAUREN = 3;
const MEGS = 7;
const LOLA = 101;
const POPPY = 102;

describe("resolveGroomerAssignments", () => {
  it("gives every dog the booking's groomer when nothing is split", () => {
    const got = resolveGroomerAssignments([LOLA, POPPY], LAUREN, undefined);
    expect([...got]).toEqual([[LOLA, LAUREN], [POPPY, LAUREN]]);
  });

  it("splits the dogs when a per-pet groomer is given", () => {
    const got = resolveGroomerAssignments([LOLA, POPPY], LAUREN, { [POPPY]: MEGS });
    expect(got.get(LOLA)).toBe(LAUREN);
    expect(got.get(POPPY)).toBe(MEGS);
  });

  it("falls back for a pet the map does not mention", () => {
    const got = resolveGroomerAssignments([LOLA, POPPY], LAUREN, { "999": MEGS });
    expect(got.get(LOLA)).toBe(LAUREN);
    expect(got.get(POPPY)).toBe(LAUREN);
  });

  it("leaves a dog unassigned rather than inventing a groomer", () => {
    // An appointment with no groomer is valid and shows on the board as
    // needing one. Defaulting to the first staff member would hide that.
    const got = resolveGroomerAssignments([LOLA], undefined, undefined);
    expect(got.get(LOLA)).toBeUndefined();
  });

  it("still honours a per-pet groomer when the booking has no default", () => {
    const got = resolveGroomerAssignments([LOLA, POPPY], undefined, { [LOLA]: MEGS });
    expect(got.get(LOLA)).toBe(MEGS);
    expect(got.get(POPPY)).toBeUndefined();
  });

  it("returns one entry per pet, in the order given", () => {
    expect([...resolveGroomerAssignments([POPPY, LOLA], LAUREN, undefined).keys()]).toEqual([POPPY, LOLA]);
  });
});

describe("referencedStaffIds", () => {
  it("collects the default and every override, without duplicates", () => {
    const ids = referencedStaffIds([LOLA, POPPY], LAUREN, { [LOLA]: LAUREN, [POPPY]: MEGS });
    expect([...ids].sort((a, b) => a - b)).toEqual([LAUREN, MEGS]);
  });

  it("is empty when nobody is assigned, so no pointless tenant check runs", () => {
    expect(referencedStaffIds([LOLA], undefined, undefined)).toEqual([]);
  });

  it("ignores an override for a pet that is not in the booking", () => {
    // The map is caller-controlled, but an entry for a pet nobody is booking
    // is dead weight: resolveGroomerAssignments never reads it, so it cannot
    // reach an insert. Collecting it would only make a harmless payload fail
    // the tenant check.
    expect(referencedStaffIds([LOLA], undefined, { "999": MEGS })).toEqual([]);
  });
});

describe("isSplitBooking", () => {
  it("is false when everyone shares a groomer", () => {
    expect(isSplitBooking([LOLA, POPPY], LAUREN, undefined)).toBe(false);
    expect(isSplitBooking([LOLA, POPPY], LAUREN, { [POPPY]: LAUREN })).toBe(false);
  });

  it("is true once the dogs are with different people", () => {
    expect(isSplitBooking([LOLA, POPPY], LAUREN, { [POPPY]: MEGS })).toBe(true);
  });

  it("counts assigned-vs-unassigned as a split", () => {
    expect(isSplitBooking([LOLA, POPPY], undefined, { [LOLA]: LAUREN })).toBe(true);
  });

  it("is false for a single dog", () => {
    expect(isSplitBooking([LOLA], LAUREN, { [LOLA]: MEGS })).toBe(false);
  });
});
