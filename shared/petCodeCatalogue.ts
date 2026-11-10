/**
 * Looking up what a pet code means, from the salon's own catalogue.
 *
 * `shared/petCodeMeanings.ts` holds 111 meanings transcribed from MoeGo
 * by hand on 09/10/2026, and says of itself that it WILL fall behind
 * because only a developer could add one. The `pet_codes` table replaces
 * it — but the file stays as the fallback, because a salon that has not
 * seeded its catalogue yet should still see "Nervous" rather than "Ner".
 *
 * So: catalogue first, hardcoded map second, the raw badge last. That
 * ordering means nothing ever regresses to showing less than it did.
 */

import { petCodeMeaning } from "./petCodeMeanings";

export type PetCodeEntry = {
  code: string;
  description?: string | null;
  colourHex?: string | null;
  /** The badge's text colour, or null/absent for automatic. */
  textColourHex?: string | null;
  isActive?: boolean;
  /** A Warning rather than a Code. See shared/petCodeWarnings.ts. */
  isWarning?: boolean | null;
};

/** Case-insensitive, because "sensitive" and "SENSITIVE" are one code. */
export function indexPetCodes(entries: readonly PetCodeEntry[]): Map<string, PetCodeEntry> {
  const map = new Map<string, PetCodeEntry>();
  for (const entry of entries) {
    const key = String(entry?.code ?? "").trim().toLowerCase();
    if (key) map.set(key, entry);
  }
  return map;
}

/** What this code stands for, or null when nobody has said. */
export function meaningFor(code: string, index: Map<string, PetCodeEntry>): string | null {
  const entry = index.get(code.trim().toLowerCase());
  const fromCatalogue = String(entry?.description ?? "").trim();
  if (fromCatalogue) return fromCatalogue;
  // The hardcoded map, for a salon that has not seeded its catalogue.
  return petCodeMeaning(code);
}

/** The badge colour the salon chose, or null to use the default chip. */
export function colourFor(code: string, index: Map<string, PetCodeEntry>): string | null {
  const hex = String(index.get(code.trim().toLowerCase())?.colourHex ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The text colour for a badge: the salon's choice when it made one,
 * otherwise whichever of black or white contrasts more (readableTextOn).
 * The automatic choice is correct by the numbers and can still be the
 * wrong call by eye — black on pure red measures 5.3:1 against white's
 * 4:1, and Andy found it hard to read — so a person can overrule it.
 */
export function badgeTextColour(
  background: string,
  chosen: string | null | undefined,
  automatic: (bg: string) => string,
): string {
  const pick = String(chosen ?? "").trim();
  return HEX.test(pick) ? pick : automatic(background);
}

/** The text colour the salon chose for this code, or null for automatic. */
export function textColourFor(code: string, index: Map<string, PetCodeEntry>): string | null {
  const hex = String(index.get(code.trim().toLowerCase())?.textColourHex ?? "").trim();
  return HEX.test(hex) ? hex : null;
}

/** "SENSITIVE — Nervous", or just "SENSITIVE" when nothing is known.
 *  The em dash matches describePetCode, so one code cannot render two ways. */
export function describeFromCatalogue(code: string, index: Map<string, PetCodeEntry>): string {
  const meaning = meaningFor(code, index);
  return meaning ? `${code} — ${meaning}` : code;
}
