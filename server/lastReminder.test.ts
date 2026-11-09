import { describe, it, expect } from "vitest";
import {
  LAST_REMINDER_CUTOFF_HOUR, lastReminderDecision,
} from "@shared/lastReminder";
import { EARLIEST_AUTOMATED_TEXT_HOUR } from "@shared/sendingHours";
import { buildAppointmentReminderSms } from "./sms";

/**
 * Andy, 09/11/2026: "Send the reminder text at 9am the day before if
 * they are booked in before 9am."
 *
 * The morning-of reminder stopped working the moment every automated
 * text moved to nine: a dog booked at 7:30 is already on the table.
 * decideAppointmentReminder would have skipped it as `already_here`,
 * so nothing would look wrong and the client would simply stop being
 * reminded.
 */
describe("lastReminderDecision", () => {
  it("reminds an early dog the day before, saying tomorrow", () => {
    for (const apptHour of [7, 8]) {
      expect(lastReminderDecision({ apptHour, daysAway: 1 }), `${apptHour}:00`)
        .toEqual({ send: true, word: "tomorrow" });
    }
  });

  it("reminds a later dog on the day, saying today", () => {
    for (const apptHour of [9, 12, 16]) {
      expect(lastReminderDecision({ apptHour, daysAway: 0 }), `${apptHour}:00`)
        .toEqual({ send: true, word: "today" });
    }
  });

  /*
   * The case the split exists for. Both windows read the same claim
   * column, so without this an early dog would be picked up twice —
   * once correctly the day before, and once at nine on the day it is
   * already in the building, told "today at 7:30 am".
   */
  it("does not remind an early dog again on the day", () => {
    for (const apptHour of [0, 7, 8]) {
      expect(lastReminderDecision({ apptHour, daysAway: 0 }), `${apptHour}:00`)
        .toEqual({ send: false, reason: "not_this_run" });
    }
  });

  it("does not remind a later dog the day before", () => {
    // That one belongs to tomorrow's run, and the two-day stage has
    // already covered the longer notice.
    for (const apptHour of [9, 12, 16]) {
      expect(lastReminderDecision({ apptHour, daysAway: 1 }), `${apptHour}:00`)
        .toEqual({ send: false, reason: "not_this_run" });
    }
  });

  it("owns nothing further out than tomorrow", () => {
    for (const daysAway of [2, 3, 4, 7]) {
      for (const apptHour of [7, 12]) {
        expect(lastReminderDecision({ apptHour, daysAway }), `${daysAway}d ${apptHour}:00`)
          .toEqual({ send: false, reason: "not_this_run" });
      }
    }
  });

  /*
   * Exactly one run must own each appointment, or the claim column is
   * the only thing preventing two texts — and a claim is a guard, not a
   * design.
   */
  it("gives every appointment exactly one owner across the two runs", () => {
    for (let apptHour = 0; apptHour < 24; apptHour++) {
      const owners = [0, 1].filter((daysAway) =>
        lastReminderDecision({ apptHour, daysAway }).send);
      expect(owners, `${apptHour}:00`).toHaveLength(1);
    }
  });

  it("splits on Andy's hour, which is the sending floor", () => {
    expect(LAST_REMINDER_CUTOFF_HOUR).toBe(9);
    // Not a coincidence: the cutoff is late because the SEND is late.
    expect(LAST_REMINDER_CUTOFF_HOUR).toBe(EARLIEST_AUTOMATED_TEXT_HOUR);
  });
});

describe("the day-before wording", () => {
  const build = (stage: "morning" | "day_before") =>
    buildAppointmentReminderSms({
      clientFirstName: "Jo", petNames: ["Teddy"], date: "Friday 6 November",
      time: "7:30 am", stage,
    });

  it("says tomorrow the day before, and today on the day", () => {
    expect(build("day_before")).toContain("a grooming appointment tomorrow at 7:30 am");
    expect(build("morning")).toContain("a grooming appointment today at 7:30 am");
  });

  it("still greets by time of day — both go out at nine", () => {
    expect(build("day_before")).toMatch(/^Good morning Jo!/);
  });

  it("names no groomer, like every other stage", () => {
    expect(build("day_before")).not.toMatch(/ with /);
  });

  it("drops the Y/N prompt once the client has confirmed", () => {
    const confirmed = buildAppointmentReminderSms({
      clientFirstName: "Jo", petNames: ["Teddy"], date: "Friday 6 November",
      time: "7:30 am", stage: "day_before", alreadyConfirmed: true,
    });
    expect(confirmed).not.toContain("Reply Y");
    expect(confirmed).toBe(confirmed.trimEnd());
  });
});
