import { describe, expect, it } from "vitest";
import { cadencePreview } from "@shared/membershipCadencePreview";

describe("cadencePreview", () => {
  it("lists every visit for the year, a fixed number of weeks apart", () => {
    const dates = cadencePreview("2027-01-06", 6, 12);
    expect(dates.slice(0, 3)).toEqual(["2027-01-06", "2027-02-17", "2027-03-31"]);
    expect(dates).toHaveLength(9); // 52 weeks / 6, the "9 grooms" Lauren counted
  });

  it("keeps the weekday", () => {
    for (const d of cadencePreview("2027-01-06", 4, 12)) {
      expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(3); // Wednesday
    }
  });

  it("returns nothing for nonsense", () => {
    expect(cadencePreview("06/01/2027", 6, 12)).toEqual([]);
    expect(cadencePreview("2027-01-06", 0, 12)).toEqual([]);
  });
});
