import { dayInZone } from "./calendarDay";
import { EARLIEST_AUTOMATED_TEXT_HOUR, withinSendingHours } from "./sendingHours";

/**
 * Nudging a client to book the next groom, before they drift.
 *
 * Andy, 07/11/2026, with MoeGo's "Rebook reminder" screen: "Build this
 * into the text message workflow — something along these lines."
 *
 * ## One text per HOUSEHOLD, not per dog
 *
 * MoeGo's template is per pet — "{petName} last service" — and sending
 * it that way would text Scott Barker twice on the same morning about
 * Effie and Dusty. shared/lapsedClients.ts already learned this for
 * counting: "a two-dog household books two appointments and makes one
 * trip". It matters more for sending than for counting, because Andy's
 * standing rule on texts is "Do not ever send 2 or 3". So the unit here
 * is the client, the dogs are named inside one message, and the claim
 * that stops a repeat is keyed on the client.
 *
 * ## It does not invent a cadence
 *
 * `rebookInterval` in shared/rebook.ts already answers "when is this dog
 * due" — the membership tier first because that is what they are paying
 * for, then the median of their own recent gaps, then six weeks. This
 * module takes that answer and decides whether today is the day to say
 * something about it.
 *
 * ## The window, and why it is not "any time in the last three weeks"
 *
 * The reminder is meant to land about three weeks before they are due.
 * Treating that as "anything from three weeks out until the day itself"
 * would, on the very first run, text every client currently inside a
 * three-week band — the same shape of accident the booking confirmation
 * guards against, where a sync of 276 bookings would have texted 276
 * clients at once.
 *
 * So the window is narrow and trailing: it opens when they cross three
 * weeks out and stays open for `CATCH_UP_DAYS` so a cron outage does not
 * silently skip a cohort. A client eight days from their expected date
 * is nearly on time and is not told they are overdue; a client who is
 * long past it is a lapsed client to ring, which is what
 * shared/lapsedClients.ts is for.
 */

/** How far before the expected date the nudge lands, unless the salon says otherwise. */
export const REBOOK_REMINDER_WEEKS_BEFORE = 3;

/**
 * How many days the window stays open after it opens.
 *
 * Six, so a cron that fails for most of a week still catches everybody
 * exactly once, and a client who is nearly due is never swept up.
 */
export const REBOOK_REMINDER_CATCH_UP_DAYS = 6;

/**
 * The most this job will send in one run.
 *
 * A belt to go with the braces above. If the window logic is ever wrong
 * — a timezone slip, a cadence that recomputes oddly — the blast radius
 * is this number and a line in the log saying how many were held back,
 * rather than the whole client book in one morning. The held-back ones
 * are still inside the window tomorrow.
 */
export const REBOOK_REMINDER_MAX_PER_RUN = 25;

/** Quiet hours, matching the booking confirmation so one salon speaks once. */
/** Andy, 09/11/2026: "9am texts only." Was 7. See shared/sendingHours.ts. */
export const REBOOK_QUIET_FROM_HOUR = EARLIEST_AUTOMATED_TEXT_HOUR;
export const REBOOK_QUIET_UNTIL_HOUR = 19;

export type RebookReminderSkipReason =
  | "policy_off"
  | "automation_off"
  | "salon_off"
  | "opted_out"
  | "no_phone"
  | "has_future_booking"
  | "no_history"
  | "already_sent"
  | "not_due_yet"
  | "too_late"
  | "quiet_hours";

export type RebookReminderDecision =
  | { send: true; expectedOn: Date; expectedDay: string; weeksSinceLastVisit: number }
  | { send: false; reason: RebookReminderSkipReason };

export const REBOOK_SKIP_LABEL: Record<RebookReminderSkipReason, string> = {
  policy_off: "rebook reminders are not on the automated-SMS allow-list",
  automation_off: "SMS automation is disabled",
  salon_off: "the salon has rebook reminders switched off",
  opted_out: "the client opted out of texts",
  no_phone: "no phone number",
  has_future_booking: "they already have a booking",
  no_history: "no visit to count from",
  already_sent: "already sent for this visit",
  not_due_yet: "not close enough to their expected date",
  too_late: "past the window — a lapsed client to ring, not to text",
  quiet_hours: "outside texting hours",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, by calendar day in the salon's zone. */
function daysBetweenDays(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

/**
 * Whether to nudge this client today.
 *
 * Ordered cheapest and most dangerous first, and every branch names a
 * reason rather than returning a bare false — when Lauren asks why Mrs
 * Gerard did not get one, the answer has to be in the log.
 */
export function decideRebookReminder(input: {
  /** Whether the automated-SMS allow-list permits this type at all. */
  policyAllows: boolean;
  /** SMS_AUTOMATION_ENABLED. */
  automationEnabled: boolean;
  /** The salon's own switch, which is off until somebody turns it on. */
  salonEnabled: boolean;
  smsOptedOutAt?: Date | string | null;
  clientPhone?: string | null;
  /** Any booking already in the diary for this household, in the future. */
  hasFutureBooking: boolean;
  /** The last day anyone in this household was actually groomed. */
  lastVisitOn?: Date | string | null;
  /** From rebookInterval: membership tier, their own rhythm, or six. */
  intervalWeeks: number;
  /** The expected day a reminder was last sent FOR, from the claim. */
  alreadySentForDay?: string | null;
  weeksBefore?: number;
  /** Hour of day 0-23 on the salon's clock. Omit to skip the check. */
  localHour?: number;
  timeZone: string;
  now?: Date;
}): RebookReminderDecision {
  if (!input.policyAllows) return { send: false, reason: "policy_off" };
  if (!input.automationEnabled) return { send: false, reason: "automation_off" };
  if (!input.salonEnabled) return { send: false, reason: "salon_off" };
  if (input.smsOptedOutAt) return { send: false, reason: "opted_out" };
  if (!input.clientPhone || !String(input.clientPhone).trim()) return { send: false, reason: "no_phone" };
  // The whole premise of the message is "we don't have a booking for
  // them yet". Anyone who has already rebooked must never see it.
  if (input.hasFutureBooking) return { send: false, reason: "has_future_booking" };

  const now = input.now ?? new Date();
  const lastVisit = input.lastVisitOn ? new Date(input.lastVisitOn) : null;
  if (!lastVisit || Number.isNaN(lastVisit.getTime())) return { send: false, reason: "no_history" };

  const lastDay = dayInZone(lastVisit, input.timeZone);
  const today = dayInZone(now, input.timeZone);
  if (!lastDay || !today) return { send: false, reason: "no_history" };

  const weeks = Number.isFinite(input.intervalWeeks) && input.intervalWeeks > 0
    ? input.intervalWeeks
    : 0;
  if (weeks <= 0) return { send: false, reason: "no_history" };

  const expectedOn = new Date(lastVisit.getTime() + weeks * 7 * DAY_MS);
  const expectedDay = dayInZone(expectedOn, input.timeZone);
  if (!expectedDay) return { send: false, reason: "no_history" };

  // Claimed per expected day, so one text per cycle. The expected day
  // only moves when they come in again, which is the next cycle.
  if (input.alreadySentForDay && input.alreadySentForDay === expectedDay) {
    return { send: false, reason: "already_sent" };
  }

  const daysUntil = daysBetweenDays(today, expectedDay);
  const opensAt = (input.weeksBefore ?? REBOOK_REMINDER_WEEKS_BEFORE) * 7;
  if (daysUntil > opensAt) return { send: false, reason: "not_due_yet" };
  if (daysUntil < opensAt - REBOOK_REMINDER_CATCH_UP_DAYS) return { send: false, reason: "too_late" };

  if (input.localHour !== undefined
    && !withinSendingHours(input.localHour, REBOOK_QUIET_UNTIL_HOUR)) {
    return { send: false, reason: "quiet_hours" };
  }

  return {
    send: true,
    expectedOn,
    expectedDay,
    weeksSinceLastVisit: Math.max(1, Math.round(daysBetweenDays(lastDay, today) / 7)),
  };
}

/** "Archie", "Archie and George", "Archie, George and Coco". */
export function listPetNames(names: readonly string[]): string {
  const clean = names.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "your dog";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/**
 * The message itself.
 *
 * Andy's MoeGo wording, minus one sentence. His template ends "Over 8
 * weeks will incur higher grooming fees"; asked on 07/11/2026 he said to
 * drop it. That automation has been switched OFF in MoeGo, so the line
 * has never actually gone out, and the price catalogue carries no
 * over-eight-weeks surcharge — a text promising one would be a
 * commitment somebody has to honour at the counter.
 *
 * `bookingUrl` is omitted when online booking is switched off, and the
 * message asks them to ring instead. A "book here" link to a page that
 * refuses bookings is the dead-link failure client-messaging-safety
 * exists to prevent, and it must never be MoeGo's booking domain: the
 * server passes getAppBaseUrl() + "/book".
 */
export function buildRebookReminderSms(input: {
  salonName: string;
  clientFirstName?: string | null;
  petNames: readonly string[];
  weeksSinceLastVisit: number;
  /** Absolute, from getAppBaseUrl(). Omit when online booking is off. */
  bookingUrl?: string | null;
  salonPhone?: string | null;
}): string {
  const who = input.clientFirstName?.trim() || "there";
  const pets = listPetNames(input.petNames);
  const plural = input.petNames.filter((n) => String(n ?? "").trim()).length > 1;

  // "them" either way: it reads naturally for one dog or three, and
  // avoids guessing a dog's sex from a name to pick "him" or "her".
  const opening =
    `${input.salonName}: Hi ${who}, it's been about ${input.weeksSinceLastVisit} weeks since `
    + `${pets} ${plural ? "were" : "was"} last in with us, and we don't have a next booking `
    + `for them yet.`;

  // Kept from Andy's own template. The claim is about the dog's coat and
  // temperament, not about money.
  const why = "Dogs groomed less than 8 weeks apart stay calmer and in much better condition.";

  const how = input.bookingUrl
    ? `Book here: ${input.bookingUrl}`
    : input.salonPhone?.trim()
      ? `Give us a ring on ${input.salonPhone.trim()} to book.`
      : "Reply to this message to book.";

  return `${opening} ${why} ${how}`;
}
