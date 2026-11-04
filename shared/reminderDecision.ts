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

export type ReminderSkipReason = "opted_out" | "no_phone" | "already_sent" | "not_coming" | "already_here";

export type ReminderDecision =
  | { send: true }
  | { send: false; reason: ReminderSkipReason };

export const REMINDER_SKIP_LABEL: Record<ReminderSkipReason, string> = {
  opted_out: "client has opted out of texts",
  no_phone: "no phone number on file",
  already_sent: "this stage has already been sent",
  not_coming: "booking is cancelled or a no-show",
  already_here: "the dog has already arrived",
};

export function decideAppointmentReminder(input: {
  clientPhone?: string | null;
  /** Set when the client opted out, by STOP reply or by staff toggle. */
  smsOptedOutAt?: Date | string | null;
  /** The stage's own claim column — reminder_4d_sent_at and friends. */
  stageSentAt?: Date | string | null;
  /** appointments.status — confirmed | pending | cancelled | no_show. */
  status?: string | null;
  /** Where the dog is in the 12-state machine. */
  workflowState?: string | null;
}): ReminderDecision {
  /* First, and deliberately before the cheaper checks: being asked not
     to text somebody outranks every other reason we might have. */
  if (input.smsOptedOutAt) return { send: false, reason: "opted_out" };
  if (!input.clientPhone || String(input.clientPhone).trim() === "") {
    return { send: false, reason: "no_phone" };
  }
  if (input.stageSentAt) return { send: false, reason: "already_sent" };

  /*
   * NOT "status must be confirmed", which is what this used to be and
   * is backwards twice over.
   *
   * First, a reminder is FOR the people who have not confirmed —
   * requiring confirmation before sending one inverts the purpose.
   *
   * Second, the field does not mean what the filter assumed. Every
   * booking created in Groomigo is born "confirmed" before any client
   * has confirmed anything, and every MoeGo import lands as "pending".
   * So it records where a booking came from, not whether anyone agreed
   * to it — and 1,081 of 1,125 live upcoming bookings were pending,
   * including dogs standing in the salon marked READY FOR COLLECTION.
   * The reminder job was the only reader of that distinction in the
   * whole codebase.
   *
   * What actually disqualifies a booking is not coming.
   */
  const status = (input.status ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "no_show") return { send: false, reason: "not_coming" };

  /*
   * And a dog that has already arrived does not need telling it has an
   * appointment today. The morning-of stage runs at 8am and dogs start
   * arriving at 7:30, so without this it texts owners who are standing
   * at the counter. Blank means nothing recorded, which is treated as
   * not yet arrived.
   */
  const workflow = (input.workflowState ?? "").trim().toLowerCase();
  if (workflow === "cancelled" || workflow === "no_show") return { send: false, reason: "not_coming" };
  if (workflow !== "" && workflow !== "scheduled") return { send: false, reason: "already_here" };

  return { send: true };
}
