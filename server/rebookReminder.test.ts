import { describe, it, expect } from "vitest";
import {
  decideRebookReminder, buildRebookReminderSms, listPetNames,
  REBOOK_REMINDER_WEEKS_BEFORE, REBOOK_REMINDER_CATCH_UP_DAYS,
} from "../shared/rebookReminder";

const TZ = "Australia/Brisbane";

/** A household that is due in exactly three weeks and has not rebooked. */
const base = {
  policyAllows: true,
  automationEnabled: true,
  salonEnabled: true,
  hasFutureBooking: false,
  clientPhone: "0427030788",
  // Six-week cadence, last in on 1 October, so expected 12 November.
  lastVisitOn: new Date("2026-10-01T00:00:00+10:00"),
  intervalWeeks: 6,
  timeZone: TZ,
  now: new Date("2026-10-22T09:00:00+10:00"), // 21 days before 12 Nov
};

describe("deciding whether to nudge a client to rebook", () => {
  it("sends when they cross three weeks from their expected date", () => {
    const decision = decideRebookReminder(base);
    expect(decision.send).toBe(true);
    if (decision.send) {
      expect(decision.expectedDay).toBe("2026-11-12");
      expect(decision.weeksSinceLastVisit).toBe(3);
    }
  });

  /**
   * The guard that matters most. Without a trailing window, the FIRST
   * run would text every client sitting anywhere inside a three-week
   * band — the same accident the booking confirmation guards against,
   * where a sync of 276 bookings would have texted 276 clients.
   */
  it("does not sweep up everybody already inside the three weeks", () => {
    // Eight days from due: nearly on time, and not told they are late.
    const nearlyDue = decideRebookReminder({
      ...base, now: new Date("2026-11-04T09:00:00+10:00"),
    });
    expect(nearlyDue).toEqual({ send: false, reason: "too_late" });
  });

  it("stays open long enough to survive a cron outage", () => {
    // The last day of the catch-up window still sends.
    const lastChance = new Date(base.now.getTime() + REBOOK_REMINDER_CATCH_UP_DAYS * 86_400_000);
    expect(decideRebookReminder({ ...base, now: lastChance }).send).toBe(true);
    // One day later it has closed.
    const tooLate = new Date(lastChance.getTime() + 86_400_000);
    expect(decideRebookReminder({ ...base, now: tooLate })).toEqual({ send: false, reason: "too_late" });
  });

  it("says nothing before the window opens", () => {
    expect(decideRebookReminder({ ...base, now: new Date("2026-10-21T09:00:00+10:00") }))
      .toEqual({ send: false, reason: "not_due_yet" });
  });

  /** The premise of the message is "we don't have a booking for them yet". */
  it("never nudges someone who has already rebooked", () => {
    expect(decideRebookReminder({ ...base, hasFutureBooking: true }))
      .toEqual({ send: false, reason: "has_future_booking" });
  });

  it("honours an opt-out before anything else about timing", () => {
    expect(decideRebookReminder({ ...base, smsOptedOutAt: new Date("2026-03-01T00:00:00Z") }))
      .toEqual({ send: false, reason: "opted_out" });
  });

  it("refuses while the allow-list, the env gate or the salon switch is off", () => {
    expect(decideRebookReminder({ ...base, policyAllows: false }))
      .toEqual({ send: false, reason: "policy_off" });
    expect(decideRebookReminder({ ...base, automationEnabled: false }))
      .toEqual({ send: false, reason: "automation_off" });
    // The one that is false in production until somebody flips it.
    expect(decideRebookReminder({ ...base, salonEnabled: false }))
      .toEqual({ send: false, reason: "salon_off" });
  });

  /**
   * One text per household per cycle. The claim is the expected DAY, so
   * it releases by itself when they next come in and the day moves.
   */
  it("sends once per cycle, and again next cycle", () => {
    expect(decideRebookReminder({ ...base, alreadySentForDay: "2026-11-12" }))
      .toEqual({ send: false, reason: "already_sent" });
    // A claim from the previous cycle does not block this one.
    expect(decideRebookReminder({ ...base, alreadySentForDay: "2026-10-01" }).send).toBe(true);
  });

  it("needs a visit to count from and a phone to send to", () => {
    expect(decideRebookReminder({ ...base, lastVisitOn: null }))
      .toEqual({ send: false, reason: "no_history" });
    expect(decideRebookReminder({ ...base, intervalWeeks: 0 }))
      .toEqual({ send: false, reason: "no_history" });
    expect(decideRebookReminder({ ...base, clientPhone: "  " }))
      .toEqual({ send: false, reason: "no_phone" });
  });

  /*
   * 8am used to pass here, and the rebook cron still fires at 08:00
   * Brisbane. Andy, 09/11/2026: "9am texts only. No earlier than that."
   * The schedule moves too, but this is what makes the schedule not the
   * only thing standing between a client and an early text.
   */
  it("will not text before nine, whatever the cron says", () => {
    for (const hour of [3, 7, 8, 20]) {
      expect(decideRebookReminder({ ...base, localHour: hour }), `${hour}:00`)
        .toEqual({ send: false, reason: "quiet_hours" });
    }
    expect(decideRebookReminder({ ...base, localHour: 9 }).send).toBe(true);
  });

  /**
   * A membership dog's cadence comes from the tier, so the window moves
   * with it rather than with a house default.
   */
  it("follows the cadence it is given rather than a fixed six weeks", () => {
    // Four-weekly dog, last in 1 October, expected 29 October.
    const fourWeekly = { ...base, intervalWeeks: 4, now: new Date("2026-10-08T09:00:00+10:00") };
    const decision = decideRebookReminder(fourWeekly);
    expect(decision.send).toBe(true);
    if (decision.send) expect(decision.expectedDay).toBe("2026-10-29");
    // On the six-week assumption that same day would be far too early.
    expect(decideRebookReminder({ ...fourWeekly, intervalWeeks: 6 }))
      .toEqual({ send: false, reason: "not_due_yet" });
  });

  it("uses the configured weeks-before when the salon has changed it", () => {
    expect(decideRebookReminder({ ...base, weeksBefore: 2 }))
      .toEqual({ send: false, reason: "not_due_yet" });
    expect(decideRebookReminder({
      ...base, weeksBefore: 2, now: new Date("2026-10-29T09:00:00+10:00"),
    }).send).toBe(true);
    expect(REBOOK_REMINDER_WEEKS_BEFORE).toBe(3);
  });
});

describe("the message", () => {
  const msg = (over = {}) => buildRebookReminderSms({
    salonName: "Barkin Beautiful",
    clientFirstName: "Scott",
    petNames: ["Effie", "Dusty"],
    weeksSinceLastVisit: 3,
    bookingUrl: "https://staff.barkinbeautiful.com.au/book",
    ...over,
  });

  it("names every dog in the household, in one message", () => {
    expect(msg()).toContain("Effie and Dusty were last in");
    expect(msg({ petNames: ["Link"] })).toContain("Link was last in");
    expect(listPetNames(["A", "B", "C"])).toBe("A, B and C");
  });

  /**
   * Andy, 07/11/2026, asked for the fees line to go. His MoeGo template
   * ends "Over 8 weeks will incur higher grooming fees"; the catalogue
   * has no such surcharge, and that automation has never been switched
   * on, so nobody has been promised it. The rest of his wording stays.
   */
  it("makes no promise about price", () => {
    const text = msg();
    expect(text).not.toMatch(/fee|fees|charge|\$/i);
    expect(text).toContain("stay calmer and in much better condition");
  });

  it("links to our own booking page, never MoeGo's", () => {
    const text = msg();
    expect(text).toContain("https://staff.barkinbeautiful.com.au/book");
    expect(text).not.toContain("moego");
  });

  /** A "book here" link to a page that refuses bookings is worse than none. */
  it("asks them to ring when online booking is switched off", () => {
    const text = msg({ bookingUrl: null, salonPhone: "07 3823 4567" });
    expect(text).not.toContain("Book here");
    expect(text).toContain("Give us a ring on 07 3823 4567");
  });

  it("still says something useful with no link and no phone", () => {
    expect(msg({ bookingUrl: null, salonPhone: null })).toContain("Reply to this message");
  });

  it("greets a client whose first name we do not hold", () => {
    expect(msg({ clientFirstName: null })).toContain("Hi there,");
  });

  /**
   * Two segments at most. Twilio bills per segment and the opt-out
   * footer ("Reply STOP to opt out") is appended on top of whatever this
   * returns, so the budget here is not the whole 320.
   */
  it("fits in two segments with room for the opt-out footer", () => {
    expect(msg().length).toBeLessThanOrEqual(290);
  });
});
