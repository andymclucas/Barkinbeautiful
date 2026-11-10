/**
 * Which of a dog's codes are WARNINGS rather than plain codes.
 *
 * Andy, 10/11/2026: "there are some that should be classed as warnings.
 * These appear mostly to be in capital letters such as SENSITIVE, DOG
 * AGGRESSIVE etc. Make sure that these are all added in the bright red
 * warning box on both the appt and the workflow sections. Perhaps they
 * can be sorted under the pet codes to 'Codes' and 'Warnings' and these
 * behave differently."
 *
 * ## Why the catalogue decides, and not the capital letters
 *
 * Capitals are how the salon mostly TYPED its warnings, but they are
 * not the rule. "#7 PFFT", "PLUCK EARS" and "ALL OFF" are capitals and
 * are clip instructions; "Bites", "Ner" (nervous) and "Lead ON" are not
 * capitals and are exactly what a bather needs to see. "PLUCK EARS" and
 * "DONT PLUCK EARS" are one word apart. So a person says which is
 * which, once, on the catalogue row (`pet_codes.is_warning`), and every
 * screen reads that.
 *
 * ## The built-in floor
 *
 * Codes are free text — a groomer can type one that is not in the
 * catalogue. Three kinds are a warning however they are spelled and
 * whether or not anybody has catalogued them, because missing one means
 * somebody is hurt: bites (shared/petCodeRisk.ts, asked for by name on
 * 04/11/2026), aggression, and a muzzle. Those cannot be switched off
 * from the catalogue; everything else can.
 */

import { isBiteWarning } from "./petCodeRisk";
import { meaningFor, type PetCodeEntry } from "./petCodeCatalogue";

/** "DOG AGGRESSIVE", "cage aggression", "Muzzle", "muzzled". */
const ALWAYS = /\b(aggress\w*|muzzl\w*)\b/i;

/** A warning by its own wording — the catalogue cannot turn it off. */
export function isAlwaysWarningCode(code: string | null | undefined): boolean {
  const text = (code ?? "").trim();
  if (!text) return false;
  return isBiteWarning(text) || ALWAYS.test(text);
}

export function isWarningCode(
  code: string | null | undefined,
  index: Map<string, PetCodeEntry>,
): boolean {
  const text = (code ?? "").trim();
  if (!text) return false;
  if (isAlwaysWarningCode(text)) return true;
  return index.get(text.toLowerCase())?.isWarning === true;
}

/** Just the warnings, in the order the dog carries them. */
export function warningCodesIn(
  codes: readonly string[],
  index: Map<string, PetCodeEntry>,
): string[] {
  return codes.filter((code) => isWarningCode(code, index));
}

/** Warnings first, then the rest — for surfaces that list both. */
export function splitWarningCodes(
  codes: readonly string[],
  index: Map<string, PetCodeEntry>,
): { warnings: string[]; codes: string[] } {
  const warnings: string[] = [];
  const rest: string[] = [];
  for (const code of codes) (isWarningCode(code, index) ? warnings : rest).push(code);
  return { warnings, codes: rest };
}

/**
 * One warning, spelled out for the red box: "PITA — Difficult to groom".
 *
 * The meaning is added only when it says something the code does not —
 * "SENSITIVE — SENSITIVE" is how half the catalogue is filled in.
 */
export function describeWarningCode(code: string, index: Map<string, PetCodeEntry>): string {
  const meaning = meaningFor(code, index);
  if (!meaning || meaning.trim().toLowerCase() === code.trim().toLowerCase()) return code;
  return `${code} — ${meaning}`;
}

/** Every warning on the dog as one line, or null when there are none. */
export function warningCodesText(
  codes: readonly string[],
  index: Map<string, PetCodeEntry>,
): string | null {
  const warnings = warningCodesIn(codes, index);
  if (warnings.length === 0) return null;
  return warnings.map((code) => describeWarningCode(code, index)).join(" · ");
}
