/**
 * Proving an email address before a salon exists.
 *
 * A six-digit code rather than a link, because signup is one page: a
 * link takes somebody out to their mail client and back to a form that
 * has forgotten their salon name and password. A code they can read and
 * type keeps everything they have entered where it is.
 *
 * Six digits is a million possibilities, which is nothing on its own —
 * the attempt limit is what makes it safe, not the length. Both rules
 * live here so neither can be quietly loosened without the tests saying
 * so.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 15;
/** Five wrong guesses spends the code. See the 0088 migration. */
export const MAX_ATTEMPTS = 5;

export type CodeState =
  | { usable: true }
  | { usable: false; reason: "expired" | "locked" | "already_used" | "none" };

export const CODE_STATE_MESSAGES: Record<Exclude<CodeState, { usable: true }>["reason"], string> = {
  expired: `That code has expired — they last ${CODE_TTL_MINUTES} minutes. Ask for another.`,
  locked: "Too many wrong tries. Ask for a new code.",
  already_used: "That code has already been used.",
  none: "Ask for a code first.",
};

export type StoredCode = {
  expiresAt: Date | string;
  attempts: number;
  verifiedAt?: Date | string | null;
};

/**
 * Whether a stored code can still be tried.
 *
 * Checked BEFORE comparing the digits, so a locked or expired row costs
 * no bcrypt work and cannot be used as a timing oracle.
 */
export function codeState(stored: StoredCode | null | undefined, now: Date = new Date()): CodeState {
  if (!stored) return { usable: false, reason: "none" };
  if (stored.verifiedAt) return { usable: false, reason: "already_used" };
  if (stored.attempts >= MAX_ATTEMPTS) return { usable: false, reason: "locked" };
  const expires = stored.expiresAt instanceof Date ? stored.expiresAt : new Date(stored.expiresAt);
  if (!(expires.getTime() > now.getTime())) return { usable: false, reason: "expired" };
  return { usable: true };
}

/** When a code issued now should stop working. */
export function codeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + CODE_TTL_MINUTES * 60 * 1000);
}

/**
 * What the person typed, as digits.
 *
 * People paste codes with spaces in, and a mail client sometimes puts a
 * hyphen through the middle. Refusing those teaches nothing.
 */
export function normaliseCode(input: string): string {
  return (input ?? "").replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteCode(input: string): boolean {
  return normaliseCode(input).length === CODE_LENGTH;
}

/**
 * Whether a verified row may still be spent on creating a salon.
 *
 * Deliberately shorter-lived than you might expect. A proven address is
 * a key to making a tenant, and one left lying around for a day is worth
 * stealing; thirty minutes is long enough to finish typing a password.
 */
export const VERIFIED_WINDOW_MINUTES = 30;

export function verificationStillGood(verifiedAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!verifiedAt) return false;
  const at = verifiedAt instanceof Date ? verifiedAt : new Date(verifiedAt);
  if (Number.isNaN(at.getTime())) return false;
  return now.getTime() - at.getTime() < VERIFIED_WINDOW_MINUTES * 60 * 1000;
}

/** The body of the email. Plain, because it is read in two seconds. */
export function buildVerificationEmail(code: string): { subject: string; html: string } {
  return {
    subject: `${code} is your Groomigo code`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; color: #1A1726">
        <p style="font-size: 15px; margin: 0 0 18px">Here is the code to start your salon on Groomigo:</p>
        <p style="font-size: 34px; font-weight: 700; letter-spacing: 7px; margin: 0 0 18px">${code}</p>
        <p style="font-size: 14px; color: #6B6880; margin: 0 0 6px">It lasts ${CODE_TTL_MINUTES} minutes.</p>
        <p style="font-size: 14px; color: #6B6880; margin: 0">If you did not ask for this, nothing has been created and you can ignore it.</p>
      </div>
    `.trim(),
  };
}
