/**
 * Is this actually a number Twilio can send from?
 *
 * On 06/10/2026 outbound SMS stopped for the whole salon. tenants.twilio_number
 * held the literal string "+61..." — a placeholder somebody typed into the
 * field — and the multi-tenancy change had just made outbound SMS prefer that
 * column over TWILIO_FROM_NUMBER. Twilio rejected every message with "Invalid
 * From Number (caller ID)". Fourteen failed before anyone noticed, including a
 * missed-call auto-reply and a groomer's reply to a client.
 *
 * Nothing checked the value because nothing had needed to: the env var had
 * always been right. The moment a salon could type its own number in, it
 * could type in something that was not one.
 *
 * So a sender is validated before it is used, and an unusable one is ignored
 * in favour of the next candidate rather than handed to Twilio. Being too
 * strict here costs nothing — the fallback is the shared number that already
 * works — while being too lax costs the salon every text it sends.
 */

/**
 * E.164: a plus, a country code that cannot start with zero, and 7 to 14
 * more digits. Deliberately permissive about WHICH country; this is about
 * catching "+61...", "TBC", "" and "0438 603 451", not about policing
 * dialling plans.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Only a real number counts.
 *
 * Twilio also accepts alphanumeric sender IDs, and an earlier version of
 * this allowed them — which let "TBC" and "n/a" through, because those are
 * syntactically valid sender IDs. The salon sends from an Australian
 * mobile and never from a name, so permitting them bought nothing and
 * reopened the exact hole this exists to close. An alphanumeric sender is
 * a deliberate feature for another day, with its own validation.
 */
export function isUsableSenderNumber(value: string | null | undefined): value is string {
  if (value === null || value === undefined) return false;
  return E164.test(value.trim());
}

/**
 * The first candidate that could actually send, or null.
 *
 * Takes them best-first — the salon's own number, then the shared one — and
 * skips anything unusable rather than stopping at it. Stopping at the first
 * non-empty value is precisely what broke: the salon's column held junk and
 * the working shared number was never reached.
 */
export function pickSenderNumber(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (isUsableSenderNumber(candidate)) return candidate!.trim();
  }
  return null;
}

/** Said once, where somebody will see it, when nothing can send. */
export const NO_SENDER_MESSAGE =
  "No usable SMS sender number is configured. Set the salon's Twilio number in Settings, or TWILIO_FROM_NUMBER in the environment.";
