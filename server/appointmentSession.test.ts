import { describe, expect, it } from "vitest";
import { getNewSharedSessionPetIds } from "../shared/appointmentSession";

describe("getNewSharedSessionPetIds", () => {
  it("keeps existing family appointment pets intact and returns only new unique pets", () => {
    expect(getNewSharedSessionPetIds([3, 1], [1, 2, 4, 2, 3])).toEqual([2, 4]);
  });
});
