/**
 * One pickup text per family, naming every dog.
 *
 * Lauren, 13/10/2026: "it's a double dog family so best to have both dogs
 * names and just text once."
 *
 * The prompt fires when a dog is marked READY. For a client with two dogs
 * in that meant two prompts and two texts — and the first one went out
 * while the second dog was still on the table, telling the owner to come
 * when only half the family was done.
 *
 * So the prompt waits for the last dog, and the message names them all.
 */

/** One of a client's dogs on the board today. */
export type PickupSibling = {
  appointmentId: number;
  petName: string | null | undefined;
  workflowState: string;
  /** A pickup text already went out for this dog. */
  alreadyTexted?: boolean;
};

/** Done and waiting to be collected. */
const COLLECTABLE = new Set(["ready", "complete"]);

/**
 * Not coming — cancelled or never arrived. These must not hold the text
 * back: a family whose second dog was cancelled is still waiting to hear
 * that the first one is done.
 */
const NOT_COMING = new Set(["cancelled", "no_show"]);

export type PickupPrompt = {
  /** Whether to open the dialog at all. */
  prompt: boolean;
  /** Every appointment this one text covers. */
  appointmentIds: number[];
  /** Their names, in board order. */
  petNames: string[];
  /** Dogs still being worked on, when that is why we are not prompting. */
  waitingFor: string[];
};

/**
 * Should the pickup dialog open, and for which dogs?
 *
 * `siblings` is every dog this client has on the board today, including
 * the one just marked ready.
 */
export function pickupPrompt(siblings: ReadonlyArray<PickupSibling>): PickupPrompt {
  const live = siblings.filter((s) => !NOT_COMING.has(s.workflowState));
  const collectable = live.filter((s) => COLLECTABLE.has(s.workflowState));
  const stillWorking = live.filter((s) => !COLLECTABLE.has(s.workflowState));

  const name = (s: PickupSibling) => (s.petName ?? "").trim() || "your dog";

  // A dog still on the table holds the text. Telling an owner to come when
  // half the family is done is the thing being fixed.
  if (stillWorking.length > 0) {
    return {
      prompt: false,
      appointmentIds: [],
      petNames: [],
      waitingFor: stillWorking.map(name),
    };
  }

  // Everyone already texted: nothing to say again. This is what stops a
  // second prompt when the last dog is marked ready after a text has
  // already gone out for the first.
  const untexted = collectable.filter((s) => !s.alreadyTexted);
  if (collectable.length === 0 || untexted.length === 0) {
    return { prompt: false, appointmentIds: [], petNames: [], waitingFor: [] };
  }

  // The text names EVERY dog being collected, not only the untexted ones —
  // the owner is coming for both, so both belong in the message.
  return {
    prompt: true,
    appointmentIds: collectable.map((s) => s.appointmentId),
    petNames: collectable.map(name),
    waitingFor: [],
  };
}

/**
 * "Coco", "Coco and Bella", "Coco, Bella and Max".
 *
 * No Oxford comma: this is a text message to a dog owner, not a style
 * guide, and "Bella, and Max" reads as a mistake on a phone.
 */
export function joinPetNames(names: ReadonlyArray<string>): string {
  const clean = names.map((n) => n.trim()).filter((n) => n !== "");
  if (clean.length === 0) return "your dog";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/**
 * "is" or "are", to match.
 *
 * Worth its own function because getting it wrong is worse than the bug
 * being fixed: "Coco and Bella is all done" reads as a machine wrote it,
 * and this message goes to a paying customer.
 */
export function petVerb(count: number): "is" | "are" {
  return count === 1 ? "is" : "are";
}

/** "them" reads naturally for one dog or several, so no pronoun switch. */
export function describePets(names: ReadonlyArray<string>): { subject: string; verb: "is" | "are" } {
  const clean = names.map((n) => n.trim()).filter((n) => n !== "");
  return { subject: joinPetNames(clean), verb: petVerb(clean.length || 1) };
}
