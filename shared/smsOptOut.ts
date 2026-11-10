/**
 * Turning a client's automated texts off, and back on.
 *
 * Chris Roulstone, via Lauren, 03/11/2026: "he asked if he is on a
 * reoccurring booking can he NOT get reminder texts. How do I turn off
 * any texts to him."
 *
 * `clients.sms_opted_out_at` already existed and was already honoured —
 * mass-text audiences exclude it and `decideBookingConfirmation` refuses
 * on it. What was missing is that the ONLY thing which could set it was
 * the client replying STOP, so all 10,113 clients had it unset and a
 * client who asked a person instead could not be opted out at all.
 *
 * Pure, because the one rule worth getting right here is about a
 * timestamp rather than about a database.
 */

export type SmsOptOutChange = { smsOptedOutAt: Date | null } | Record<string, never>;

/**
 * What to write, given what staff asked for and what is already stored.
 *
 * Three cases, and the middle one is the whole reason this is a function:
 *
 *  - asked to opt out, not currently opted out  -> stamp now
 *  - asked to opt out, ALREADY opted out        -> change nothing
 *  - asked to opt back in                       -> clear it
 *
 * The middle case matters because this field rides along on the client's
 * "Edit details" form. Somebody fixing a phone number on a client who
 * opted out in October must not silently move the date they asked to be
 * left alone to today — that date is the answer to "were they opted out
 * when we sent this?", and it is the only record of it.
 */
/**
 * The same rule for any "turned off at" column: off stamps it once (and
 * never restamps, so WHEN stays true), on clears it, undefined leaves it.
 * Used by the per-client confirmation and cancellation switches.
 */
export function offSwitchUpdate(input: {
  requestedOff: boolean | undefined;
  current: Date | string | null | undefined;
  now?: Date;
}): Date | null | undefined {
  if (input.requestedOff === undefined) return undefined;
  if (!input.requestedOff) return null;
  return input.current ? undefined : input.now ?? new Date();
}

export function smsOptOutUpdate(input: {
  /** What the form sent. Undefined means the form did not touch it. */
  requested: boolean | undefined;
  /** What is stored now. */
  current: Date | string | null | undefined;
  /** Injectable so the stamp is assertable. */
  now?: Date;
}): SmsOptOutChange {
  if (input.requested === undefined) return {};
  if (!input.requested) return { smsOptedOutAt: null };
  return input.current ? {} : { smsOptedOutAt: input.now ?? new Date() };
}
