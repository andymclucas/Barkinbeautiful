import { describe, it, expect } from "vitest";
import { buildPassingReview, describePassingReview } from "../shared/petPassingReview";

const plan = (id: number, name: string, price: string, petId: number | null, weeks = 1) => ({
  id, name, pricePerCycle: price, billingCycleWeeks: weeks, petId, petName: null,
});

/** Kayla Fellingham, 22/10/2026 — the case that prompted this. */
const JEMIMA = { id: 238, name: "Jemima", weightKg: 12, status: "active" as const };
const LATTE = { id: 239, name: "Latte", weightKg: 6, status: "departed" as const };
const TEACUP = { id: 240, name: "Teacup", weightKg: 6, status: "active" as const };

describe("buildPassingReview", () => {
  it("says there is nothing to decide when no membership exists", () => {
    const out = buildPassingReview({ departedPet: TEACUP, survivingPets: [JEMIMA], memberships: [] });
    expect(out.isEmpty).toBe(true);
    expect(out.memberships).toEqual([]);
  });

  it("surfaces a plan attached to a DIFFERENT dog than the one that died", () => {
    /**
     * The whole reason this exists. The MoeGo import hung Kayla's
     * two-dog plan for Latte and Teacup off Jemima, so filtering by
     * "attached to the departed pet" would have shown nothing at all
     * and the $30 a week would have kept running.
     */
    const out = buildPassingReview({
      departedPet: TEACUP,
      survivingPets: [JEMIMA],
      memberships: [plan(50, "Bronze VIP Classic - 2 x SML (0-10kg)", "30.00", 238)],
    });
    expect(out.memberships).toHaveLength(1);
    expect(out.memberships[0].attachedToDeparted).toBe(false);
  });

  it("flags the one that IS attached to the dog that died", () => {
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA],
      memberships: [plan(9, "Teacup's plan", "25.00", 240)],
    });
    expect(out.memberships[0].attachedToDeparted).toBe(true);
  });

  it("suggests cancelling when no surviving dog is in the right weight band", () => {
    // Teacup was 6kg (Small); Jemima is 12kg (Small-Medium). A small-dog
    // plan cannot simply move to her.
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA],
      memberships: [plan(50, "2 x SML", "30.00", 238)],
    });
    expect(out.memberships[0].movableTo).toEqual([]);
    expect(out.memberships[0].suggestion).toBe("cancel");
  });

  it("suggests moving when exactly one surviving dog fits", () => {
    const sibling = { id: 999, name: "Pip", weightKg: 6, status: "active" as const };
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA, sibling],
      memberships: [plan(50, "SML", "30.00", 240)],
    });
    expect(out.memberships[0].movableTo).toEqual([{ id: 999, name: "Pip" }]);
    expect(out.memberships[0].suggestion).toBe("move");
  });

  it("asks which when several fit, rather than picking one", () => {
    const a = { id: 998, name: "Pip", weightKg: 6, status: "active" as const };
    const b = { id: 997, name: "Bo", weightKg: 7, status: "active" as const };
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [a, b],
      memberships: [plan(50, "SML", "30.00", 240)],
    });
    expect(out.memberships[0].suggestion).toBe("choose");
    expect(out.memberships[0].movableTo).toHaveLength(2);
  });

  it("never offers to move a plan onto another dead dog", () => {
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [LATTE],
      memberships: [plan(50, "SML", "30.00", 240)],
    });
    expect(out.memberships[0].movableTo).toEqual([]);
    expect(out.survivingPets).toEqual([]);
  });

  it("never offers to move a plan onto the dog that just died", () => {
    const out = buildPassingReview({
      departedPet: TEACUP,
      survivingPets: [{ ...TEACUP }],
      memberships: [plan(50, "SML", "30.00", 240)],
    });
    expect(out.survivingPets).toEqual([]);
  });

  it("totals the weekly cost across every plan shown", () => {
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA],
      memberships: [plan(50, "A", "30.00", 238), plan(51, "B", "19.00", 238)],
    });
    expect(out.weeklyTotal).toBe(49);
  });

  it("converts a longer billing cycle to a weekly figure", () => {
    // A fortnightly $40 plan is $20 a week, and the headline is weekly.
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA],
      memberships: [plan(50, "Fortnightly", "40.00", 238, 2)],
    });
    expect(out.weeklyTotal).toBe(20);
  });

  it("copes with a membership that carries no price", () => {
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA],
      memberships: [plan(50, "Unpriced", null, 238)],
    });
    expect(out.weeklyTotal).toBe(0);
    expect(out.isEmpty).toBe(false);
  });
});

describe("describePassingReview", () => {
  it("names the dog and the money still running", () => {
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA],
      memberships: [plan(50, "A", "30.00", 238), plan(51, "B", "19.00", 238)],
    });
    const line = describePassingReview(out);
    expect(line).toContain("Teacup");
    expect(line).toContain("2 active memberships");
    expect(line).toContain("$49.00 a week");
  });

  it("asks a question rather than stating a conclusion", () => {
    // The system does not know whether the plan should stop — the
    // surviving dog's grooms are often prepaid through it.
    const out = buildPassingReview({
      departedPet: TEACUP, survivingPets: [JEMIMA], memberships: [plan(50, "A", "30.00", 238)],
    });
    expect(describePassingReview(out)).toContain("should move, stop or stay");
  });

  it("says only that the dog passed when no money is attached", () => {
    const out = buildPassingReview({ departedPet: TEACUP, survivingPets: [JEMIMA], memberships: [] });
    expect(describePassingReview(out)).toBe("Teacup was recorded as passed away.");
  });
});
