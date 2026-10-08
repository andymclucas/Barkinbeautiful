/**
 * What is actually missing from a new appointment, in words.
 *
 * A groomer, 08/10/2026: "I'm tryna add a dog in and it's telling me to
 * select a client or dog but I have already." She had — except the pet chip
 * is a toggle, and an untapped one is a plain outline that reads as a label
 * rather than a choice. The form was right and the message was useless: it
 * listed every requirement at once, so she could not tell which one it
 * meant, and started filling in Notes to make it go away.
 *
 * Notes is not required and never was. Saying precisely what is missing is
 * how somebody stops guessing.
 */

export type NewAppointmentDraft = {
  clientId?: string | null;
  petIds?: readonly string[] | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
};

export function missingFromNewAppointment(draft: NewAppointmentDraft): string[] {
  const missing: string[] = [];
  if (!draft.clientId) missing.push("a client");
  if (!draft.petIds || draft.petIds.length === 0) missing.push("which dog this is for");
  if (!draft.scheduledStart || !draft.scheduledEnd) missing.push("a start and end time");
  return missing;
}

/** One sentence naming only what is actually absent. */
export function newAppointmentError(draft: NewAppointmentDraft): string | null {
  const missing = missingFromNewAppointment(draft);
  if (missing.length === 0) return null;
  if (missing.length === 1) return `Still needed: ${missing[0]}.`;
  const last = missing[missing.length - 1];
  return `Still needed: ${missing.slice(0, -1).join(", ")} and ${last}.`;
}

/**
 * The pets to start with once a client is chosen.
 *
 * One dog means one dog — selecting the client has already said which. Most
 * of this salon's clients have exactly one, and making them tap a chip that
 * does not look tappable is how the booking above failed.
 *
 * Two or more stays an explicit choice. Guessing there would book the wrong
 * dog, which is worse than an extra tap.
 */
export function autoSelectedPetIds(petIds: readonly number[]): string[] {
  return petIds.length === 1 ? [String(petIds[0])] : [];
}
