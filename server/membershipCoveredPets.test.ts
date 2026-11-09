import { describe, it, expect } from "vitest";
import {
  dogsNamedInPlan, needsPetAssignment, missingPetCount, planCoveredPetIds,
  membershipsByCoveredPet,
} from "../shared/membershipCoveredPets";

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

describe("planCoveredPetIds", () => {
  /**
   * Scott Barker's shape, which is what started this: a plan filed
   * under Dusty while Effie is the dog on the join table. Both dogs are
   * covered and the client record used to show only one of them.
   */
  it("covers the plan's own dog and the dogs added to it", () => {
    expect(planCoveredPetIds({ petId: 89, assignedPetIds: [90] })).toEqual([89, 90]);
  });

  it("covers the plan's own dog when nothing has been added", () => {
    expect(planCoveredPetIds({ petId: 89 })).toEqual([89]);
    expect(planCoveredPetIds({ petId: 89, assignedPetIds: [] })).toEqual([89]);
    expect(planCoveredPetIds({ petId: 89, assignedPetIds: null })).toEqual([89]);
  });

  /**
   * `setCoveredPets` writes the primary dog into the join table whether
   * or not it was ticked, so this is the ordinary live shape. It must
   * not list the dog twice — a duplicate would push a one-dog plan over
   * its named count and flag it for assignment it does not need.
   */
  it("does not list the primary dog twice when it is also on the join table", () => {
    expect(planCoveredPetIds({ petId: 89, assignedPetIds: [89, 90] })).toEqual([89, 90]);
    expect(needsPetAssignment({
      membershipId: 1, name: "Silver+ (x2)",
      coveredPetIds: planCoveredPetIds({ petId: 89, assignedPetIds: [89, 90] }),
    })).toBe(false);
  });

  /**
   * A plan with no primary dog is not hypothetical — `memberships.pet_id`
   * is nullable, and `manageDepartedPet` can clear it.
   */
  it("copes with a plan that has no dog of its own", () => {
    expect(planCoveredPetIds({ petId: null, assignedPetIds: [90, 91] })).toEqual([90, 91]);
    expect(planCoveredPetIds({})).toEqual([]);
    expect(planCoveredPetIds({ petId: null })).toEqual([]);
  });

  /**
   * The union is what pricing does, so the badge cannot disagree with
   * the price. A dog assigned to a plan but not its primary is covered,
   * and reading the primary alone is exactly the bug being fixed.
   */
  it("is a union, not a choice between the two columns", () => {
    expect(planCoveredPetIds({ petId: 89, assignedPetIds: [90, 91] })).toEqual([89, 90, 91]);
  });

  it("ignores values that are not real ids", () => {
    // `pet_id` arrives from the database and from tRPC input; a NaN or a
    // 0 keyed into the badge map would make a card for a dog that does
    // not exist.
    expect(planCoveredPetIds({ petId: Number.NaN, assignedPetIds: [90] })).toEqual([90]);
    expect(planCoveredPetIds({
      petId: 89,
      assignedPetIds: [Number.NaN, Number.POSITIVE_INFINITY, 90],
    })).toEqual([89, 90]);
  });
});

describe("membershipsByCoveredPet", () => {
  /**
   * Scott Barker's household, which is what exposed this. One Silver
   * VIP Styled plan filed under Dusty (89), covering Effie (90) too.
   * Lauren's words on 06/11/2026 were "effie & dusty aren't showing as
   * membership".
   */
  const barker = {
    id: 18, name: "Silver VIP Styled (x2)", status: "active",
    petId: 89, coveredPetIds: planCoveredPetIds({ petId: 89, assignedPetIds: [89, 90] }),
  };

  it("puts the plan against BOTH dogs it covers", () => {
    const byPet = membershipsByCoveredPet([barker]);
    expect(Object.keys(byPet).map(Number).sort()).toEqual([89, 90]);
    expect(byPet[89]).toEqual([barker]);
    expect(byPet[90]).toEqual([barker]);
  });

  it("is what reading the plan's own dog could not do", () => {
    // The whole defect in one line: the plan names one dog and covers
    // two, so a map keyed on `petId` has a single entry and the second
    // dog gets no tier colour and no departed-dog dialog.
    expect(barker.petId).toBe(89);
    expect(barker.coveredPetIds).toContain(90);
    expect(Object.keys(membershipsByCoveredPet([barker]))).toHaveLength(2);
  });

  /**
   * The consequence that actually cost something, composed the way the
   * client record composes it: a departed dog's manageable plans come
   * from this map filtered on status. Effie absent from the map meant
   * no transfer-or-remove dialog for the plan still being paid for.
   */
  it("lets staff act on a plan covering a departed second dog", () => {
    const byPet = membershipsByCoveredPet([barker]);
    const manageable = (byPet[90] ?? [])
      .filter(plan => !["cancelled", "expired"].includes(plan.status));
    expect(manageable).toHaveLength(1);
    expect(manageable[0].id).toBe(18);
  });

  it("keeps the order it was given, so the newest active plan wins", () => {
    const newer = { id: 2, status: "active", coveredPetIds: [7] };
    const older = { id: 1, status: "active", coveredPetIds: [7] };
    const byPet = membershipsByCoveredPet([newer, older]);
    expect(byPet[7]?.find(p => p.status === "active")?.id).toBe(2);
  });

  it("leaves out a plan covering nothing rather than keying it on zero", () => {
    // Named explicitly rather than inferred: `[{ id: 1 }]` alone makes TS
    // excess-property-check the literal against the generic's constraint,
    // which has no `id`, and the call reads as an error when it is fine.
    type Plan = { id: number; coveredPetIds?: readonly number[] | null };
    expect(membershipsByCoveredPet<Plan>([{ id: 1, coveredPetIds: [] }])).toEqual({});
    expect(membershipsByCoveredPet<Plan>([{ id: 1 }])).toEqual({});
    expect(membershipsByCoveredPet<Plan>([{ id: 1, coveredPetIds: null }])).toEqual({});
    expect(membershipsByCoveredPet<Plan>([{ id: 1, coveredPetIds: [Number.NaN] }])).toEqual({});
  });
});
