import { describe, expect, it } from "vitest";
import { deleteBookingPrompt } from "./deleteBookingPrompt";

describe("deleteBookingPrompt", () => {
  it("asks nothing extra for a dog on its own", () => {
    expect(deleteBookingPrompt({ petName: "Dusty", otherDogs: [] })).toEqual({ shared: false });
  });

  it("names both dogs and offers each outcome in its own words", () => {
    expect(deleteBookingPrompt({ petName: "Dusty", otherDogs: ["Effie"] })).toEqual({
      shared: true,
      question: "Dusty is on one booking with Effie. Delete only Dusty, or all 2 dogs?",
      onlyLabel: "Delete only Dusty",
      allLabel: "Delete all 2 dogs",
    });
  });

  it("lists a bigger family", () => {
    const prompt = deleteBookingPrompt({ petName: "Beau", otherDogs: ["Dusty", "Teddie", "Woody"] });
    expect(prompt.shared && prompt.question).toBe("Beau is on one booking with Dusty, Teddie and Woody. Delete only Beau, or all 4 dogs?");
    expect(prompt.shared && prompt.allLabel).toBe("Delete all 4 dogs");
  });

  it("still counts a dog it cannot name", () => {
    const prompt = deleteBookingPrompt({ petName: "", otherDogs: [null, "Effie"] });
    expect(prompt.shared && prompt.question).toBe("this dog is on one booking with 2 other dogs. Delete only this dog, or all 3 dogs?");
  });
});
