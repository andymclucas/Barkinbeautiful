import { describe, it, expect } from "vitest";
import { pickupPrompt, joinPetNames, petVerb, describePets } from "@shared/pickupGroup";
import { buildReadyForPickupSms } from "./sms";

const dog = (id: number, petName: string, workflowState: string, alreadyTexted = false) =>
  ({ appointmentId: id, petName, workflowState, alreadyTexted });

describe("pickupPrompt", () => {
  it("prompts for a single dog that is ready", () => {
    const out = pickupPrompt([dog(1, "Coco", "ready")]);
    expect(out.prompt).toBe(true);
    expect(out.petNames).toEqual(["Coco"]);
    expect(out.appointmentIds).toEqual([1]);
  });

  it("holds the text while a sibling is still being groomed", () => {
    // Lauren, 13/10: "it's a double dog family so best to have both dogs
    // names and just text once." Texting on the first dog tells the owner
    // to come while the second is still on the table.
    const out = pickupPrompt([dog(1, "Coco", "ready"), dog(2, "Bella", "grooming")]);
    expect(out.prompt).toBe(false);
    expect(out.waitingFor).toEqual(["Bella"]);
  });

  it("prompts once for both when the last one is done", () => {
    const out = pickupPrompt([dog(1, "Coco", "ready"), dog(2, "Bella", "ready")]);
    expect(out.prompt).toBe(true);
    expect(out.petNames).toEqual(["Coco", "Bella"]);
    expect(out.appointmentIds).toEqual([1, 2]);
  });

  it("counts a dog already marked out as collectable", () => {
    // One dog collected early, the other finishing: the text still goes
    // when the second is done, and still names both.
    const out = pickupPrompt([dog(1, "Coco", "complete"), dog(2, "Bella", "ready")]);
    expect(out.prompt).toBe(true);
    expect(out.petNames).toEqual(["Coco", "Bella"]);
  });

  it("does not let a cancelled sibling hold the text back", () => {
    // A family whose second dog was cancelled is still waiting to hear
    // that the first one is done.
    const out = pickupPrompt([dog(1, "Coco", "ready"), dog(2, "Bella", "cancelled")]);
    expect(out.prompt).toBe(true);
    expect(out.petNames).toEqual(["Coco"]);
    expect(out.appointmentIds).toEqual([1]);
  });

  it("does not prompt again once the family has been texted", () => {
    // This is what stops a second message when a dog is nudged back and
    // forward on the board after the text went out.
    const out = pickupPrompt([dog(1, "Coco", "ready", true), dog(2, "Bella", "ready", true)]);
    expect(out.prompt).toBe(false);
  });

  it("still names the already-texted dog when a sibling has not been", () => {
    // The owner is collecting both, so both belong in the message even
    // though only one of them is new.
    const out = pickupPrompt([dog(1, "Coco", "ready", true), dog(2, "Bella", "ready", false)]);
    expect(out.prompt).toBe(true);
    expect(out.petNames).toEqual(["Coco", "Bella"]);
    expect(out.appointmentIds).toEqual([1, 2]);
  });

  it("falls back to a placeholder rather than an empty name", () => {
    const out = pickupPrompt([dog(1, "", "ready")]);
    expect(out.petNames).toEqual(["your dog"]);
  });
});

describe("joinPetNames", () => {
  it("reads the way a person would say it", () => {
    expect(joinPetNames(["Coco"])).toBe("Coco");
    expect(joinPetNames(["Coco", "Bella"])).toBe("Coco and Bella");
    expect(joinPetNames(["Coco", "Bella", "Max"])).toBe("Coco, Bella and Max");
  });

  it("has no Oxford comma", () => {
    // This is a text to a dog owner. "Bella, and Max" reads as a mistake
    // on a phone.
    expect(joinPetNames(["Coco", "Bella", "Max"])).not.toContain("Bella, and");
  });

  it("never produces an empty subject", () => {
    expect(joinPetNames([])).toBe("your dog");
    expect(joinPetNames(["", "  "])).toBe("your dog");
  });
});

describe("petVerb", () => {
  it("agrees with the number of dogs", () => {
    // "Coco and Bella is all done" reads as a machine wrote it, and this
    // goes to a paying customer.
    expect(petVerb(1)).toBe("is");
    expect(petVerb(2)).toBe("are");
    expect(petVerb(3)).toBe("are");
  });
});

describe("buildReadyForPickupSms", () => {
  it("names one dog correctly", () => {
    expect(buildReadyForPickupSms({ clientFirstName: "marjorie", petNames: ["Coco"] }))
      .toBe("Hi marjorie! Coco is all done and looking fabulous at Barkin' Beautiful. Come pick them up whenever you're ready! 🐾✨");
  });

  it("names both dogs of a family in one message", () => {
    expect(buildReadyForPickupSms({ clientFirstName: "marjorie", petNames: ["Coco", "Bella"] }))
      .toBe("Hi marjorie! Coco and Bella are all done and looking fabulous at Barkin' Beautiful. Come pick them up whenever you're ready! 🐾✨");
  });

  it("keeps 'them' for one dog as well as several", () => {
    // Deliberate: "pick them up" is natural either way, and switching to
    // "him" or "her" would need a gender the salon does not always hold.
    const one = buildReadyForPickupSms({ clientFirstName: "Kim", petNames: ["Ralph"] });
    expect(one).toContain("Come pick them up");
  });

  it("falls back rather than addressing an empty name", () => {
    expect(buildReadyForPickupSms({ clientFirstName: "Kim", petNames: [] }))
      .toContain("your dog is all done");
  });
});

describe("describePets", () => {
  it("pairs the subject with the matching verb", () => {
    expect(describePets(["Coco"])).toEqual({ subject: "Coco", verb: "is" });
    expect(describePets(["Coco", "Bella"])).toEqual({ subject: "Coco and Bella", verb: "are" });
  });
});
