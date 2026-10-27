/**
 * Tidying the capitalisation of a name somebody typed.
 *
 * Clients enter their own names now — online booking, the membership
 * sign-up, the waitlist — and a phone keyboard with autocapitalise off
 * produces "jo roberts". MoeGo's own records carry the same thing, so
 * the import brought thousands over. On 27/10/2026 that was 651 client
 * rows reading lowercase on invoices, SMS and the salon's own board.
 *
 * The rule is deliberately narrow: **only the first character, and only
 * when it is already lowercase.** Title-casing a name is the obvious
 * implementation and it is wrong — it turns "McEwan" into "Mcewan",
 * "O'Brien" into "O'brien" and "MacDonald" into "Macdonald", damaging
 * names that were typed correctly in order to fix ones that were not.
 * Breaking a right answer to fix a wrong one is a bad trade when the
 * wrong one is merely untidy.
 */

/**
 * Surnames that open with a particle, which this leaves alone.
 *
 * In Dutch and Afrikaans the lowercase particle is frequently the
 * person's own spelling — "de Beer", "van Wyk", "de Silva" — so
 * capitalising it changes how someone writes their name rather than
 * correcting a typo. The salon holds others capitalised ("De Looze",
 * "Van Veen"), which makes it a house-style question for a human.
 *
 * A lowercase first name on the same row is still fixed: holding back
 * the surname says nothing about "sjani".
 */
const PARTICLE = /^(van|von|de|del|della|da|di|du|le|la|den|der|ter|bin|al)[ '-]/i;

/** Uppercase the first character if it is lowercase. Nothing else. */
function capitaliseFirst(value: string): string {
  if (!/^[a-z]/.test(value)) return value;
  return value[0].toUpperCase() + value.slice(1);
}

/** A given name as it should be stored. */
export function properFirstName(value: string | null | undefined): string {
  return capitaliseFirst((value ?? "").trim());
}

/** A surname as it should be stored, particles left as typed. */
export function properLastName(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return PARTICLE.test(trimmed) ? trimmed : capitaliseFirst(trimmed);
}

/** Whether a surname is one this deliberately will not touch. */
export function isParticleSurname(value: string | null | undefined): boolean {
  return PARTICLE.test((value ?? "").trim());
}

/**
 * Both halves of a person's name, tidied.
 *
 * Returned as a new object rather than mutated in place so it can be
 * spread over an insert — `...properName(input)` — which is how every
 * call site uses it and the reason no insert can tidy one half and
 * forget the other.
 */
export function properName(input: {
  firstName?: string | null;
  lastName?: string | null;
}): { firstName: string; lastName: string } {
  return {
    firstName: properFirstName(input.firstName),
    lastName: properLastName(input.lastName),
  };
}
