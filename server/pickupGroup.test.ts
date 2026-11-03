import { describe, it, expect } from "vitest";
import { pickupPrompt, pickupSendDecision, joinPetNames, petVerb, describePets, type PickupSibling } from "@shared/pickupGroup";
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

/**
 * Andy, 04/11/2026: "Only send the one message to the client when all
 * dogs in the family are ready on the workflow board. Do not ever send
 * 2 or 3."
 */
describe("pickupSendDecision", () => {
  const dog = (over: Partial<PickupSibling> & { appointmentId: number }): PickupSibling => ({
    petName: "Dog", workflowState: "ready", ...over,
  });

  it("allows one text when every dog is ready", () => {
    const d = pickupSendDecision([
      dog({ appointmentId: 1, petName: "Junior" }),
      dog({ appointmentId: 2, petName: "Neymar" }),
      dog({ appointmentId: 3, petName: "Alex" }),
    ]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.petNames).toEqual(["Junior", "Neymar", "Alex"]);
    expect(d.appointmentIds).toEqual([1, 2, 3]);
  });

  /*
   * Mellissa Luckman's three texts, exactly. The first send covers all
   * three dogs and logs against all three, so the second and third
   * presses — one per row on the board — must refuse.
   */
  it("refuses the second and third press once the family has been texted", () => {
    const texted = [
      dog({ appointmentId: 1, petName: "Junior", alreadyTexted: true }),
      dog({ appointmentId: 2, petName: "Neymar", alreadyTexted: true }),
      dog({ appointmentId: 3, petName: "Alex", alreadyTexted: true }),
    ];
    const d = pickupSendDecision(texted);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toMatch(/already gone/i);
  });

  /* The refusal carries no names and no ids, so there is nothing for a
     caller to fall back to — which is what sent texts 2 and 3. */
  it("hands back nothing to send on a refusal", () => {
    const d = pickupSendDecision([dog({ appointmentId: 1, alreadyTexted: true })]);
    expect(d).not.toHaveProperty("petNames");
    expect(d).not.toHaveProperty("appointmentIds");
  });

  it("refuses while any dog is still with the groomer, and says which", () => {
    const d = pickupSendDecision([
      dog({ appointmentId: 1, petName: "Junior" }),
      dog({ appointmentId: 2, petName: "Neymar", workflowState: "grooming" }),
    ]);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain("Neymar");
    expect(d.reason).not.toContain("Junior");
  });

  /* A cancelled sibling must not hold the family's text for ever. */
  it("does not wait for a dog that is not coming", () => {
    const d = pickupSendDecision([
      dog({ appointmentId: 1, petName: "Junior" }),
      dog({ appointmentId: 2, petName: "Neymar", workflowState: "cancelled" }),
    ]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.petNames).toEqual(["Junior"]);
  });

  /*
   * A failed send is not a send. loadPickupSiblings excludes failed rows
   * from alreadyTexted, so the retry has to be allowed through here.
   */
  it("allows a retry after a failed send", () => {
    const d = pickupSendDecision([dog({ appointmentId: 1, petName: "Junior", alreadyTexted: false })]);
    expect(d.ok).toBe(true);
  });
});
