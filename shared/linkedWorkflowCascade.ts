/**
 * When moving one dog on the board should move the rest of its party.
 *
 * Two stages do, on deliberately different terms:
 *
 *  - **check-in**, only when a human says yes. Andy, 27/10/2026:
 *    "Perhaps a button that pops up to say 'would you like to check in
 *    all dogs related to this family?'" Charlie and Ruby Blackaby arrive
 *    in one car, but the staff member decides.
 *  - **complete**, automatically, which is behaviour the board has
 *    always had: one dog of a party being collected means the party has
 *    gone.
 *
 * Nothing else cascades, ever. Andy, same message: "No other stages in
 * the grooming cycle should have that feature. They need to be bathed,
 * dryed etc separately." Two dogs share a car, not a bath — one going
 * into the tub says nothing about where the other is.
 */

export type CascadeStage = "checked_in" | "complete";

/** Whether this stage may move linked dogs at all. */
export function stageCanCascade(stage: string): stage is CascadeStage {
  return stage === "checked_in" || stage === "complete";
}

/**
 * Whether moving to `stage` cascades without being asked.
 *
 * Completion does; check-in does not. Checking a dog in is a routine
 * action done dozens of times a day, and silently moving another dog
 * each time is the kind of surprise that makes staff distrust the
 * board. Collection happens once, at the end, and the party leaves
 * together.
 */
export function cascadesAutomatically(stage: CascadeStage): boolean {
  return stage === "complete";
}

/**
 * Whether a linked dog should be dragged along to `stage`.
 *
 * The asymmetry is the point. Check-in only ever moves a dog that has
 * NOT arrived: pulling a dog already in the bath back to "checked in"
 * would lose its timings and take it off the bather's queue mid-wash.
 * Completion moves anything not already complete.
 */
export function shouldCascadeTo(stage: CascadeStage, linkedState: string): boolean {
  if (stage === "checked_in") return linkedState === "scheduled";
  return linkedState !== "complete";
}

/** Terminal rows are never dragged along, whatever the stage. */
export function cascadeEligible(status: string, workflowState: string): boolean {
  return status !== "cancelled" && status !== "no_show"
    && workflowState !== "cancelled" && workflowState !== "no_show";
}

/** "Also check in Ruby?" / "Also check in Ruby and Bella?" */
export function describeCascadePrompt(petNames: readonly string[]): string | null {
  const names = petNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Also check in ${list}?`;
}

/**
 * Whether checking a dog in should stop to ask about the rest of its party.
 *
 * Only when the question has not been answered yet. The answer arrives as
 * `alsoCheckInLinked`: true for "check in all", false for "just this dog",
 * and absent when nobody has been asked.
 *
 * Until 17/11/2026 the board asked whenever the answer was not `true`, so
 * "Just Olive" (false) was treated as never having been asked: the dialog
 * closed and reopened at once, and the dog could not be checked in alone.
 * Lauren hit it with two unrelated dogs linked only to share a bath.
 */
export function shouldAskAboutLinkedCheckIn(
  fields: { workflowState?: string | null; alsoCheckInLinked?: boolean | null },
  linkedStillToArrive: number,
): boolean {
  if (fields.workflowState !== "checked_in") return false;
  if (fields.alsoCheckInLinked === true || fields.alsoCheckInLinked === false) return false;
  return linkedStillToArrive > 0;
}

/**
 * What makes dogs one PARTY, for check-in and for going home.
 *
 * A party is dogs that arrive and leave together: the same booking
 * session, else the same family booked at the same time. Nothing else.
 *
 * A shared BATH GROUP is deliberately not a party. Until 17/11/2026 it
 * was the first thing asked, ahead of the booking and the family, and
 * that was wrong twice over:
 *
 *  - Lauren, 12/11/2026: "so many dogs have been marked out when they are
 *    finished being dried." Marking one dog out marked every dog in its
 *    bath group out, whatever stage it was at, and a bath group can hold
 *    dogs from different households.
 *  - Lauren, 17/11/2026: Olive and Lulu, two families, linked only to be
 *    bathed together. Checking Olive in asked "Also check in Lulu? ...
 *    Families usually arrive together."
 *
 * It also contradicts what the bath dialog promises staff: "This does not
 * change family links, appointment times or workflow stages." Two dogs
 * can share a bath without sharing a car.
 *
 * So a dog given a bath of its own, or put in a bath with a stranger,
 * still belongs to its own booking or family and to nobody else.
 */
export type PartyKey =
  | { kind: "session"; sessionId: string }
  | { kind: "family"; familyGroupId: number | string; scheduledStart: number };

type PartyRow = {
  sessionId?: string | null;
  petFamilyGroupId?: number | string | null;
  scheduledStart?: Date | string | number | null;
};

function startMs(value: PartyRow["scheduledStart"]): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** The party this dog belongs to, or null when it came alone. */
export function partyKeyOf(row: PartyRow): PartyKey | null {
  const sessionId = row.sessionId?.trim();
  if (sessionId) return { kind: "session", sessionId };
  const family = row.petFamilyGroupId;
  const start = startMs(row.scheduledStart);
  if (family !== null && family !== undefined && family !== "" && start !== null) {
    return { kind: "family", familyGroupId: family, scheduledStart: start };
  }
  return null;
}

/**
 * Whether `other` is in the same party as `self`.
 *
 * Asked from `self`'s side, as the server does: a dog on a booking
 * session is matched by session and never falls back to family.
 */
export function inSameParty(self: PartyRow, other: PartyRow): boolean {
  const key = partyKeyOf(self);
  if (!key) return false;
  if (key.kind === "session") return other.sessionId?.trim() === key.sessionId;
  return other.petFamilyGroupId !== null && other.petFamilyGroupId !== undefined
    && String(other.petFamilyGroupId) === String(key.familyGroupId)
    && startMs(other.scheduledStart) === key.scheduledStart;
}
