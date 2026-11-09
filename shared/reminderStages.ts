/**
 * Which appointment reminders actually go out.
 *
 * Lauren, 10/11/2026, with a client's thread open — three texts about
 * one booking, two of them asking her to confirm: "just want to confirm
 * to 1 message and not receive the one 2 days before." Andy: "Only one
 * confirmation text to go out."
 *
 * So the 2-day stage is retired. A booking now gets at most two texts:
 * one four days out, which asks, and one the day before, which does
 * not. The client answers once.
 *
 * ## Why retired rather than deleted
 *
 * `buildAppointmentReminderSms` keeps its "2d" wording and its tests.
 * Nothing sends it while it is absent from REMINDER_STAGES below, and
 * the salon may well want a chaser back for the people who never
 * answer — that is one line here rather than rewriting a message.
 *
 * `reminder_2d_sent_at` stays on the table for the same reason as
 * `reminder_morning_sent_at` keeps its misleading name: dropping a
 * column is a migration for no gain, and it is the record of what was
 * sent while the stage ran.
 *
 * ## The rule this file exists to hold
 *
 * At most ONE text asks the client to reply. That is not a property of
 * any single stage — it emerges from which stages run and which of them
 * carry the prompt — so it belongs somewhere a test can read it.
 * `server/reminderStages.test.ts` builds the real message for every
 * running stage and counts the asks.
 */

export type ReminderStageKey = "4d" | "2d" | "day_before";

export type ReminderStage = {
  key: ReminderStageKey;
  /** How many salon days before the booking this stage goes out. */
  daysOut: number;
  /** The claim column on `appointments`, as Drizzle names it. */
  column: "reminder4dSentAt" | "reminder2dSentAt" | "reminderMorningSentAt";
  /** The same column as the database spells it, for raw SQL. */
  sqlColumn: string;
};

/**
 * In the order they go out. The job walks this list and nothing else.
 */
export const REMINDER_STAGES: readonly ReminderStage[] = [
  {
    key: "4d",
    daysOut: 4,
    column: "reminder4dSentAt",
    sqlColumn: "reminder_4d_sent_at",
  },
  /*
   * The 2-day stage sat here until 10/11/2026. See the note at the top:
   * it is a line away from coming back, and the message it would send
   * is still written and still tested.
   */
  {
    key: "day_before",
    daysOut: 1,
    column: "reminderMorningSentAt",
    sqlColumn: "reminder_morning_sent_at",
  },
];

/** Retired stages, named so "why is there a column nobody writes?" has an answer. */
export const RETIRED_REMINDER_STAGES: readonly ReminderStageKey[] = ["2d"];
