import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  buildBookingConfirmationSms, decideBookingConfirmation, CONFIRMATION_SKIP_LABEL,
} from "../shared/bookingConfirmationSms";

const NOW = new Date("2026-10-26T04:00:00Z"); // Mon 26 Oct, 14:00 Brisbane
const FUTURE = new Date("2026-10-29T23:00:00Z"); // Fri 30 Oct, 09:00 Brisbane — 10-30T23:00Z is SATURDAY

const live = {
  automationEnabled: true,
  confirmationSmsSentAt: null,
  clientPhone: "0427030788",
  moegoAppointmentId: null,
  bookedOnline: false,
  scheduledStart: FUTURE,
  status: "confirmed",
  workflowState: "scheduled",
  smsOptedOutAt: null,
  localHour: 10,
  now: NOW,
};

describe("buildBookingConfirmationSms", () => {
  it("says the appointment IS booked", () => {
    // The online-booking text deliberately says "we'll confirm" because
    // nothing is held. A staff member booking it means it is held, and
    // sending both wordings for one appointment contradicts itself.
    const sms = buildBookingConfirmationSms({
      clientFirstName: "Annie", petNames: ["Agnes"],
      date: "Friday 30 October", time: "9:00 am", groomer: "Megs",
    });
    expect(sms).toContain("is booked for Friday 30 October at 9:00 am");
    expect(sms).toContain("with Megs");
    expect(sms).not.toMatch(/confirm/i);
  });

  it("reads properly with nobody assigned yet", () => {
    const sms = buildBookingConfirmationSms({
      clientFirstName: "Annie", petNames: ["Agnes"],
      date: "Friday 30 October", time: "9:00 am", groomer: null,
    });
    expect(sms).not.toContain("with ");
    expect(sms).toContain("Agnes's grooming appointment");
  });

  it("falls back to the salon's name rather than printing nothing", () => {
    const sms = buildBookingConfirmationSms({
      clientFirstName: "Annie", petNames: ["Agnes"], date: "Fri", time: "9am", salonName: "  ",
    });
    expect(sms).toContain("Barkin' Beautiful");
  });

  it("stays inside a single SMS segment for a typical booking", () => {
    // Longer than 160 chars splits into two billed messages.
    const sms = buildBookingConfirmationSms({
      clientFirstName: "Annie", petNames: ["Agnes"],
      date: "Friday 30 October", time: "9:00 am", groomer: "Megs",
    });
    // 160 is the GSM-7 limit. This message carries an emoji so it
    // encodes as UCS-2 and bills as 2 segments — the reminders do the
    // same, so it is house style. The cap is here to stop it growing,
    // not to claim one segment.
    expect(sms.length).toBeLessThanOrEqual(160);
  });
});

describe("decideBookingConfirmation", () => {
  it("sends for a normal staff booking", () => {
    expect(decideBookingConfirmation(live)).toEqual({ send: true });
  });

  it("REFUSES anything carrying a MoeGo id", () => {
    // The Monday sync writes hundreds of rows at a time. It uses direct
    // SQL today, which never reaches this code — but that is how the sync
    // happens to be written, not a guarantee. One refactor and the salon
    // texts its whole forward book in a single run, with no undo.
    for (const id of ["124259135", 124259135]) {
      expect(decideBookingConfirmation({ ...live, moegoAppointmentId: id }))
        .toEqual({ send: false, reason: "imported" });
    }
  });

  it("never sends twice for the same appointment", () => {
    expect(decideBookingConfirmation({ ...live, confirmationSmsSentAt: new Date() }))
      .toEqual({ send: false, reason: "already_sent" });
  });

  it("stays silent when SMS automation is off", () => {
    expect(decideBookingConfirmation({ ...live, automationEnabled: false }))
      .toEqual({ send: false, reason: "automation_off" });
  });

  it("leaves online bookings to their own message", () => {
    expect(decideBookingConfirmation({ ...live, bookedOnline: true }))
      .toEqual({ send: false, reason: "booked_online" });
  });

  it("does not text about an appointment that has already happened", () => {
    // 368 August appointments were advanced on 26/10/2026. None of those
    // owners want a text saying their dog is booked in.
    expect(decideBookingConfirmation({ ...live, scheduledStart: new Date("2026-08-10T00:00:00Z") }))
      .toEqual({ send: false, reason: "in_the_past" });
  });

  it("does not text about a cancelled or no-show booking", () => {
    expect(decideBookingConfirmation({ ...live, status: "cancelled" }))
      .toEqual({ send: false, reason: "not_live" });
    expect(decideBookingConfirmation({ ...live, workflowState: "no_show" }))
      .toEqual({ send: false, reason: "not_live" });
  });

  it("skips a client with no number rather than erroring", () => {
    for (const phone of [null, undefined, "", "   "]) {
      expect(decideBookingConfirmation({ ...live, clientPhone: phone }))
        .toEqual({ send: false, reason: "no_phone" });
    }
  });

  it("checks the gate before anything else", () => {
    // With automation off, nothing else should be able to flip it on.
    expect(decideBookingConfirmation({
      ...live, automationEnabled: false, moegoAppointmentId: null, bookedOnline: false,
    })).toEqual({ send: false, reason: "automation_off" });
  });

  it("refuses an unusable date rather than guessing", () => {
    expect(decideBookingConfirmation({ ...live, scheduledStart: "not a date" }))
      .toEqual({ send: false, reason: "in_the_past" });
  });

  it("names every skip reason in plain words", () => {
    // These go in the log a human reads when a client says they got
    // nothing, so none may be missing.
    for (const key of Object.keys(CONFIRMATION_SKIP_LABEL)) {
      expect(CONFIRMATION_SKIP_LABEL[key as keyof typeof CONFIRMATION_SKIP_LABEL]).toBeTruthy();
    }
    expect(Object.keys(CONFIRMATION_SKIP_LABEL)).toHaveLength(12);
  });
});

describe("one booking, one text", () => {
  it("names every dog rather than texting once per dog", () => {
    // A two-dog family is two appointment rows and one trip. Lauren's
    // rule for the pickup message, 13/10/2026, and the same reasoning.
    const sms = buildBookingConfirmationSms({
      clientFirstName: "Annie", petNames: ["Agnes", "Shirley"],
      date: "Friday 30 October", time: "9:00 am", groomer: "Megs",
    });
    expect(sms).toContain("Agnes and Shirley");
    expect(sms).toContain("are booked for");
    expect(sms.match(/booked/g)).toHaveLength(1);
  });

  it("uses the singular for one dog", () => {
    const sms = buildBookingConfirmationSms({
      clientFirstName: "Annie", petNames: ["Agnes"],
      date: "Friday 30 October", time: "9:00 am",
    });
    expect(sms).toContain("Agnes's grooming appointment");
    expect(sms).toContain("is booked");
  });

  it("does not greet a nameless client with \"Hi !\"", () => {
    for (const blank of ["", "   ", undefined as unknown as string]) {
      expect(buildBookingConfirmationSms({
        clientFirstName: blank, petNames: ["Agnes"], date: "Fri", time: "9am",
      })).toContain("Hi there!");
    }
  });
});

describe("rules added after review", () => {
  it("refuses a client who has replied STOP", () => {
    // The mass-text path already honours this column. An automated text
    // to somebody who opted out is the one that is never excusable.
    expect(decideBookingConfirmation({ ...live, smsOptedOutAt: new Date() }))
      .toEqual({ send: false, reason: "opted_out" });
  });

  it("refuses a booking that is only pending", () => {
    // A pending row is a request nobody has approved. Telling that
    // client it "is booked" is worse than telling them nothing.
    expect(decideBookingConfirmation({ ...live, status: "pending" }))
      .toEqual({ send: false, reason: "not_confirmed" });
  });

  it("will not land a text in the middle of the night", () => {
    for (const hour of [0, 3, 6, 19, 22, 23]) {
      expect(decideBookingConfirmation({ ...live, localHour: hour }))
        .toEqual({ send: false, reason: "quiet_hours" });
    }
    for (const hour of [7, 9, 13, 18]) {
      expect(decideBookingConfirmation({ ...live, localHour: hour })).toEqual({ send: true });
    }
  });

  it("skips the clock check when no hour is supplied", () => {
    const { localHour, ...noHour } = live;
    expect(decideBookingConfirmation(noHour)).toEqual({ send: true });
  });
});

/**
 * A delegation check, not a behaviour grep.
 *
 * The first version of this feature was wired to calendar.createAppointment,
 * which the client declares at Calendar.tsx:1307 and never invokes. Every
 * test passed, because every test exercised the pure functions and nothing
 * exercised the wiring. The feature would have texted nobody, and it would
 * have been found by Andy booking a dog and getting no message.
 */
describe("the live booking path actually sends", () => {
  const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

  /**
   * The check that matters: the confirmation is wired to the path the
   * app ACTUALLY uses. It was once attached only to a procedure
   * nothing called, so every booking went out unconfirmed and the
   * tests were green throughout.
   *
   * It used to pin the exact argument list, which broke the moment a
   * third argument was added on 28/10/2026 to let staff suppress the
   * text for a back-filled booking — a change that did not touch the
   * wiring at all. Matching the call rather than its spelling tests
   * the thing this comment claims.
   */
  it("calls the helper from createMultiPetAppointment, the path the app uses", () => {
    const multiPet = routers.slice(routers.indexOf("createMultiPetAppointment: operationalProcedure"));
    const body = multiPet.slice(0, multiPet.indexOf("\n  addPetsToSharedAppointment"));
    expect(body).toMatch(/sendBookingConfirmation\(\s*db,\s*createdAppointmentIds/);
  });

  it("passes every row of the booking, not just the first", () => {
    // Claiming per row would text a two-dog family twice, each message
    // naming one dog.
    expect(routers).toContain("createdAppointmentIds.push(appointmentId)");
    expect(routers).not.toMatch(/sendBookingConfirmation\(db, \[createdAppointmentIds\[0\]\]\)/);
  });

  it("has exactly the call sites it is meant to have", () => {
    // Two: the live multi-pet path, and the dead single path kept in
    // step so the two cannot diverge. A third appearing without a group
    // design would mean a series texting once per occurrence.
    expect(routers.match(/await sendBookingConfirmation\(/g) ?? []).toHaveLength(2);
  });
});

describe("not texting a booking the client already has", () => {
  const base = {
    automationEnabled: true,
    confirmationSmsSentAt: null,
    clientPhone: "0400000000",
    moegoAppointmentId: null,
    bookedOnline: false,
    status: "confirmed",
    workflowState: "scheduled",
    localHour: 10,
    now: new Date("2026-10-28T00:00:00Z"),            // 10am Brisbane
    scheduledStart: new Date("2026-10-29T00:00:00Z"), // tomorrow
  };

  it("sends for an ordinary new booking", () => {
    expect(decideBookingConfirmation(base).send).toBe(true);
  });

  /**
   * Lauren, 28/10/2026: "Kevin was in moego but not synced over to
   * Groomigo so put it in manually. It sent her a text." A booking
   * typed in by hand carries no MoeGo id, so the import guard cannot
   * see it. This is how a person says it is already arranged.
   */
  it("stays quiet when staff say it is already booked elsewhere", () => {
    const decision = decideBookingConfirmation({ ...base, alreadyArranged: true });
    expect(decision.send).toBe(false);
    expect(decision.send === false && decision.reason).toBe("already_arranged");
  });

  /**
   * Kevin's went out at 7:46 for an eight o'clock booking, to a client
   * already driving over. A confirmation is a reminder of something
   * arranged earlier; minutes beforehand it is neither.
   */
  it("stays quiet when the booking is minutes away", () => {
    const decision = decideBookingConfirmation({
      ...base,
      scheduledStart: new Date("2026-10-28T00:14:00Z"), // 14 minutes later
    });
    expect(decision.send).toBe(false);
    expect(decision.send === false && decision.reason).toBe("too_soon");
  });

  it("still sends for a same-day booking with real notice", () => {
    expect(decideBookingConfirmation({
      ...base,
      scheduledStart: new Date("2026-10-28T05:00:00Z"), // five hours later
    }).send).toBe(true);
  });

  it("keeps refusing anything already in the past", () => {
    const decision = decideBookingConfirmation({
      ...base, scheduledStart: new Date("2026-10-27T23:00:00Z"),
    });
    expect(decision.send === false && decision.reason).toBe("in_the_past");
  });
});
