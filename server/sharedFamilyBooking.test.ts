import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { priceForAddedFamilyPet } from "@shared/appointmentMembershipCoverage";

/**
 * Adding a dog to a family booking.
 *
 * This file used to read routers.ts and assert it contained the literal
 * text `price: null`. That could not tell the difference between the rule
 * being right and the rule being absent, and it broke the moment the
 * covered case was added — which is the failure mode CLAUDE.md §7
 * describes. The rule is a function now, and the only thing still read
 * from source is DELEGATION: that the router calls it rather than
 * spelling it out again.
 */

describe("what an added family dog is priced at", () => {
  it("invents no per-pet charge, because the booking may already carry one", () => {
    expect(priceForAddedFamilyPet(false)).toBeNull();
  });

  it("is explicitly zero when a membership covers the dog", () => {
    // The weekly payment is the revenue; the groom itself is never billed.
    expect(priceForAddedFamilyPet(true)).toBe("0.00");
  });
});

describe("shared-family booking repair", () => {
  it("still guards who may be added, and delegates the price", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("addPetsToSharedAppointment: operationalProcedure");
    expect(routerSource).toContain("Every added pet must be an active pet belonging to the same client");
    expect(routerSource).toContain("getNewSharedSessionPetIds");
    // Delegation, counted: a second copy of the rule would not be caught
    // by asserting it merely appears somewhere.
    // One call site. The import carries no paren so it does not count —
    // the same quirk cancelledAppointment.test.ts documents.
    expect(routerSource.split("priceForAddedFamilyPet(").length - 1).toBe(1);
  });
});
