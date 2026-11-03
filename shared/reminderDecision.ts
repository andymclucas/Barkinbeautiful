/**
 * Whether an appointment reminder may go to this client.
 *
 * The 3-stage reminder job (4 days out, 2 days out, morning of) has
 * never sent — `reminder` is not on the automated allow-list, so
 * `sendSms` refuses it. Andy asked on 04/11/2026 to switch the
 * confirmation and reminder workflow on, and auditing it first turned
 * up the reason not to yet: the job's query filters on the date
 * window, on `status = 'confirmed'` and on the stage's own claim
 * column, and NEVER looks at `clients.sms_opted_out_at`.
 *
 * Chris Roulstone opted out on 03/11/2026, through the toggle added
 * for exactly this, after asking not to get reminder texts on his
 * recurring booking. Switching reminders on without this would have
 * texted him three times per booking — the first thing the opt-out
 * exists to prevent, and the hardest kind of mistake to apologise for.
 *
 * `decideBookingConfirmation` in shared/bookingConfirmationSms.ts is
 * the same shape for the booking confirmation, down to the wording of
 * its opt-out comment: an automated text to somebody who opted out is
 * the one message that is never excusable.
 *
 * The job ALSO excludes opted-out clients in SQL, so they never load.
 * This is the second line: the SQL can be edited by somebody adding an
 * unrelated filter, and a rule with its own tests cannot be edited by
 * accident.
 */

export type ReminderSkipReason = "opted_out" | "no_phone" | "already_sent";

export type ReminderDecision =
  | { send: true }
  | { send: false; reason: ReminderSkipReason };

export const REMINDER_SKIP_LABEL: Record<ReminderSkipReason, string> = {
  opted_out: "client has opted out of texts",
  no_phone: "no phone number on file",
  already_sent: "this stage has already been sent",
};

export function decideAppointmentReminder(input: {
  clientPhone?: string | null;
  /** Set when the client opted out, by STOP reply or by staff toggle. */
  smsOptedOutAt?: Date | string | null;
  /** The stage's own claim column — reminder_4d_sent_at and friends. */
  stageSentAt?: Date | string | null;
}): ReminderDecision {
  /* First, and deliberately before the cheaper checks: being asked not
     to text somebody outranks every other reason we might have. */
  if (input.smsOptedOutAt) return { send: false, reason: "opted_out" };
  if (!input.clientPhone || String(input.clientPhone).trim() === "") {
    return { send: false, reason: "no_phone" };
  }
  if (input.stageSentAt) return { send: false, reason: "already_sent" };
  return { send: true };
}
