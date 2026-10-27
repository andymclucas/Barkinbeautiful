import { describe, it, expect } from "vitest";
import { dogsNamedInPlan, needsPetAssignment, missingPetCount } from "../shared/membershipCoveredPets";

describe("dogsNamedInPlan", () => {
  /** The exact strings the salon has written, taken from the live table. */
  it("reads the forms the salon actually uses", () => {
    expect(dogsNamedInPlan("Diamond VIP - SML (0-10kg) x2")).toBe(2);
    expect(dogsNamedInPlan("Gold VIP Styled - SML (0-10kg) X2 dogs")).toBe(2);
    expect(dogsNamedInPlan("Silver VIP Classic - Small (0-10kg) x 3 DOGS")).toBe(3);
    expect(dogsNamedInPlan("Gold VIP Styled - SML (0-10kg) x3 DOGS")).toBe(3);
    expect(dogsNamedInPlan("Silver+ (x2)")).toBe(2);
  });

  it("says one when the name claims nothing", () => {
    expect(dogsNamedInPlan("Gold VIP Classic - Small (0-10kg)")).toBe(1);
    expect(dogsNamedInPlan("Silver+")).toBe(1);
    expect(dogsNamedInPlan(null)).toBe(1);
    expect(dogsNamedInPlan("")).toBe(1);
  });

  /**
   * Weight bands and blade numbers live in these names, and reading one
   * as a dog count would put half the book on a review screen.
   */
  it("is not fooled by the numbers already in a plan name", () => {
    expect(dogsNamedInPlan("Silver VIP Classic - SML-MED (11-13kg)")).toBe(1);
    expect(dogsNamedInPlan("Platinum VIP Membership - Large (17-25kg)")).toBe(1);
    expect(dogsNamedInPlan("Gold VIP Classic - MED (14-16kg)")).toBe(1);
  });

  it("reads the count written before the x", () => {
    expect(dogsNamedInPlan("2 x SML Classic")).toBe(2);
  });
});

describe("needsPetAssignment", () => {
  it("asks when the name claims more dogs than are recorded", () => {
    expect(needsPetAssignment({ membershipId: 1, name: "Silver+ (x2)", coveredPetIds: [7] })).toBe(true);
    expect(missingPetCount({ membershipId: 1, name: "Silver+ (x2)", coveredPetIds: [7] })).toBe(1);
  });

  it("stays quiet once the dogs are on it", () => {
    expect(needsPetAssignment({ membershipId: 1, name: "Silver+ (x2)", coveredPetIds: [7, 8] })).toBe(false);
  });

  /**
   * The name is a prompt, not an authority. Somebody who put three dogs
   * on an x2 plan meant to, and re-asking would make the screen noise.
   */
  it("does not argue with a human who added more", () => {
    expect(needsPetAssignment({ membershipId: 1, name: "Silver+ (x2)", coveredPetIds: [7, 8, 9] })).toBe(false);
    expect(missingPetCount({ membershipId: 1, name: "Silver+ (x2)", coveredPetIds: [7, 8, 9] })).toBe(0);
  });

  it("leaves ordinary single-dog plans alone", () => {
    expect(needsPetAssignment({ membershipId: 1, name: "Gold VIP Classic - Small (0-10kg)", coveredPetIds: [7] })).toBe(false);
  });

  /** A plan with no dogs at all is worth asking about whatever it is called. */
  it("asks about a plan covering nothing", () => {
    expect(needsPetAssignment({ membershipId: 1, name: "Silver+", coveredPetIds: [] })).toBe(true);
  });
});
