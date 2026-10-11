import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, salonDocumentTitle } from "@shared/salonTitle";

describe("salonDocumentTitle", () => {
  it("puts the salon after the product", () => {
    expect(salonDocumentTitle("Barkin Beautiful")).toBe("Groomigo — Barkin Beautiful");
  });

  it("falls back to the product alone before a tenant is known", () => {
    // The pre-auth state, and every public page: portal, tracker, card link.
    expect(salonDocumentTitle(undefined)).toBe(PRODUCT_NAME);
    expect(salonDocumentTitle(null)).toBe(PRODUCT_NAME);
  });

  it("does not leave a dangling separator on a blank name", () => {
    // "Groomigo — " is the tell-tale of a name that did not load.
    expect(salonDocumentTitle("")).toBe(PRODUCT_NAME);
    expect(salonDocumentTitle("   ")).toBe(PRODUCT_NAME);
  });

  it("trims and collapses scruffy whitespace", () => {
    expect(salonDocumentTitle("  Barkin   Beautiful  ")).toBe("Groomigo — Barkin Beautiful");
  });

  it("does not repeat itself when a salon is named after the product", () => {
    expect(salonDocumentTitle("Groomigo")).toBe("Groomigo");
    expect(salonDocumentTitle("groomigo")).toBe("Groomigo");
  });

  it("leaves an ampersand and punctuation alone — the tab is not HTML", () => {
    expect(salonDocumentTitle("Barkin Beautiful Grooming Studio & Playgroup"))
      .toBe("Groomigo — Barkin Beautiful Grooming Studio & Playgroup");
  });
});
