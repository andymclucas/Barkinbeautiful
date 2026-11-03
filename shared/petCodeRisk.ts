/**
 * The one pet code that gets shouted.
 *
 * Andy, 04/11/2026: "Any 'bites' warning need to be bold and red so it
 * is very noticeable by the groomers & bathers."
 *
 * shared/petCodes.ts deliberately does NOT grade the 93 codes by
 * severity, and that reasoning still stands — the vocabulary is the
 * salon's own shorthand, and a parser deciding what "PITA" or "Ner"
 * means would get it wrong in both directions. This is not that. It is
 * one word, asked for by name, and it is the exact failure that file
 * named as the worse of the two: "quietly fail to flag a biter".
 *
 * Matching on the word "bite" rather than on the two code strings as
 * they are spelled today. MoeGo's labels are free text typed by staff —
 * "Bites" and "Bites For Feet/ Nails" are both in use — so pinning the
 * literal strings would miss "bites feet" the first time somebody types
 * it, and a missed one is somebody getting bitten.
 *
 * ## What is deliberately NOT here
 *
 * `DOG AGGRESSIVE` (26 dogs), `CAGE AGGRESSIVE` (9) and `muzzle` (3)
 * are the same class of risk and are left plain, because Andy asked for
 * bites specifically. They are a one-word change to this regex if he
 * wants them, and the counts are here so the decision is informed
 * rather than rediscovered.
 */

/**
 * Catches "Bites", "BITES", "Bites For Feet/ Nails", "bites feet".
 *
 * Word-boundary leading so it cannot fire on an unrelated code that
 * merely contains the letters — "bit" of a trim, a "rabbit" breed note.
 */
const BITE = /\bbit(e|es|ing|er)\b/i;

export function isBiteWarning(code: string | null | undefined): boolean {
  return BITE.test((code ?? "").trim());
}

/** True when any of a dog's codes is a bite warning. */
export function hasBiteWarning(codes: readonly string[]): boolean {
  return codes.some(isBiteWarning);
}

/**
 * Just the bite warnings out of a dog's stored code string.
 *
 * For surfaces that cannot afford every code. The calendar card drops
 * codes entirely once it is too small — measured, and right for a blade
 * number — but a bite warning is not a nice-to-have. Alfie's card on
 * the day grid showed no codes at all, so the one thing a bather needs
 * before reaching into the tub was the first thing dropped.
 */
export function biteWarningsIn(codes: readonly string[]): string[] {
  return codes.filter(isBiteWarning);
}
