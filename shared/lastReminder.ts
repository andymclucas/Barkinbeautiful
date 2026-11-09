/**
 * Which 9am run sends the LAST reminder, and what it calls the day.
 *
 * Andy, 09/11/2026, immediately after setting the floor at nine: "Send
 * the reminder text at 9am the day before if they are booked in before
 * 9am."
 *
 * ## The morning-of reminder stopped working when the floor moved
 *
 * It used to go at 06:30, an hour before the salon opens, so a dog
 * booked at 7:30 got a text while its owner was getting ready. Moving
 * every automated text to nine broke that: the dog is already on the
 * table. `decideAppointmentReminder` would quietly skip it as
 * `already_here`, so nothing would be wrong on screen and the client
 * would simply stop being reminded.
 *
 * So the last reminder is no longer "the morning of". It is "the last
 * nine o'clock before they have to leave the house":
 *
 *   booked 7:30 am  ->  9am the DAY BEFORE, saying "tomorrow"
 *   booked 12:30 pm ->  9am the SAME DAY,   saying "today"
 *
 * ## One reminder either way
 *
 * Both paths claim the same `reminder_morning_sent_at` column, so a
 * booking gets one last reminder and not two. The column keeps its
 * name: renaming it is a migration for no gain, and the comment here is
 * cheaper than the deploy.
 *
 * ## The boundary is exactly nine, which is Andy's number
 *
 * An appointment AT 9:00 gets its reminder at 9:00 on the same day,
 * which is too late to be useful — the client is already at the counter.
 * That is a consequence of the number rather than of the rule, and
 * widening it to ten would be changing what he asked for. Raise
 * LAST_REMINDER_CUTOFF_HOUR if the salon wants the early-morning cohort
 * drawn wider.
 */

/** Appointments starting before this hour are reminded the day before. */
export const LAST_REMINDER_CUTOFF_HOUR = 9;

export type LastReminderDecision =
  | { send: true; word: "today" | "tomorrow" }
  | { send: false; reason: "not_this_run" };

/**
 * Should THIS 9am run send the last reminder for this appointment?
 *
 * `daysAway` is whole Brisbane days from the run's day to the
 * appointment's day: 0 is today, 1 is tomorrow. Anything else belongs
 * to the four-day or two-day stage, or to no stage at all.
 */
export function lastReminderDecision(input: {
  /** The hour the appointment starts, 0-23, on the salon's clock. */
  apptHour: number;
  daysAway: number;
}): LastReminderDecision {
  const early = input.apptHour < LAST_REMINDER_CUTOFF_HOUR;

  // Tomorrow, and they have to be here before the next run would go out.
  if (input.daysAway === 1 && early) return { send: true, word: "tomorrow" };

  // Today, and there is still time for the text to be worth sending.
  if (input.daysAway === 0 && !early) return { send: true, word: "today" };

  /*
   * Everything else. Notably: today-and-early is NOT sent, because
   * yesterday's run already covered it. If yesterday's run was missed
   * the client gets nothing, which is the right answer anyway — a 9am
   * text about a 7:30 appointment is either too late to act on or
   * about a dog already in the building.
   */
  return { send: false, reason: "not_this_run" };
}
