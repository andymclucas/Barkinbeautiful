import { describe, expect, it } from "vitest";
import { groomCardConditions, groomCardMoods, groomCardRating } from "../shared/groomingCard";

describe("groomCardConditions", () => {
  it("returns the checked conditions in reading order", () => {
    const rows = groomCardConditions({
      coatCondition: "good",
      skinCondition: "excellent",
      eyeCondition: "bright_clear",
      earCondition: "mild_buildup",
      nailCondition: "trimmed",
      teethCondition: "mild_tartar",
    });
    expect(rows.map((r) => r.label)).toEqual(["Coat", "Skin", "Eyes", "Ears", "Nails", "Teeth"]);
    expect(rows.map((r) => r.value)).toEqual([
      "Good", "Excellent", "Bright & clear", "Mild buildup", "Trimmed", "Mild tartar",
    ]);
  });

  // A groomer who never looked at the teeth must not produce a card that
  // implies the teeth were fine.
  it("drops conditions the groomer left blank rather than defaulting them", () => {
    const rows = groomCardConditions({ coatCondition: "matted", teethCondition: null, earCondition: "" });
    expect(rows).toEqual([{ label: "Coat", value: "Matted" }]);
  });

  it("is empty when nothing was recorded", () => {
    expect(groomCardConditions({})).toEqual([]);
  });

  it("passes through a value with no label rather than hiding the row", () => {
    expect(groomCardConditions({ coatCondition: "sun_bleached" })).toEqual([
      { label: "Coat", value: "sun_bleached" },
    ]);
  });
});

describe("groomCardMoods", () => {
  it("splits the stored comma-separated tags", () => {
    expect(groomCardMoods("Happy, Well behaved ,Nervous")).toEqual(["Happy", "Well behaved", "Nervous"]);
  });

  it("is empty for null, empty and comma-only values", () => {
    expect(groomCardMoods(null)).toEqual([]);
    expect(groomCardMoods("")).toEqual([]);
    expect(groomCardMoods(" , , ")).toEqual([]);
  });
});

describe("groomCardRating", () => {
  it("labels a known rating", () => {
    expect(groomCardRating("pawfect")).toBe("Absolutely pawfect 🐾");
  });

  it("returns null when unset, so the card can omit the section", () => {
    expect(groomCardRating(null)).toBeNull();
    expect(groomCardRating("")).toBeNull();
  });

  it("shows an unrecognised rating rather than swallowing it", () => {
    expect(groomCardRating("spectacular")).toBe("spectacular");
  });
});
