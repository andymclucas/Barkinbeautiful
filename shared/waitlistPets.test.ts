import { describe, expect, it } from "vitest";
import { entryPetIds, joinDogNames, splitEntryPets } from "./waitlistPets";

describe("waitlist entries with several dogs", () => {
  it("keeps an old one-dog entry exactly as it was", () => {
    expect(entryPetIds(12, null)).toEqual([12]);
  });
  it("reads the extras whether the driver hands back an array or a JSON string", () => {
    expect(entryPetIds(12, [13, 14])).toEqual([12, 13, 14]);
    expect(entryPetIds(12, "[13,14]")).toEqual([12, 13, 14]);
    expect(entryPetIds(12, "not json")).toEqual([12]);
  });
  it("stores the first dog in pet_id and the rest as extras", () => {
    expect(splitEntryPets([5])).toEqual({ petId: 5, extraPetIds: null });
    expect(splitEntryPets([5, 6, 6, 7])).toEqual({ petId: 5, extraPetIds: [6, 7] });
    expect(() => splitEntryPets([])).toThrow();
  });
  it("names the dogs the way the salon writes them", () => {
    expect(joinDogNames(["Zoey"])).toBe("Zoey");
    expect(joinDogNames(["Zoey", "Max"])).toBe("Zoey & Max");
    expect(joinDogNames(["Zoey", "Max", "Bella"])).toBe("Zoey, Max & Bella");
  });
});
