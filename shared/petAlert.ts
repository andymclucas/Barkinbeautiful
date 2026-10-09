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

/**
 * Where a warning came from, stripped off the front of the warning itself.
 *
 * The import stamped its own provenance into the text, so the board was
 * reading "MoeGo source alert (20 Aug 2026): allergy to chicken" when the
 * only part a groomer needs is "Allergy to chicken". Four shapes exist in
 * the data — "MoeGo source alert", "MoeGo source behaviour", "MoeGo
 * recovery" and "MoeGo report recovery", each with a date in brackets.
 *
 * Andy, 09/10/2026: "remove the MoeGo mention and just have the allergy or
 * whatever the alert is."
 *
 * Stripped for display only. The stored text keeps its provenance, because
 * knowing an allergy arrived in a bulk import rather than from the owner is
 * worth something if it is ever questioned.
 */
const PROVENANCE_PREFIX = /^MoeGo\b[^():]*\([^)]*\)\s*:\s*/i;

export function stripAlertProvenance(text: string): string {
  const stripped = text.replace(PROVENANCE_PREFIX, "").trim();
  if (!stripped) return text.trim();
  // The remainder usually starts lower case because it was mid-sentence.
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** The full warning text, never truncated, or a sensible stand-in. */
export function petAlertText(pet: PetAlertInput): string | null {
  const tone = petAlertTone(pet);
  if (!tone) return null;
  const text = (pet.warnings ?? "").trim();
  if (text) return stripAlertProvenance(text);
  return tone === "danger" ? "Danger alert on this dog." : "Caution on this dog.";
}
