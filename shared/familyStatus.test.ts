import { describe, expect, it } from "vitest";
import { familyStatusChanges, familyStatusesDiffer, familyStatusLabel } from "./familyStatus";

const zeky = { id: 1, petName: "Zeky", workflowState: "checked_in" };
const genji = { id: 2, petName: "Genji", workflowState: "checked_in" };

describe("family booking status", () => {
  it("names every dog", () => {
    expect(familyStatusLabel([zeky, genji])).toBe("Zeky & Genji");
    expect(familyStatusLabel([zeky, genji, { id: 3, petName: "Bella", workflowState: "bathing" }])).toBe("Zeky, Genji & Bella");
    expect(familyStatusLabel([zeky])).toBe("Zeky");
  });

  it("sets every dog that is not already at the new stage", () => {
    expect(familyStatusChanges([zeky, genji], "bathing")).toEqual([1, 2]);
    expect(familyStatusChanges([zeky, { ...genji, workflowState: "bathing" }], "bathing")).toEqual([1]);
    expect(familyStatusChanges([zeky, genji], "checked_in")).toEqual([]);
  });

  it("notices when the dogs are at different stages", () => {
    expect(familyStatusesDiffer([zeky, genji])).toBe(false);
    expect(familyStatusesDiffer([zeky, { ...genji, workflowState: "bathing" }])).toBe(true);
  });
});
