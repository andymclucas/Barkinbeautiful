import { describe, expect, it } from "vitest";
import { bookingCompanions } from "./bookingCompanions";

const ids = (pets: { id: number }[]) => pets.map((pet) => pet.id);

describe("dogs that can join a booking from the client card", () => {
  it("offers the client's other dog when the two are not family-linked (Lauren, 25/11/2026)", () => {
    const pets = [{ id: 166, familyGroupId: null }, { id: 167, familyGroupId: null }];
    expect(ids(bookingCompanions(pets, 166))).toEqual([167]);
  });

  it("lists family-linked dogs first, then the rest", () => {
    const pets = [
      { id: 1, familyGroupId: 9 },
      { id: 2, familyGroupId: null },
      { id: 3, familyGroupId: 9 },
    ];
    expect(ids(bookingCompanions(pets, 1))).toEqual([3, 2]);
  });

  it("offers nothing until a dog is picked, or for a one-dog client", () => {
    expect(bookingCompanions([{ id: 1 }, { id: 2 }], null)).toEqual([]);
    expect(bookingCompanions([{ id: 1 }], 1)).toEqual([]);
  });
});
