import { describe, it, expect } from "vitest";
import {
  decideCancellationSms, decideRescheduleSms,
  buildCancellationSms, buildRescheduleSms,
} from "@shared/appointmentChangeSms";

/** Brisbane is UTC+10 with no DST, so this is 10am Friday 6 Nov local. */
const FRI_10AM = new Date("2026-11-06T00:00:00Z");
const SAT_10AM = new Date("2026-11-07T00:00:00Z");
const NOW_TUE = new Date("2026-11-03T00:00:00Z").getTime();

const cancelBase = {
  automationEnabled: true, policyAllows: true,
  cancellationSmsSentAt: null, clientPhone: "0400000000",
  scheduledStart: FRI_10AM, status: "cancelled", workflowState: "cancelled",
  localHour: 10, now: NOW_TUE,
};

const moveBase = {
  automationEnabled: true, policyAllows: true,
  previousStart: FRI_10AM, scheduledStart: SAT_10AM,
  rescheduleSmsSentFor: null, clientPhone: "0400000000",
  status: "confirmed", workflowState: "scheduled",
  localHour: 10, now: NOW_TUE,
};

describe("decideCancellationSms", () => {
  it("tells a client their future booking is off", () => {
    expect(decideCancellationSms(cancelBase)).toEqual({ send: true });
  });

  it("refuses when the booking is not actually cancelled", () => {
    expect(decideCancellationSms({ ...cancelBase, status: "confirmed", workflowState: "scheduled" }))
      .toEqual({ send: false, reason: "not_cancelled" });
  });

  it("reads cancelled from either column", () => {
    expect(decideCancellationSms({ ...cancelBase, status: "confirmed" }).send).toBe(true);
    expect(decideCancellationSms({ ...cancelBase, workflowState: "scheduled" }).send).toBe(true);
  });

  it("never texts about an appointment that has already happened", () => {
    // 368 August rows were advanced in one afternoon on 26/10/2026.
    expect(decideCancellationSms({ ...cancelBase, now: new Date("2026-12-01").getTime() }))
      .toEqual({ send: false, reason: "in_the_past" });
  });

  it("stays silent for a client who replied STOP", () => {
    expect(decideCancellationSms({ ...cancelBase, smsOptedOutAt: new Date() }))
      .toEqual({ send: false, reason: "opted_out" });
  });

  it("is idempotent once claimed", () => {
    expect(decideCancellationSms({ ...cancelBase, cancellationSmsSentAt: new Date() }))
      .toEqual({ send: false, reason: "already_sent" });
  });

  it("checks the allow-list before anything is claimed", () => {
    expect(decideCancellationSms({ ...cancelBase, policyAllows: false }))
      .toEqual({ send: false, reason: "policy_off" });
    expect(decideCancellationSms({ ...cancelBase, automationEnabled: false }))
      .toEqual({ send: false, reason: "automation_off" });
  });

  /*
   * The difference from the confirmation that matters most: a
   * cancellation the night before MUST go, or the client drives in.
   */
  it("overrides quiet hours when the dog is due inside 24 hours", () => {
    const eveningBefore = new Date("2026-11-05T12:00:00Z").getTime(); // 10pm Thu local
    expect(decideCancellationSms({ ...cancelBase, localHour: 22, now: eveningBefore }))
      .toEqual({ send: true });
  });

  it("but waits overnight when there is still a working day to tell them", () => {
    expect(decideCancellationSms({ ...cancelBase, localHour: 22 }))
      .toEqual({ send: false, reason: "quiet_hours" });
    expect(decideCancellationSms({ ...cancelBase, localHour: 5 }))
      .toEqual({ send: false, reason: "quiet_hours" });
  });

  it("has no minimum lead time, unlike the confirmation", () => {
    // Two hours out. A confirmation refuses this; a cancellation is the
    // one message that matters most at this range.
    const twoHoursBefore = FRI_10AM.getTime() - 2 * 3600_000;
    expect(decideCancellationSms({ ...cancelBase, now: twoHoursBefore })).toEqual({ send: true });
  });
});

describe("decideRescheduleSms", () => {
  it("tells a client their booking moved to another day", () => {
    expect(decideRescheduleSms(moveBase)).toEqual({ send: true });
  });

  /*
   * Andy's rule, and the reason this does not text hundreds of times a
   * day. Staff shuffle the board constantly.
   */
  it("says nothing when the dog only moved within the same day", () => {
    const laterSameDay = new Date(FRI_10AM.getTime() + 3 * 3600_000);
    expect(decideRescheduleSms({ ...moveBase, scheduledStart: laterSameDay }))
      .toEqual({ send: false, reason: "same_day" });
  });

  it("says nothing when nothing moved at all", () => {
    expect(decideRescheduleSms({ ...moveBase, scheduledStart: FRI_10AM }))
      .toEqual({ send: false, reason: "same_day" });
  });

  /*
   * The calendar reschedules a family one row at a time, so the
   * siblings arrive moments later and must find the booking told.
   */
  it("stays silent for the siblings of a booking already told about this day", () => {
    expect(decideRescheduleSms({ ...moveBase, rescheduleSmsSentFor: "2026-11-07" }))
      .toEqual({ send: false, reason: "already_sent" });
  });

  it("but speaks again when the booking moves a SECOND time", () => {
    const sunday = new Date("2026-11-08T00:00:00Z");
    expect(decideRescheduleSms({
      ...moveBase, previousStart: SAT_10AM, scheduledStart: sunday,
      rescheduleSmsSentFor: "2026-11-07",
    })).toEqual({ send: true });
  });

  it("and again when it moves back to the original day", () => {
    expect(decideRescheduleSms({
      ...moveBase, previousStart: SAT_10AM, scheduledStart: FRI_10AM,
      rescheduleSmsSentFor: "2026-11-07",
    })).toEqual({ send: true });
  });

  it("does not chase a cancelled booking around the diary", () => {
    expect(decideRescheduleSms({ ...moveBase, status: "cancelled" }).send).toBe(false);
    expect(decideRescheduleSms({ ...moveBase, workflowState: "no_show" }).send).toBe(false);
  });

  it("never texts about a move into the past", () => {
    expect(decideRescheduleSms({
      ...moveBase, previousStart: new Date("2026-10-01"), scheduledStart: new Date("2026-10-02"),
    })).toEqual({ send: false, reason: "in_the_past" });
  });

  it("stays silent for a client who replied STOP", () => {
    expect(decideRescheduleSms({ ...moveBase, smsOptedOutAt: new Date() }))
      .toEqual({ send: false, reason: "opted_out" });
  });
});

/**
 * Read as whole sentences. The last round of this work shipped "Albert
 * and Eddy' grooming appointment" because every assertion checked for a
 * fragment and nobody read the line.
 */
describe("the messages themselves", () => {
  it("reads correctly cancelling one dog", () => {
    expect(buildCancellationSms({
      clientFirstName: "Jo", petNames: ["Teddy"],
      date: "Friday 6 November", time: "12:30 pm",
    })).toBe(
      "Hi Jo! Teddy's grooming appointment at Barkin' Beautiful on Friday 6 November at 12:30 pm "
      + "has been cancelled. Call us any time to rebook. \u{1F43E}",
    );
  });

  it("reads correctly cancelling three", () => {
    expect(buildCancellationSms({
      clientFirstName: "Jo", petNames: ["Stella", "Belle", "Teddy"],
      date: "Friday 6 November", time: "12:30 pm",
    })).toContain("Stella, Belle and Teddy's grooming appointment");
  });

  it("reads correctly moving two dogs", () => {
    expect(buildRescheduleSms({
      clientFirstName: "Jo", petNames: ["Albert", "Eddy"],
      date: "Saturday 7 November", time: "9:00 am", groomer: "Megan",
    })).toBe(
      "Hi Jo! Albert and Eddy's grooming appointment at Barkin' Beautiful has moved to "
      + "Saturday 7 November at 9:00 am with Megan. See you then! \u{1F43E}",
    );
  });

  it("never leaves a bare apostrophe at any dog count", () => {
    for (const names of [["Teddy"], ["Albert", "Eddy"], ["Stella", "Belle", "Teddy"]]) {
      for (const build of [buildCancellationSms, buildRescheduleSms]) {
        const text = build({ clientFirstName: "Jo", petNames: names, date: "Friday", time: "9am" })
          .replace(/Barkin' Beautiful/g, "SALON");
        expect(text, names.join("+")).not.toMatch(/\w'(?![s\w])/);
      }
    }
  });

  it("drops the groomer cleanly when the dog is unassigned", () => {
    const sms = buildRescheduleSms({
      clientFirstName: "Jo", petNames: ["Teddy"], date: "Friday", time: "9am", groomer: null,
    });
    expect(sms).toContain("has moved to Friday at 9am. See you then!");
    expect(sms).not.toContain("with ");
  });

  it("falls back to a greeting rather than 'Hi !'", () => {
    expect(buildCancellationSms({ clientFirstName: "  ", petNames: ["Teddy"], date: "Fri", time: "9am" }))
      .toMatch(/^Hi there!/);
  });

  it("stays inside two SMS segments for three dogs", () => {
    for (const build of [buildCancellationSms, buildRescheduleSms]) {
      expect(build({
        clientFirstName: "Jo", petNames: ["Stella", "Belle", "Teddy"],
        date: "Wednesday 23 December", time: "12:30 pm", groomer: "Charlotte Purcell",
      }).length).toBeLessThanOrEqual(306);
    }
  });
});
