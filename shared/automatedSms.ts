/**
 * Which automated texts may reach a client.
 *
 * Andy, 28/10/2026: "No automated text messages to go to clients other
 * than when dogs are fully groomed and ready to be picked up."
 *
 * One list. Everything the salon sends without a person pressing send
 * — booking confirmations, appointment reminders, the Pet Tracker
 * check-in text, waitlist offers, online booking acknowledgements — is
 * off until that list says otherwise.
 *
 * Andy, 28/10/2026, asked afterwards for the missed-call auto-reply to
 * stay on, so the list has two entries rather than one.
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
  | "cancellation"
  | "reschedule"
  | "tracker"
  | "waitlist_offer"
  | "waitlist_missed"
  | "missed_call"
  | "online_booking_request"
  | "photo_link"
  | "payment_failed";

/**
 * The automated texts a client may receive. Nothing else.
 *
 * Short deliberately: adding the next one is a decision somebody makes
 * here, in front of this comment, rather than by writing a new send
 * somewhere else. Each entry says who asked and when.
 */
export const ALLOWED_AUTOMATED_SMS: ReadonlySet<AutomatedSmsType> = new Set<AutomatedSmsType>([
  // Andy, 28/10/2026: "...other than when dogs are fully groomed and
  // ready to be picked up." In practice a person presses Send on this
  // one, so it has no automated caller today; it is allowed so that
  // automating it later needs no change here.
  "ready_pickup",

  // Andy, 28/10/2026: "Keep the missed call auto reply on." Asked for
  // explicitly after the rule above, once the volume was known: 118
  // texts in the preceding 30 days, about four a day, and in one
  // sample 28 of 40 recipients were existing clients. It answers
  // somebody who rang the salon rather than starting a conversation
  // with them, and the text promises a call back.
  //
  // Guarded separately against repeats: missed_call_auto_texts is
  // UNIQUE on the caller's number, so a given number is texted once
  // ever. See shared/missedCallAutoText.ts.
  "missed_call",

  // Andy, 04/11/2026: "Turn the confirmation and reminder texts on."
  //
  // This reverses his instruction of 28/10/2026 — "No automated text
  // messages to go to clients other than when dogs are fully groomed
  // and ready to be picked up" — and he was told so, twice, before
  // asking again. Left written down because the 28/10 rule is quoted
  // all over this codebase and the next person needs to know it was
  // lifted deliberately rather than forgotten.
  //
  // Confirmation fires on booking creation. It refuses a MoeGo import
  // by the row's own moego_appointment_id, which is what stops a sync
  // of 276 bookings texting 276 clients in one run — see
  // shared/bookingConfirmationSms.ts, which has the full reasoning.
  "confirmation",

  // The 3-stage reminder: 4 days out, 2 days out, morning of. Asked
  // for in the same message.
  //
  // It has NEVER run in production. All three claim columns —
  // reminder_4d_sent_at, reminder_2d_sent_at, reminder_morning_sent_at
  // — are NULL on every one of the salon's 15,000 appointments, so the
  // first real run is the first time this path sends anything to
  // anybody. It is tested, the guards are tested, and that is still
  // not the same as having run.
  "reminder",

  // Andy, 04/11/2026: "Send auto cancellation and reschedule texts
  // also." Asked for in the same session as the two above, after the
  // confirmation had been seen working on his own dog.
  //
  // Both are a bigger risk than the confirmation, and in a way the
  // allow-list cannot catch. The confirmation refuses any row carrying
  // a moego_appointment_id, which is what stops a sync of 276 bookings
  // texting 276 clients. These two CANNOT wear that guard — 450 of the
  // 456 upcoming bookings are MoeGo imports, so refusing them would
  // switch the feature off for almost every client Lauren cancels or
  // moves.
  //
  // What protects them instead is where they fire from: the staff
  // actions in updateWorkflowState and the reschedule mutation. The
  // MoeGo sync writes direct SQL and runs no application code.
  // **Route the sync through the app and this becomes a megaphone.**
  // shared/appointmentChangeSms.ts says the same at more length.
  "cancellation",

  // Only a change of DAY sends this one. Staff drag bookings around the
  // board constantly — fifteen minutes here, a groomer swapped there —
  // and texting on every save would be worse than not having it. Andy
  // chose the day rule on 04/11/2026 when asked.
  "reschedule",
]);

export function automatedSmsAllowed(type: AutomatedSmsType): boolean {
  return ALLOWED_AUTOMATED_SMS.has(type);
}

/** Why a message was not sent, for the log a human reads. */
export function describeBlockedSms(type: AutomatedSmsType): string {
  return `${type} is an automated message, and only ${Array.from(ALLOWED_AUTOMATED_SMS).join(", ")} may go to clients`;
}

/**
 * Will an automated message of this type actually be sent?
 *
 * `sendSms` is the enforcement point and needs no help from callers.
 * This exists for the two callers that **spend something** before they
 * send — the missed-call ledger row, which is a once-ever claim keyed
 * UNIQUE on the caller's number, and the booking confirmation's
 * `confirmation_sms_sent_at` claim. Both must ask before they write,
 * or they record a send that never happened.
 *
 * `env` is passed in rather than read, so this stays pure and testable
 * — same shape as shared/trackerSmsGate.ts.
 */
export function automatedSmsPermitted(
  type: AutomatedSmsType,
  env: Record<string, string | undefined>,
): boolean {
  return automatedSmsAllowed(type) && env.SMS_AUTOMATION_ENABLED === "true";
}
