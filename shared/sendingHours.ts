/**
 * The earliest an automated text may reach a client.
 *
 * Andy, 09/11/2026: "9am texts only. No earlier than that."
 *
 * ## There were four answers to this before, and one of them was nowhere
 *
 * - bookingConfirmationSms  7am
 * - rebookReminder          7am
 * - appointmentChangeSms    8am
 * - the appointment reminders — **no check at all**. The 06:30 cron
 *   schedule was the only thing stopping them, which means the rule
 *   lived in the Render dashboard rather than in the code, and a
 *   mis-typed cron expression could have texted the salon's whole book
 *   at four in the morning with nothing to refuse it.
 *
 * So the hour is one exported constant and every path asks the same
 * question. A fifth sender added next month gets the rule by importing
 * it rather than by remembering it.
 *
 * ## Why nine
 *
 * The salon opens at 7:30 and staff are on the floor before that, so
 * the old times were set by when the SALON is awake. A client is not.
 * Nine is when a text stops being an intrusion — late enough that
 * nobody is woken, early enough to be useful about a booking that day.
 *
 * ## The evening end is per-sender, and deliberately not unified
 *
 * Andy set a floor, not a window. A cancellation inside 24 hours still
 * overrides quiet hours entirely, because dropping it is worse than
 * sending it late — the client drives in. Each sender keeps the
 * latest-hour it already had.
 */

/** Andy's floor, 09/11/2026. Hour of day, 0-23, on the SALON's clock. */
export const EARLIEST_AUTOMATED_TEXT_HOUR = 9;

/**
 * Whether an automated text may land at this hour.
 *
 * `localHour` is on the salon's clock, never the host's — a server in
 * another timezone asking its own clock is the shape of bug e6a4662
 * fixed, and here it would text people in the middle of the night.
 */
export function withinSendingHours(localHour: number, latestHour: number): boolean {
  return localHour >= EARLIEST_AUTOMATED_TEXT_HOUR && localHour < latestHour;
}
