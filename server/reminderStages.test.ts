import { describe, expect, it } from "vitest";
import {
  REMINDER_STAGES,
  RETIRED_REMINDER_STAGES,
} from "@shared/reminderStages";
import { REPLY_PROMPT } from "@shared/replyPrompt";
import { buildAppointmentReminderSms } from "./sms";

/**
 * A client should be asked to confirm once, and told once more.
 *
 * Lauren, 10/11/2026, with a client's thread open — three texts about
 * one booking, two of them asking her to reply: "just want to confirm
 * to 1 message and not receive the one 2 days before." Andy: "Only one
 * confirmation text to go out."
 *
 * The rule is not a property of any one stage. It emerges from which
 * stages run and which of them carry the prompt, so nothing could have
 * held it before: the stage list lived inside the handler, the wording
 * lived in sms.ts, and each half looked right on its own. This reads
 * the real list, builds the real message for every stage on it, and
 * counts.
 */

const build = (
  stage: (typeof REMINDER_STAGES)[number]["key"],
  alreadyConfirmed: boolean
) =>
  buildAppointmentReminderSms({
    clientFirstName: "Janene",
    petNames: ["Minnie"],
    date: "Wednesday 11 November",
    time: "10:00 am",
    stage,
    alreadyConfirmed,
  });

describe("what a booking's reminders add up to", () => {
  it("asks exactly once, across everything that goes out", () => {
    const asking = REMINDER_STAGES.filter(stage =>
      build(stage.key, false).includes(REPLY_PROMPT)
    );
    expect(asking.map(stage => stage.key)).toEqual(["4d"]);
  });

  it("sends at most two texts about one booking", () => {
    // Three was the complaint. Two is a question and a nudge.
    expect(REMINDER_STAGES).toHaveLength(2);
  });

  it("stops asking once the client has replied", () => {
    // Andy, 09/11/2026: "once the client responds with Y, then just a
    // reminder only goes out. Does not need another confirmation."
    for (const stage of REMINDER_STAGES) {
      expect(build(stage.key, true)).not.toContain(REPLY_PROMPT);
    }
  });

  it("does not send the 2-day text at all", () => {
    // Retired rather than deleted: the wording and its tests are still
    // there, so bringing a chaser back is one line in REMINDER_STAGES.
    expect(REMINDER_STAGES.map(stage => stage.key)).not.toContain("2d");
    expect(RETIRED_REMINDER_STAGES).toContain("2d");
  });

  it("goes out furthest-away first, and claims a different column each time", () => {
    /*
     * Order matters because the job walks the list in order, and two
     * stages sharing a claim column would let the second one text a
     * client the first had already texted.
     */
    const daysOut = REMINDER_STAGES.map(stage => stage.daysOut);
    expect(daysOut).toEqual([...daysOut].sort((a, b) => b - a));
    expect(new Set(REMINDER_STAGES.map(s => s.column)).size).toBe(
      REMINDER_STAGES.length
    );
    expect(new Set(REMINDER_STAGES.map(s => s.sqlColumn)).size).toBe(
      REMINDER_STAGES.length
    );
  });

  it("names a real column for every stage, in both spellings", () => {
    // A typo here is a reminder that never claims and therefore repeats.
    const spellings: Record<string, string> = {
      reminder4dSentAt: "reminder_4d_sent_at",
      reminder2dSentAt: "reminder_2d_sent_at",
      reminderMorningSentAt: "reminder_morning_sent_at",
    };
    for (const stage of REMINDER_STAGES) {
      expect(spellings[stage.column]).toBe(stage.sqlColumn);
    }
  });
});
