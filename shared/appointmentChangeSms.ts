/**
 * Telling a client when their booking is cancelled or moved.
 *
 * Andy, 04/11/2026: "Send auto cancellation and reschedule texts also."
 *
 * Both follow the booking confirmation's shape — a pure decision with a
 * named reason for every refusal, so "why didn't Mrs Gerard get a text"
 * has an answer in the logs — but they differ from it in three ways that
 * matter, and from each other in one.
 *
 * ## 1. No MoeGo import guard, and why that is a loaded gun
 *
 * The confirmation refuses any row carrying a `moego_appointment_id`,
 * because the Monday sync writes hundreds at a time. These two cannot
 * afford that rule: 450 of 456 upcoming bookings ARE MoeGo imports, so
 * refusing them would switch the feature off for almost every client
 * Lauren actually cancels or moves.
 *
 * That removes the seatbelt the confirmation wears. The protection here
 * is instead that both fire from `updateWorkflowState` and the
 * reschedule mutation — the paths a PERSON uses — and the MoeGo sync
 * writes direct SQL, which runs no application code.
 *
 * **If the sync is ever routed through the application, it must not go
 * through these paths.** One run would text the salon's entire forward
 * book about cancellations the clients made themselves, with no undo.
 *
 * ## 2. A cancellation has no minimum lead time
 *
 * The confirmation refuses anything inside MINIMUM_LEAD_MINUTES,
 * because a "you're booked" text minutes before arrival is absurd. A
 * cancellation is the opposite: the nearer the appointment, the more
 * urgently the client needs it. The only time guard is that the
 * appointment has not already happened.
 *
 * ## 3. Quiet hours yield to urgency
 *
 * The confirmation is silent overnight and that is safe, because a
 * staff member can send it by hand in the morning. Dropping a
 * cancellation is not safe — the client drives in. So quiet hours apply
 * only when there is still a working day in which to tell them: an
 * appointment more than 24 hours out waits, one inside 24 hours goes
 * now, whatever the hour.
 *
 * ## And the one difference between the two
 *
 * A cancellation fires on an EVENT. A reschedule fires on a STATE
 * CHANGE, and staff drag bookings around the board constantly — a dog
 * moved fifteen minutes, a groomer swapped, the day tidied up. Andy's
 * rule: only a change of DAY is worth a text. Everything else is the
 * salon organising itself and the client does not need to know.
 */

import { brisbaneDateKey } from "./localDateTime";
import { describePets } from "./pickupGroup";

const DEFAULT_SALON = "Barkin' Beautiful";
/** Nothing automated lands between these hours on the salon's clock. */
const QUIET_FROM_HOUR = 8;
const QUIET_UNTIL_HOUR = 20;
/** Inside this, a reschedule overrides quiet hours. */
const URGENT_WITHIN_MS = 24 * 60 * 60 * 1000;

/**
 * How long one "the booking moved" text speaks for the whole family.
 *
 * The calendar moves a family ONE ROW AT A TIME and the notice runs
 * after each update, so a three-dog booking produced three texts — the
 * siblings were still at the old start, outside the group, and never
 * claimed. Found by a review that executed the real code; the comment
 * in the sender claimed the opposite.
 *
 * Fifteen minutes comfortably covers a dialog save or a run of drags,
 * and is short enough that a genuine second move an hour later still
 * reaches the client.
 */
export const MOVE_QUIET_WINDOW_MS = 15 * 60 * 1000;

export type ChangeSkipReason =
  | "automation_off"
  | "policy_off"
  | "already_sent"
  | "opted_out"
  | "no_phone"
  | "in_the_past"
  | "quiet_hours"
  | "not_cancelled"
  | "same_day"
  | "burst_guard";

export type ChangeDecision =
  | { send: true }
  | { send: false; reason: ChangeSkipReason };

export const CHANGE_SKIP_LABEL: Record<ChangeSkipReason, string> = {
  automation_off: "automated SMS is switched off",
  policy_off: "this message type is not on the allow-list",
  already_sent: "the client has already been told",
  opted_out: "the client replied STOP",
  no_phone: "no phone number on file",
  in_the_past: "the appointment has already happened",
  quiet_hours: "outside the hours an automated text may land",
  not_cancelled: "the booking is not cancelled",
  same_day: "the booking did not move to a different day",
  burst_guard: "too many of these went out at once — stopped as a safety measure",
};

/**
 * The circuit breaker, and why these two need one.
 *
 * The booking confirmation is protected from a bulk run by the row's
 * own moego_appointment_id. These cannot be — see the header — so the
 * stated protection is that they only fire from staff paths. That is a
 * fact about today's code, not a guarantee: `scripts/` already contains
 * a script that calls `appRouter.createCaller` in a loop
 * (close-salon-xmas-2026.ts, which happens only to write blockouts).
 * One bulk script that cancels through `updateWorkflowState` and the
 * salon texts hundreds of clients with no undo.
 *
 * So the number itself is the last guard. A person cancelling dogs by
 * hand does not reach twelve in a quarter of an hour; a loop reaches it
 * in seconds. Crossing the line stops the send and says so loudly,
 * which is recoverable — staff can text by hand, and `sms_logs` shows
 * what did go. The alternative is not recoverable.
 */
export const BURST_LIMIT = 12;
export const BURST_WINDOW_MINUTES = 15;

export function burstExceeded(recentSendCount: number | undefined, limit = BURST_LIMIT): boolean {
  return typeof recentSendCount === "number" && recentSendCount >= limit;
}

function ms(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

type CommonInput = {
  automationEnabled: boolean;
  policyAllows: boolean;
  clientPhone: string | null | undefined;
  smsOptedOutAt?: Date | string | null;
  scheduledStart: Date | string | number;
  /** Hour of day, 0-23, on the SALON's clock. Omit to skip the check. */
  localHour?: number;
  /**
   * How many of this message type already went out in the last
   * BURST_WINDOW_MINUTES. Omit to skip the breaker.
   */
  recentSendCount?: number;
  now?: Date | number;
};

/** The gates both messages share, in the order they are cheapest to fail. */
function commonRefusal(input: CommonInput, alreadySent: boolean): ChangeDecision | null {
  if (!input.automationEnabled) return { send: false, reason: "automation_off" };
  /*
   * Decided before the caller claims its column. Claiming for a text the
   * policy then blocks leaves the row saying "sent" with nothing in
   * sms_logs — the bug the confirmation's own comment warns about.
   */
  if (!input.policyAllows) return { send: false, reason: "policy_off" };
  if (alreadySent) return { send: false, reason: "already_sent" };
  // Checked before the claim, like everything else that can refuse.
  if (burstExceeded(input.recentSendCount)) return { send: false, reason: "burst_guard" };
  if (input.smsOptedOutAt) return { send: false, reason: "opted_out" };
  if (!input.clientPhone?.trim()) return { send: false, reason: "no_phone" };
  return null;
}

export function decideCancellationSms(input: CommonInput & {
  cancellationSmsSentAt: Date | string | number | null | undefined;
  status: string;
  workflowState: string;
}): ChangeDecision {
  const refusal = commonRefusal(input, Boolean(input.cancellationSmsSentAt));
  if (refusal) return refusal;

  if (input.status !== "cancelled" && input.workflowState !== "cancelled") {
    return { send: false, reason: "not_cancelled" };
  }

  /*
   * Tidying history must not text anybody. Appointments are cancelled
   * retrospectively all the time — 368 August rows were touched in a
   * single afternoon on 26/10/2026.
   */
  const start = ms(input.scheduledStart);
  const now = typeof input.now === "number" ? input.now : (input.now ?? new Date()).getTime();
  if (!Number.isFinite(start) || start <= now) return { send: false, reason: "in_the_past" };

  /*
   * No quiet hours on a cancellation, and this used to have them.
   *
   * The comment said it would "wait overnight" and a test was titled
   * that way, but nothing waits: there is no retry queue and no
   * scheduler, so refusing here simply DROPS the message and the client
   * drives in. A review that ran the real code found a Sunday-9pm
   * cancellation of a Tuesday booking sending nothing, ever.
   *
   * Staff do not work at 2am, so the realistic window is an owner
   * catching up on the diary at 9 or 10pm. A text then saying tomorrow
   * is off is worth having. Silence is not recoverable here the way it
   * is for a confirmation, which somebody can resend by hand.
   */
  return { send: true };
}

export function decideRescheduleSms(input: CommonInput & {
  /** Where the booking was before this save. */
  previousStart: Date | string | number;
  /** The day the client was last told about, as YYYY-MM-DD, or null. */
  rescheduleSmsSentFor: string | Date | null | undefined;
  /**
   * When this CLIENT was last told about this same day, on any of their
   * bookings. Null when never. See MOVE_QUIET_WINDOW_MS.
   */
  clientToldOfDayAt?: Date | string | number | null;
  status: string;
  workflowState: string;
}): ChangeDecision {
  const newKey = brisbaneDateKey(new Date(ms(input.scheduledStart)));
  const toldKey = input.rescheduleSmsSentFor
    ? (typeof input.rescheduleSmsSentFor === "string"
        ? input.rescheduleSmsSentFor.slice(0, 10)
        : brisbaneDateKey(input.rescheduleSmsSentFor))
    : null;

  /*
   * Already told about this DAY, recently. Checked across the client's
   * whole diary rather than this booking's rows, because the siblings
   * that still need moving are not in this booking's group yet — that
   * is the entire bug this closes.
   */
  const toldRecently = input.clientToldOfDayAt !== undefined
    && input.clientToldOfDayAt !== null
    && (typeof input.now === "number" ? input.now : (input.now ?? new Date()).getTime())
       - ms(input.clientToldOfDayAt) <= MOVE_QUIET_WINDOW_MS;
  const refusal = commonRefusal(input, (toldKey !== null && toldKey === newKey) || toldRecently);
  if (refusal) return refusal;

  // A cancelled booking that moves is bookkeeping, and the cancellation
  // text already told them the truth.
  if (input.status === "cancelled" || input.workflowState === "cancelled"
      || input.workflowState === "no_show") {
    return { send: false, reason: "not_cancelled" };
  }

  /*
   * Andy's rule, and the whole point of this one. Staff shuffle the
   * board all day: a dog moved fifteen minutes, a groomer swapped, the
   * morning tidied up. Only a change of DAY reaches the client.
   *
   * ## This has a known cost, and it was chosen with the cost known
   *
   * It stays silent even when the client has ALREADY been told a time
   * for that day. A booking announced for the morning and then tidied
   * to the afternoon leaves them holding the morning.
   *
   * That is not hypothetical. It happened to a real client within two
   * minutes of this going live on 04/11/2026: a booking was moved to a
   * new day and texted, then moved three hours later the same day in
   * silence, and the client was left expecting the first time.
   *
   * Andy was shown that case and the alternative — text again when the
   * time moves on a day already announced — and chose to KEEP THIS
   * RULE, with staff telling the client themselves. His call, made
   * with the failure in front of him.
   *
   * **So do not "fix" this.** A later session finding the same shape
   * should put it back to Andy rather than close it as a bug.
   * shared/pickupGroup.ts carries the other half of the reasoning: the
   * thing he will not tolerate is a client getting two and three
   * messages about one booking.
   */
  if (brisbaneDateKey(new Date(ms(input.previousStart))) === newKey) {
    return { send: false, reason: "same_day" };
  }

  const start = ms(input.scheduledStart);
  const now = typeof input.now === "number" ? input.now : (input.now ?? new Date()).getTime();
  if (!Number.isFinite(start) || start <= now) return { send: false, reason: "in_the_past" };

  /*
   * Urgency is measured from whichever time comes FIRST, not from the
   * new one. The client is currently expected at the OLD time, so
   * moving tomorrow's 10am booking out to next month at 9pm tonight is
   * the most urgent text there is — and judging it by the new date made
   * it the least. They turn up tomorrow to a closed slot.
   */
  const soonest = Math.min(start, ms(input.previousStart) || start);
  const urgent = soonest - now <= URGENT_WITHIN_MS;
  if (!urgent && input.localHour !== undefined
      && (input.localHour < QUIET_FROM_HOUR || input.localHour >= QUIET_UNTIL_HOUR)) {
    return { send: false, reason: "quiet_hours" };
  }

  return { send: true };
}

/** One booking, one text, however many dogs are on it. */
export function buildCancellationSms(input: {
  clientFirstName: string;
  petNames: readonly string[];
  date: string;
  time: string;
  salonName?: string;
}): string {
  const salon = input.salonName?.trim() || DEFAULT_SALON;
  const who = input.clientFirstName?.trim() || "there";
  const { subject } = describePets(input.petNames);
  // "has been cancelled", not "is cancelled" — it says somebody did it,
  // which is what a client wants to know when they did not.
  return `Hi ${who}! ${subject}'s grooming appointment at ${salon} on ${input.date} at ${input.time} `
    + `has been cancelled. Call us any time to rebook. \u{1F43E}`;
}

export function buildRescheduleSms(input: {
  clientFirstName: string;
  petNames: readonly string[];
  date: string;
  time: string;
  groomer?: string | null;
  salonName?: string;
}): string {
  const salon = input.salonName?.trim() || DEFAULT_SALON;
  const who = input.clientFirstName?.trim() || "there";
  const { subject } = describePets(input.petNames);
  const withGroomer = input.groomer?.trim() ? ` with ${input.groomer.trim()}` : "";
  return `Hi ${who}! ${subject}'s grooming appointment at ${salon} has moved to ${input.date} `
    + `at ${input.time}${withGroomer}. See you then! \u{1F43E}`;
}
