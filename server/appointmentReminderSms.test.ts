import { describe, it, expect } from "vitest";
import { buildAppointmentReminderSms } from "./sms";

/**
 * Nothing covered this text at all until reminders were about to be
 * turned on — and rendering it then showed "Albert and Eddy' grooming
 * appointment", which no assertion would have caught because no
 * assertion existed. These read whole sentences for that reason.
 */
const build = (petNames: string[], stage?: "4d" | "2d" | "day_before", alreadyConfirmed = false) =>
  buildAppointmentReminderSms({
    clientFirstName: "Jo", petNames, date: "Friday 6 November",
    time: "12:30 pm", stage, alreadyConfirmed,
  });

describe("buildAppointmentReminderSms", () => {
  it("reads correctly for one dog, two days out", () => {
    expect(build(["Teddy"], "2d")).toBe(
      "Hi Jo! Teddy's grooming appointment at Barkin' Beautiful is in 2 days, "
      + "Friday 6 November at 12:30 pm. Reply Y to confirm or N to cancel.",
    );
  });

  /*
   * The bug this file was written for. A trailing apostrophe is for a
   * plural noun ending in s, not a list of names.
   */
  it("reads correctly for two dogs, two days out", () => {
    expect(build(["Albert", "Eddy"], "2d")).toBe(
      "Hi Jo! Albert and Eddy's grooming appointment at Barkin' Beautiful is in 2 days, "
      + "Friday 6 November at 12:30 pm. Reply Y to confirm or N to cancel.",
    );
  });

  it("never leaves a bare apostrophe, at any dog count or stage", () => {
    for (const names of [["Teddy"], ["Albert", "Eddy"], ["Stella", "Belle", "Teddy"]]) {
      for (const stage of ["4d", "2d", "day_before", undefined] as const) {
        // An apostrophe followed by a space or end-of-word, other than
        // the salon's own name.
        const text = build(names, stage).replace(/Barkin' Beautiful/g, "SALON");
        expect(text, `${names.length} dogs, ${stage ?? "plain"}`).not.toMatch(/\w'(?![s\w])/);
      }
    }
  });

  it("agrees the verb with the number of dogs", () => {
    expect(build(["Teddy"], "4d")).toContain("Teddy has a grooming appointment");
    expect(build(["Albert", "Eddy"], "4d")).toContain("Albert and Eddy have a grooming appointment");
  });

  it("names three dogs in one message rather than sending three", () => {
    const sms = build(["Stella", "Belle", "Teddy"], "day_before");
    expect(sms).toContain("Stella, Belle and Teddy have a grooming appointment tomorrow");
    expect(sms.match(/grooming appointment/g)).toHaveLength(1);
  });

  it("greets by time of day on the last reminder", () => {
    // It goes at nine, so "Good morning" fits; the earlier stages can
    // land at any hour a staff member books at.
    expect(build(["Teddy"], "day_before")).toMatch(/^Good morning Jo!/);
    expect(build(["Teddy"], "4d")).toMatch(/^Hi Jo!/);
  });

  /*
   * Andy, 09/11/2026: "last reminder text for all appts (regardless of
   * time) is sent at 9am the day before. Nothing gets sent on the day
   * of." There used to be a "morning" stage saying "today"; it went at
   * 06:30, and once every automated text moved to nine it would have
   * reached a 7:30 dog on the table and the salon's biggest slot —
   * 9:00, 588 bookings — with no notice at all.
   */
  it("says tomorrow on the last reminder, and never today", () => {
    const sms = build(["Teddy"], "day_before");
    expect(sms).toContain("a grooming appointment tomorrow at 12:30 pm");
    expect(sms).not.toContain("today");
    // No date beside it: "tomorrow at 12:30 pm" is what somebody acts
    // on, and a date next to it reads as a second appointment.
    expect(sms).not.toContain("Friday 6 November");
  });

  it("gives the date on the stages that are not about tomorrow", () => {
    for (const stage of ["4d", "2d", undefined] as const) {
      expect(build(["Teddy"], stage), String(stage)).toContain("Friday 6 November");
    }
  });

  /*
   * Lauren, 09/11/2026: "Can we also please remove the groomers name -
   * thanks." This used to assert the opposite — "names the groomer in
   * every stage" — so the inversion is deliberate, not a deletion.
   *
   * The builder no longer takes a groomer at all, so the only way to
   * reintroduce one is to add the parameter back, which is a decision
   * somebody has to make rather than a line they can slip in.
   */
  it("never names the groomer, at any stage", () => {
    for (const stage of ["4d", "2d", "day_before", undefined] as const) {
      expect(build(["Teddy"], stage), String(stage)).not.toMatch(/ with /);
    }
  });

  /*
   * Andy, 09/11/2026, reading Jeanette Nicholaou's thread — a Y on the
   * Saturday, and the Monday reminder asking again: "once the client
   * responds with Y, then just a reminder only goes out. Does not need
   * another confirmation."
   */
  describe("once the client has already said Y", () => {
    it("drops the Y/N prompt at every stage", () => {
      for (const stage of ["4d", "2d", "day_before", undefined] as const) {
        const text = build(["Teddy"], stage, true);
        expect(text, String(stage)).not.toContain("Reply Y");
        expect(text, String(stage)).not.toContain("Reply N");
        expect(text, String(stage)).not.toContain("cancel");
      }
    });

    /* The prompt is appended with its own leading space, so dropping it
       must not leave "at 12:30 pm. " on a real text message. */
    it("leaves no trailing space where the prompt was", () => {
      for (const stage of ["4d", "2d", "day_before", undefined] as const) {
        expect(build(["Teddy"], stage, true), String(stage)).toBe(
          build(["Teddy"], stage, true).trimEnd(),
        );
      }
    });

    it("still says everything a reminder has to say", () => {
      const text = build(["Teddy"], "2d", true);
      expect(text).toBe(
        "Hi Jo! Teddy's grooming appointment at Barkin' Beautiful is in 2 days, "
        + "Friday 6 November at 12:30 pm.",
      );
    });

    it("keeps the prompt for a client who has not answered", () => {
      for (const stage of ["4d", "2d", "day_before", undefined] as const) {
        expect(build(["Teddy"], stage, false), String(stage))
          .toContain("Reply Y to confirm or N to cancel.");
      }
    });
  });

  it("stays inside two SMS segments for a three-dog booking", () => {
    // 306 characters is two GSM-7 segments. A reminder that splits into
    // three is three times the cost for every client every week.
    for (const stage of ["4d", "2d", "day_before", undefined] as const) {
      expect(build(["Stella", "Belle", "Teddy"], stage).length, String(stage))
        .toBeLessThanOrEqual(306);
    }
  });
});
