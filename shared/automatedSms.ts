/**
 * Which automated texts may reach a client.
 *
 * Andy, 28/10/2026: "No automated text messages to go to clients other
 * than when dogs are fully groomed and ready to be picked up."
 *
 * One list, and it has one entry. Everything the salon sends without a
 * person pressing send — booking confirmations, appointment reminders,
 * the Pet Tracker check-in text, waitlist offers, the missed-call
 * auto-reply, online booking acknowledgements — is off until that list
 * says otherwise.
 *
 * **Staff-typed messages are untouched.** A person choosing to text a
 * client is not automation, and nothing here stops them.
 *
 * The rule lives in one function rather than at each send site because
 * there are a dozen of those and the next one has not been written
 * yet. `sendSms` makes every caller declare which kind it is, so a new
 * automated message cannot reach a client by its author not knowing
 * this rule exists.
 */

/** Every automated message the salon has. */
export type AutomatedSmsType =
  | "ready_pickup"
  | "confirmation"
  | "reminder"
  | "tracker"
  | "waitlist_offer"
  | "waitlist_missed"
  | "missed_call"
  | "online_booking_request"
  | "photo_link"
  | "payment_failed";

/**
 * The only automated text a client may receive.
 *
 * A Set of one, deliberately: adding the next one is a decision
 * somebody makes here, in front of this comment, rather than by
 * writing a new send somewhere else.
 */
export const ALLOWED_AUTOMATED_SMS: ReadonlySet<AutomatedSmsType> = new Set<AutomatedSmsType>([
  "ready_pickup",
]);

export function automatedSmsAllowed(type: AutomatedSmsType): boolean {
  return ALLOWED_AUTOMATED_SMS.has(type);
}

/** Why a message was not sent, for the log a human reads. */
export function describeBlockedSms(type: AutomatedSmsType): string {
  return `${type} is an automated message, and only ${Array.from(ALLOWED_AUTOMATED_SMS).join(", ")} may go to clients`;
}
