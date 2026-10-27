import { describe, it, expect } from "vitest";
import { priceForPet } from "../shared/multiPetPricing";

describe("priceForPet", () => {
  it("gives each dog its own figure", () => {
    const map = { "10": "145.00", "11": "230.00", "12": "145.00" };
    expect(priceForPet({ petId: 10, priceByPetId: map, petCount: 3 })).toBe("145.00");
    expect(priceForPet({ petId: 11, priceByPetId: map, petCount: 3 })).toBe("230.00");
  });

  it("NEVER puts the whole booking total on one dog", () => {
    // Andy, 27/10/2026: "the $590 was just assigned to Ruby". $590 was
    // the total for three dogs including add-ons.
    expect(priceForPet({ petId: 12, priceByPetId: { "10": "145.00" }, singlePrice: "590.00", petCount: 3 }))
      .toBeNull();
  });

  it("leaves an unpriced dog unpriced, which the salon already handles", () => {
    // An unpriced appointment is excluded from invoicing and shows as
    // "not priced yet" rather than settled. Visible and fixable.
    expect(priceForPet({ petId: 99, priceByPetId: {}, singlePrice: "200.00", petCount: 2 })).toBeNull();
  });

  it("still uses the single box for a single-dog booking", () => {
    // There "the price" and "this dog's price" are the same thing.
    expect(priceForPet({ petId: 10, priceByPetId: {}, singlePrice: "145.00", petCount: 1 })).toBe("145.00");
    expect(priceForPet({ petId: 10, singlePrice: "145.00", petCount: 1 })).toBe("145.00");
  });

  it("prefers the dog's own figure over the box, even on a single booking", () => {
    expect(priceForPet({ petId: 10, priceByPetId: { "10": "99.00" }, singlePrice: "145.00", petCount: 1 }))
      .toBe("99.00");
  });

  it("treats a blank entry as unpriced rather than zero", () => {
    // An empty price box invoices as zero if it is read as a figure.
    for (const blank of ["", "   ", null, undefined]) {
      expect(priceForPet({ petId: 10, priceByPetId: { "10": blank }, petCount: 2 })).toBeNull();
    }
  });
});
