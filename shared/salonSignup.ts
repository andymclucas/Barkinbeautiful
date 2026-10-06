/**
 * Turning what a salon types into a tenant we can actually create.
 *
 * The slug is the part that bites. It becomes a hostname —
 * <slug>.groomigo.com — so it has to survive DNS, be unique forever, and
 * not collide with the platform's own subdomains. A salon called
 * "Paws & Whiskers" should get "paws-and-whiskers" without being asked
 * to think about any of that.
 *
 * Pure so every edge can be tested without creating a salon: the first
 * one of these that goes wrong is somebody's business name.
 */

import { RESERVED_TENANT_SLUGS, isUsableSlug } from "./hostTenant";

export const MIN_PASSWORD_LENGTH = 12;

/**
 * A salon name to a slug.
 *
 * "&" becomes "and" rather than vanishing, because "Paws & Whiskers"
 * collapsing to "paws-whiskers" reads like a typo of their own name.
 * Accents are folded rather than dropped so "Café Canine" is
 * "cafe-canine" and not "caf-canine".
 */
export function slugifySalonName(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export type SlugProblem =
  | "empty"
  | "too_short"
  | "bad_characters"
  | "reserved"
  | "taken";

export const SLUG_PROBLEM_MESSAGES: Record<SlugProblem, string> = {
  empty: "Your salon needs a name.",
  too_short: "That is a bit short — two characters or more.",
  bad_characters: "Letters, numbers and hyphens only, starting with a letter or number.",
  reserved: "That address is kept for Groomigo itself. Try another.",
  taken: "Another salon already has that address.",
};

/**
 * Is this slug usable, before we ask the database?
 *
 * `taken` is deliberately NOT decided here — only a database knows that.
 * Keeping the two apart means this stays pure and the caller cannot
 * forget the uniqueness check by accident.
 */
export function checkSlugShape(slug: string): SlugProblem | null {
  if (!slug) return "empty";
  if (slug.length < 2) return "too_short";
  if (RESERVED_TENANT_SLUGS.has(slug)) return "reserved";
  if (!isUsableSlug(slug)) return "bad_characters";
  return null;
}

/**
 * The next free variant of a slug, given what is already taken.
 *
 * Counts rather than appending a random suffix: a second "Pawfection"
 * should be "pawfection-2", which a human can read out over the phone.
 */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base) && !RESERVED_TENANT_SLUGS.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base.slice(0, 60)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 55)}-${Date.now().toString(36)}`;
}

export type PasswordProblem = "too_short" | "too_common" | null;

/**
 * Just long enough, and not one of the handful everybody picks.
 *
 * No symbol-and-digit rules: they push people towards Passw0rd! and a
 * sticky note. Length is what actually helps.
 */
/**
 * Checked on the WORD underneath, not the whole string.
 *
 * Listing literals is a losing game: "Password1234" is twelve characters
 * and would sail past a list holding "password123". So the digits and
 * punctuation people pad with are stripped first, and what remains is
 * compared — which catches Password1, Password1234 and P@ssword2026
 * from one entry.
 */
const WEAK_BASES = new Set([
  "password", "passwords", "letmein", "welcome", "qwerty", "qwertyuiop",
  "iloveyou", "admin", "groomigo", "grooming", "dogs", "doggy", "puppy",
  "salon", "changeme", "secret", "monkey", "abc", "test",
]);

export function checkPassword(password: string): PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";

  // Two different habits, needing two different passes.
  //
  // Digits are usually PADDING — "Password1234" is the word with a run
  // bolted on, so stripping them leaves "password".
  //
  // Symbols are usually SUBSTITUTIONS — the @ in "P@ssword2026" stands
  // in for a letter, so it has to be folded back before stripping or
  // what remains is "pssword" and the check walks straight past.
  //
  // Folding digits as well would be worse than useless: it turns the
  // padding into letters and "password1234" becomes "passwordiea".
  const lower = password.toLowerCase();
  const candidates = [
    lower.replace(/[^a-z]/g, ""),
    lower.replace(/@/g, "a").replace(/\$/g, "s").replace(/[!|]/g, "i").replace(/[^a-z]/g, ""),
  ];
  if (candidates.some((c) => WEAK_BASES.has(c))) return "too_common";
  // Twelve of the same character is long and worthless.
  if (/^(.)\1*$/.test(password)) return "too_common";
  // Nothing but digits, however many.
  if (/^\d+$/.test(password)) return "too_common";

  return null;
}

export const PASSWORD_PROBLEM_MESSAGES: Record<Exclude<PasswordProblem, null>, string> = {
  too_short: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  too_common: "That is one of the first passwords anyone would guess.",
};

/** Split a typed full name into the two columns staff records want. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
