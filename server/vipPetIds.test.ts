import { describe, it, expect } from "vitest";
import { vipPetIds } from "../shared/vipPetIds";

describe("vipPetIds", () => {
  /**
   * Lauren, 28/10/2026: "Double dog memberships have the vip on one of
   * them." Cosi is membership 3's primary pet (35); Millie (36) is the
   * second dog on the same "x2" plan.
   */
  it("badges both dogs on a two-dog plan", () => {
    const set = vipPetIds({ primaryPetIds: [35], coveredPetIds: [36] });
    expect(set.has(35)).toBe(true);
    expect(set.has(36)).toBe(true);
  });

  /**
   * membership_pets is empty for every plan today, so the primary must
   * still stand on its own — otherwise this takes the badge off every
   * dog in the salon at once.
   */
  it("still badges the primary when nothing is assigned yet", () => {
    expect([...vipPetIds({ primaryPetIds: [35], coveredPetIds: [] })]).toEqual([35]);
  });

  it("leaves a dog with no plan alone", () => {
    expect(vipPetIds({ primaryPetIds: [35], coveredPetIds: [36] }).has(99)).toBe(false);
  });

  it("counts a dog listed both ways once", () => {
    expect([...vipPetIds({ primaryPetIds: [35], coveredPetIds: [35] })]).toEqual([35]);
  });

  it("ignores nulls rather than badging pet 0", () => {
    const set = vipPetIds({ primaryPetIds: [null, 35], coveredPetIds: [undefined] });
    expect([...set]).toEqual([35]);
  });
});
