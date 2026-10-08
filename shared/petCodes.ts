/**
 * The tags MoeGo shows beside a dog's name — "✂5f, #7f, No cologne, SENSITIVE".
 *
 * 1,463 of the salon's dogs carry them, 93 distinct codes, and they are what a
 * groomer reads before touching the dog. They mix four unrelated things:
 * clip specs (✂5f, #7f, #16mm), style shorthand (Char Do, Megs do), handling
 * rules (No cologne, PLUCK EARS) and safety flags (SENSITIVE, DOG AGGRESSIVE,
 * muzzle, SEDATED).
 *
 * They are deliberately NOT classified into severity here. The vocabulary is
 * the salon's own shorthand — "PITA" and "Ner" mean something to Lauren and
 * nothing to a parser — and guessing which of 93 codes is a safety warning
 * would either cry wolf on a blade number or, far worse, quietly fail to
 * flag a biter. They are shown exactly as MoeGo shows them, in the order the
 * salon wrote them, and a human reads them.
 */

/** Split the stored string into individual codes, in their original order. */
export function parsePetCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const code = part.trim();
    // A duplicate is a data entry slip, not meaning; drop it so the row does
    // not render the same chip twice.
    if (!code || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    out.push(code);
  }
  return out;
}

/** True when a dog has anything worth showing. */
export function hasPetCodes(raw: string | null | undefined): boolean {
  return parsePetCodes(raw).length > 0;
}
