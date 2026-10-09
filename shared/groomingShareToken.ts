/**
 * The token in a grooming card's share link.
 *
 * This token IS the authorisation: anyone holding the link reads the card,
 * with no sign-in, exactly like MoeGo's. So it has to be unguessable rather
 * than merely unique — a sequential id or a short hash would let anyone walk
 * the salon's reports by editing the URL.
 *
 * 24 characters of a 32-symbol alphabet is 120 bits, which is not getting
 * guessed. Crockford base32 minus the ambiguous letters, so a token read down
 * the phone cannot turn 0 into O or 1 into l.
 *
 * Not a UUID: a UUID is 36 characters with hyphens and wraps badly in an SMS.
 */

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // no i, l, o, u
export const GROOMING_SHARE_TOKEN_LENGTH = 24;

/**
 * Builds a token from a byte source.
 *
 * The randomness is injected so this stays pure and testable; callers pass
 * `crypto.getRandomValues` (browser) or `crypto.randomFillSync` (node).
 * Rejection-free: 256 is a whole multiple of 32, so taking the low 5 bits of
 * each byte is uniform.
 */
export function buildGroomingShareToken(randomBytes: Uint8Array): string {
  if (randomBytes.length < GROOMING_SHARE_TOKEN_LENGTH) {
    throw new Error(`Need at least ${GROOMING_SHARE_TOKEN_LENGTH} bytes for a share token`);
  }
  let token = "";
  for (let i = 0; i < GROOMING_SHARE_TOKEN_LENGTH; i++) {
    token += ALPHABET[randomBytes[i]! & 31];
  }
  return token;
}

/**
 * Whether a string could be one of our tokens.
 *
 * Used to reject nonsense before it reaches the database: a public route is
 * hit by crawlers and scanners, and there is no reason to run a query for
 * "favicon.ico".
 */
export function isGroomingShareToken(value: string | null | undefined): boolean {
  if (!value || value.length !== GROOMING_SHARE_TOKEN_LENGTH) return false;
  for (const character of value) {
    if (!ALPHABET.includes(character)) return false;
  }
  return true;
}

/** The link a client opens, built from the app's own base URL. */
export function groomingShareUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/card/${token}`;
}
