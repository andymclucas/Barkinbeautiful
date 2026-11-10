import { describePets } from "./pickupGroup";
import { EARLIEST_AUTOMATED_TEXT_HOUR, withinSendingHours } from "./sendingHours";
import { REPLY_PROMPT } from "./replyPrompt";
/**
 * The text a client gets when the salon books their dog in.
 *
 * Andy, 26/10/2026: "Setup a full workflow for automated SMS to clients
 * once an appointment is booked in Groomigo."
 *
 * This is the STAFF-booked case and only that case. An online booking
 * already gets its own text from onlineBookingNotify, and that one
 * deliberately says "we'll be in touch to confirm" because nothing is
 * held until a human approves it. This one says the appointment IS
 * booked, because a staff member just booked it. Sending both for the
 * same appointment would contradict itself, so `bookedOnline` excludes
 * a row from this path entirely.
 *
 * There is no undo on a sent SMS. Every rule below exists to make the
 * message either right or absent.
 */

export type BookingConfirmationInput = {
  clientFirstName: string;
  /** Every dog on the booking. One text names them all. */
  petNames: readonly string[];
  /** "Friday 30 October" — already in the salon's zone. */
  date: string;
  /** "9:00 am" — already in the salon's zone. */
  time: string;
  salonName?: string | null;
  /**
   * Whether to end with "Reply Y to confirm or N to cancel". Defaults to
   * true. See confirmationAsksToConfirm for when it should be false.
   */
  asksToConfirm?: boolean;
};

/**
 * Said instead of the Y/N question on a booking far enough out that the
 * four-day reminder will ask it. ASCII, and no longer than the question
 * it replaces, so the confirmation stays one segment.
 */
export const REMIND_LATER = "We'll remind you closer to the day.";

/**
 * Whether a confirmation should ask the client to confirm.
 *
 * Lauren, 11/11/2026, having rebooked a dog for January: "just want to
 * send a text to say we rebooked... not for them to confirm to it
 * today". Andy's rule from 10/11/2026 is one ask per booking, and the
 * four-day reminder already makes it (server/sms.ts) — so a booking that
 * reminder will reach should not ask now as well, two months early.
 *
 * More than five days out, the four-day reminder is still to come, so
 * the confirmation is a plain statement. Closer than that the reminder
 * may already have passed, and this text is the only chance to ask. The
 * extra day is margin: the reminder job works in calendar days, and a
 * booking 4 days and 20 hours out could miss it.
 */
export const ASK_ON_CONFIRMATION_WITHIN_HOURS = 5 * 24;

export function confirmationAsksToConfirm(
  scheduledStart: Date | string | number,
  now: Date | number = new Date(),
): boolean {
  const start = scheduledStart instanceof Date ? scheduledStart.getTime() : new Date(scheduledStart).getTime();
  const at = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(start)) return true;
  return start - at <= ASK_ON_CONFIRMATION_WITHIN_HOURS * 3_600_000;
}

const DEFAULT_SALON = "Barkin' Beautiful";

/** Automated texts land between these hours, on the salon's clock. */
/**
 * How far ahead a booking must be for a confirmation to mean anything.
 *
 * Two hours. Long enough that somebody booking a same-day slot in the
 * morning for the afternoon still gets told, short enough that typing
 * in a booking the client is about to arrive for does not text them.
 */
export const MINIMUM_LEAD_MINUTES = 120;

/**
 * Andy, 09/11/2026: "9am texts only. No earlier than that."
 *
 * Was 7. Re-exported rather than deleted because the booking screen and
 * the tests import it; the VALUE now comes from shared/sendingHours.ts,
 * which is the one place the floor is written down.
 */
export const QUIET_FROM_HOUR = EARLIEST_AUTOMATED_TEXT_HOUR;
export const QUIET_UNTIL_HOUR = 19;

/**
 * Deliberately shaped like buildAppointmentReminderSms: a client who gets
 * a confirmation now and a reminder in four days should read the same
 * date in the same words, from what is obviously the same salon.
 */
export function buildBookingConfirmationSms(input: BookingConfirmationInput): string {
  const salon = input.salonName?.trim() || DEFAULT_SALON;
  // "there" rather than an empty name: a client with no first name on
  // file otherwise reads "Hi !".
  const who = input.clientFirstName?.trim() || "there";
  // One booking, one text, however many dogs are on it. Lauren's rule
  // for the pickup message, 13/10/2026, and the same reasoning: two
  // dogs collected together is one trip and one message.
  const { subject } = describePets(input.petNames);
  /*
   * Always "'s", and always "is".
   *
   * The possessive used to follow describePets' verb — an apostrophe
   * alone for a plural — which gives "Albert and Eddy' grooming
   * appointment". That rule is for a plural noun ending in s ("the
   * dogs'"), not for a list of names; "Albert and Eddy's" is correct
   * however many dogs there are.
   *
   * And "is", because what is booked is the APPOINTMENT, which is one
   * whatever the dog count. "appointment ... are booked" was the same
   * mistake from the other end. The test that covered this asserted
   * `toContain("are booked for")` and so pinned it.
   */
  const ending = input.asksToConfirm === false ? REMIND_LATER : REPLY_PROMPT;
  return `Hi ${who}! ${subject}'s grooming appointment at ${salon} is booked for ${input.date} at ${input.time}. ${ending}`;
}

export type ConfirmationSkipReason =
  | "opted_out"
  | "not_confirmed"
  | "quiet_hours"
  | "already_sent"
  | "no_phone"
  | "imported"
  | "booked_online"
  | "in_the_past"
  | "already_arranged"
  | "too_soon"
  | "not_live"
  | "automation_off"
  | "policy_off"
  | "client_preference";

export type ConfirmationDecision =
  | { send: true }
  | { send: false; reason: ConfirmationSkipReason };

/**
 * Whether this appointment should produce a confirmation text.
 *
 * Ordered so the cheapest and most dangerous checks come first. Every
 * branch returns a named reason rather than a bare false, because when
 * somebody asks "why didn't Mrs Gerard get a text" the answer has to be
 * in the logs.
 */
export function decideBookingConfirmation(input: {
  automationEnabled: boolean;
  /** Whether the automated-SMS allow-list permits a confirmation. */
  policyAllows: boolean;
  confirmationSmsSentAt: Date | string | number | null | undefined;
  clientPhone: string | null | undefined;
  /** Set on anything that came from the MoeGo import. */
  moegoAppointmentId: string | number | null | undefined;
  bookedOnline: boolean | null | undefined;
  scheduledStart: Date | string | number;
  status: string;
  workflowState: string;
  /** Set when the client replied STOP. */
  smsOptedOutAt?: Date | string | null;
  /** Set when staff turned booking confirmations off in the client's Preferences. */
  confirmationSmsOffAt?: Date | string | null;
  /** Hour of day, 0-23, on the SALON's clock. Omit to skip the check. */
  localHour?: number;
  /**
   * Staff said this booking is already arranged elsewhere.
   *
   * The `moegoAppointmentId` guard below only catches rows the IMPORT
   * created. When somebody types a MoeGo booking in by hand there is
   * no id to catch, so Groomigo believes it is new and confirms it.
   * Lauren, 28/10/2026: "Kevin was in moego but not synced over to
   * Groomigo so put it in manually. It sent her a text." This is how
   * a person says otherwise, because nothing in the data can.
   */
  alreadyArranged?: boolean;
  now?: Date | number;
}): ConfirmationDecision {
  // The global gate. Checked here as well as at the call site so a new
  // caller cannot route around it by forgetting.
  if (!input.automationEnabled) return { send: false, reason: "automation_off" };
  /**
   * Decided HERE, before the caller claims confirmation_sms_sent_at.
   * Claiming it for a text the policy then blocks puts the column back
   * in the state the caller's own comment calls a past bug: saying
   * "sent" with nothing in sms_logs.
   */
  if (!input.policyAllows) return { send: false, reason: "policy_off" };

  // Idempotency. The column is the only thing standing between one text
  // and one text per retry, so it is the first real check.
  if (input.confirmationSmsSentAt) return { send: false, reason: "already_sent" };

  /**
   * The import guard, and the reason this function exists rather than an
   * inline `if`.
   *
   * The Monday MoeGo sync writes hundreds of appointments at a time. It
   * uses direct SQL today, which runs no application code and so cannot
   * reach this — but that is a property of how the sync happens to be
   * written, not a guarantee. One refactor that routes the import
   * through the app and the salon texts its entire forward book in a
   * single run, with no undo. So the row itself carries the evidence and
   * this path refuses it.
   */
  if (input.moegoAppointmentId !== null && input.moegoAppointmentId !== undefined && input.moegoAppointmentId !== "") {
    return { send: false, reason: "imported" };
  }

  // Online bookings already had their "we'll confirm" text, which this
  // message would contradict.
  if (input.bookedOnline) return { send: false, reason: "booked_online" };

  // Typed in to match a booking the client already has elsewhere.
  if (input.alreadyArranged) return { send: false, reason: "already_arranged" };

  if (input.status === "cancelled" || input.workflowState === "cancelled" || input.workflowState === "no_show") {
    return { send: false, reason: "not_live" };
  }

  // Only a CONFIRMED booking is "booked". A pending row is a request
  // nobody has approved, and telling that client it is booked is worse
  // than telling them nothing.
  if (input.status !== "confirmed") return { send: false, reason: "not_confirmed" };

  // A STOP reply sets this, and the mass-text path already honours it
  // (routers.ts). An automated text to somebody who opted out is the
  // one message that is never excusable.
  if (input.smsOptedOutAt) return { send: false, reason: "opted_out" };
  // Narrower than the STOP above: just this one text, for this client
  // (Andy, 11/11/2026, client Preferences).
  if (input.confirmationSmsOffAt) return { send: false, reason: "client_preference" };

  // Backfills and corrections touch past rows constantly — 368 August
  // appointments were advanced on 26/10/2026 alone. None of those people
  // want a text saying their dog is booked in.
  const start = new Date(input.scheduledStart).getTime();
  const now = typeof input.now === "number" ? input.now : (input.now ?? new Date()).getTime();
  if (!Number.isFinite(start) || start <= now) return { send: false, reason: "in_the_past" };

  /**
   * A confirmation is a reminder of something arranged earlier. Sent
   * minutes before the dog arrives it is neither — Kevin's went at
   * 7:46 for an eight o'clock booking, to a client already driving
   * over. Anything inside the window is back-filling, not booking.
   */
  if (start - now < MINIMUM_LEAD_MINUTES * 60_000) return { send: false, reason: "too_soon" };

  if (!input.clientPhone?.trim()) return { send: false, reason: "no_phone" };

  // Never land an automated message in the middle of the night. Staff
  // book during the day, but an owner catching up on the diary at 10pm
  // would otherwise text the client then. Silence is recoverable — a
  // staff member can send the manual template in the morning.
  if (input.localHour !== undefined && !withinSendingHours(input.localHour, QUIET_UNTIL_HOUR)) {
    return { send: false, reason: "quiet_hours" };
  }

  return { send: true };
}

export const CONFIRMATION_SKIP_LABEL: Record<ConfirmationSkipReason, string> = {
  already_arranged: "already booked elsewhere — staff asked not to text",
  too_soon: "starts too soon for a confirmation to be useful",
  opted_out: "the client has replied STOP",
  client_preference: "booking confirmations are turned off in this client's Preferences",
  not_confirmed: "the booking is not confirmed yet",
  // Said plainly, with the way out. Lauren read the old wording — "outside
  // the hours an automated text may land" — as being about the 10:30
  // SLOT, when the booking had been saved at 8:59 am (11/11/2026).
  quiet_hours: "it's before 9am or after 7pm, when automatic texts are held back. Use \"Text booking details\" on the appointment to send it yourself",
  already_sent: "a confirmation has already gone out",
  no_phone: "no phone number on the client",
  imported: "brought across from MoeGo",
  booked_online: "booked online, already texted",
  in_the_past: "the appointment is in the past",
  not_live: "cancelled or a no-show",
  automation_off: "SMS automation is off",
  policy_off: "automated texts to clients are switched off",
};
