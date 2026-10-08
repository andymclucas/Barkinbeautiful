/**
 * Whether a dog needs a warning flag on the board, and how loud it should be.
 *
 * Two fields decide it and they disagree more often than you would hope.
 * `alertLevel` is an enum (ok / caution / danger) and `warnings` is free text,
 * and a dog can carry one without the other. On 09/10/2026 three dogs had a
 * written warning while sitting at alertLevel "ok" — including Bear, whose
 * warning reads "Bites for face and feet. Do not muzzle; nails last with a
 * second person holding." The board showed nothing for him, because it only
 * looked at the enum.
 *
 * So the rule is: a dog is flagged if EITHER field says something. Losing a
 * written instruction because a dropdown was never set is the expensive way
 * round to be wrong.
 */

import { normalizePetAlertLevel, type ActionablePetAlertLevel } from "./petAlertStatus";

export type PetAlertTone = ActionablePetAlertLevel;

export type PetAlertInput = {
  alertLevel?: string | null;
  warnings?: string | null;
};

/** The tone to show, or null when there is nothing to say. */
export function petAlertTone(pet: PetAlertInput): PetAlertTone | null {
  // "ok" and anything unrecognised normalise to null here, which is the
  // existing rule and stays the existing rule.
  const level = normalizePetAlertLevel(pet.alertLevel);
  if (level) return level;
  // A written warning with no level set still gets flagged, just not as a
  // danger — nobody chose that word, so nobody should have it shouted.
  return pet.warnings && pet.warnings.trim() ? "caution" : null;
}

/** The full warning text, never truncated, or a sensible stand-in. */
export function petAlertText(pet: PetAlertInput): string | null {
  const tone = petAlertTone(pet);
  if (!tone) return null;
  const text = (pet.warnings ?? "").trim();
  if (text) return text;
  return tone === "danger" ? "Danger alert on this dog." : "Caution on this dog.";
}
