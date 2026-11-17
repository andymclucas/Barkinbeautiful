import { describe, it, expect } from "vitest";
import { matchRetailProducts } from "../shared/retailProductSearch";

const PRODUCTS = [
  { id: 1, name: "Oatmeal Shampoo 500ml", sku: "SH-OAT-500", category: "Shampoo" },
  { id: 2, name: "Chicken Treats", sku: null, category: "Treats" },
  { id: 3, name: "Slip Lead", sku: "LD-01", category: null },
];

describe("matchRetailProducts", () => {
  it("returns everything, in order, for an empty search", () => {
    expect(matchRetailProducts(PRODUCTS, "  ").map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("matches part of the name in any case", () => {
    expect(matchRetailProducts(PRODUCTS, "TREAT").map((p) => p.id)).toEqual([2]);
  });

  it("needs every word, in any order", () => {
    expect(matchRetailProducts(PRODUCTS, "shampoo oat").map((p) => p.id)).toEqual([1]);
    expect(matchRetailProducts(PRODUCTS, "shampoo chicken")).toEqual([]);
  });

  it("matches the SKU and the category as well as the name", () => {
    expect(matchRetailProducts(PRODUCTS, "ld-01").map((p) => p.id)).toEqual([3]);
    expect(matchRetailProducts(PRODUCTS, "treats").map((p) => p.id)).toEqual([2]);
  });
});
