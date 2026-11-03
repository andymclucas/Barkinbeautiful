import { describe, expect, it } from "vitest";
import { decideAppointmentReminder, REMINDER_SKIP_LABEL } from "../shared/reminderDecision";

describe("decideAppointmentReminder", () => {
  it("sends to a client with a phone who has not opted out", () => {
    expect(decideAppointmentReminder({ clientPhone: "0412345678" })).toEqual({ send: true });
  });

  /*
   * Chris Roulstone, client 3, opted out at 03/11/2026 16:07 after
   * asking not to get reminder texts on his recurring booking. The job
   * never looked at the column, so switching reminders on would have
   * texted him three times for every booking.
   */
  it("never texts a client who has opted out", () => {
    const d = decideAppointmentReminder({
      clientPhone: "0412345678",
      smsOptedOutAt: new Date("2026-11-03T06:07:00Z"),
    });
    expect(d).toEqual({ send: false, reason: "opted_out" });
  });

  it("takes the opt-out as a string too, as the driver may hand it back", () => {
    expect(decideAppointmentReminder({ clientPhone: "0412345678", smsOptedOutAt: "2026-11-03 16:07:00" }))
      .toEqual({ send: false, reason: "opted_out" });
  });

  /*
   * Opting out outranks every other reason. If it did not, a client who
   * opted out AND had no phone would be reported as "no phone" — and
   * the day somebody adds a phone number back, the real reason would
   * have been invisible the whole time.
   */
  it("reports opting out ahead of any other reason", () => {
    expect(decideAppointmentReminder({ clientPhone: null, smsOptedOutAt: new Date() }))
      .toEqual({ send: false, reason: "opted_out" });
    expect(decideAppointmentReminder({ clientPhone: "0412345678", smsOptedOutAt: new Date(), stageSentAt: new Date() }))
      .toEqual({ send: false, reason: "opted_out" });
  });

  it("skips a client with no number to text", () => {
    for (const phone of [null, undefined, "", "   "]) {
      expect(decideAppointmentReminder({ clientPhone: phone }), JSON.stringify(phone))
        .toEqual({ send: false, reason: "no_phone" });
    }
  });

  /* The stage's own claim column is what stops a second 4-day text. */
  it("does not repeat a stage that has already gone", () => {
    expect(decideAppointmentReminder({ clientPhone: "0412345678", stageSentAt: new Date() }))
      .toEqual({ send: false, reason: "already_sent" });
  });

  it("treats a null claim as not yet sent", () => {
    expect(decideAppointmentReminder({ clientPhone: "0412345678", stageSentAt: null })).toEqual({ send: true });
  });

  it("has a readable label for every reason it can give", () => {
    for (const reason of ["opted_out", "no_phone", "already_sent"] as const) {
      expect(REMINDER_SKIP_LABEL[reason]).toBeTruthy();
    }
  });
});
