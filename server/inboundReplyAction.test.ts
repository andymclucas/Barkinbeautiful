import { describe, expect, it } from "vitest";
import { calculateSmsCost } from "../shared/smsSegments";
import { REPLY_PROMPT } from "../shared/replyPrompt";
import { buildBookingConfirmationSms } from "../shared/bookingConfirmationSms";
import { buildAppointmentReminderSms, buildReadyForPickupSms } from "./sms";
import { classifyInboundReply } from "./inboundSms";
import {
  decideReplyAction, describeReplyRefusal, REPLY_MATCH_WINDOW_DAYS,
  type ReplyCandidate,
} from "../shared/inboundReplyAction";

const sentAt = new Date("2026-11-06T22:00:00Z");       // Brisbane morning
const receivedAt = new Date("2026-11-06T22:05:00Z");   // five minutes later
const future = new Date("2026-11-09T23:00:00Z");

const appt = (over: Partial<ReplyCandidate> = {}): ReplyCandidate => ({
  id: 1, workflowState: "scheduled", status: "confirmed", scheduledStart: future, ...over,
});

describe("the automated texts ask for the reply they rely on", () => {
  /* No groomer: Lauren asked for the name to come off on 09/11/2026
     and the builders no longer take one. It lingered here because
     tsconfig.json excludes test files from the typecheck, so a test can
     pass a property that no longer exists and nothing says so. */
  const reminderArgs = {
    clientFirstName: "Sarah", petNames: ["Bella"], date: "Fri 7 Nov",
    time: "9:00 am", salonName: "Barkin Beautiful",
  };

  it("puts the prompt on the confirmation and every reminder stage", () => {
    const confirmation = buildBookingConfirmationSms(reminderArgs);
    expect(confirmation).toContain(REPLY_PROMPT);
    for (const stage of ["4d", "2d", "day_before", undefined] as const) {
      expect(buildAppointmentReminderSms({ ...reminderArgs, stage }), String(stage))
        .toContain(REPLY_PROMPT);
    }
  });

  it("keeps every one of them to a single GSM-7 segment", () => {
    /*
     * The reason the paw print went. One non-GSM character forces UCS-2,
     * which cuts a segment from 160 characters to 70 — the confirmation
     * was 119 characters and billed as TWO segments for one emoji, and
     * adding this prompt on top would have made three. These run on every
     * booking and three times again as reminders, so a second segment is
     * a standing bill, not a rounding error.
     */
    const bodies = [
      buildBookingConfirmationSms(reminderArgs),
      ...(["4d", "2d", "day_before", undefined] as const).map((stage) =>
        buildAppointmentReminderSms({ ...reminderArgs, stage })),
    ];
    for (const body of bodies) {
      const cost = calculateSmsCost(body);
      expect(cost.encoding, body).toBe("GSM-7");
      expect(cost.forcedUnicode, body).toBe(false);
      expect(cost.segments, `${cost.length} chars: ${body}`).toBe(1);
    }
  });

  it("still fits one segment for a realistic two-dog booking", () => {
    /*
     * Grounded in the actual book rather than a guess: of 1,048 upcoming
     * bookings, 813 are one dog and 217 are two, and the average pet name
     * is 5.3 characters. So this — two dogs, average-length names — is
     * the case that has to fit, and it covers 99% of what the salon sends.
     */
    const two = {
      clientFirstName: "Sarah", petNames: ["Bella", "Max"], date: "Wed 24 Dec",
      time: "11:30 am", groomer: "Charlotte", salonName: "Barkin Beautiful",
    };
    const bodies = [
      buildBookingConfirmationSms(two),
      ...(["4d", "2d", "day_before", undefined] as const).map((stage) =>
        buildAppointmentReminderSms({ ...two, stage })),
    ];
    for (const body of bodies) {
      const cost = calculateSmsCost(body);
      expect(cost.segments, `${cost.length} chars: ${body}`).toBe(1);
    }
  });

  it("stays GSM-7 even when an unusual booking does spill to two segments", () => {
    /*
     * An honest limit rather than a claim that everything fits. Two dogs
     * with names twice the average, on a long date, runs past 160 — and
     * that is fine. What must NOT come back is the encoding regression:
     * UCS-2 halves the segment to 70 characters, so a message that spills
     * to 2 segments in GSM-7 would be 3 with an emoji in it.
     *
     * Worth keeping in proportion. Before this change EVERY one of these
     * was two segments, because of one paw print. Now the great majority
     * are one.
     */
    const heavy = {
      clientFirstName: "Christopher", petNames: ["Bartholomew", "Persephone"],
      date: "Wed 24 Dec", time: "11:30 am", groomer: "Charlotte",
      salonName: "Barkin Beautiful",
    };
    const cost = calculateSmsCost(buildBookingConfirmationSms(heavy));
    expect(cost.encoding).toBe("GSM-7");
    expect(cost.forcedUnicode).toBe(false);
    expect(cost.segments).toBeLessThanOrEqual(2);
  });

  it("does NOT put it on the ready-for-pickup text", () => {
    // There is nothing left to confirm or cancel: the dog is clean and
    // waiting at the counter. "Reply N to cancel" there is nonsense.
    expect(buildReadyForPickupSms({
      clientFirstName: "Sarah", petNames: ["Bella"], salonName: "Barkin Beautiful",
    })).not.toContain(REPLY_PROMPT);
  });

  it("is answerable by what the classifier actually recognises", () => {
    // The prompt and the parser have to agree, or the salon invites a
    // reply it then cannot read.
    expect(classifyInboundReply("Y")).toBe("confirm");
    expect(classifyInboundReply("N")).toBe("cancel");
    expect(classifyInboundReply("n")).toBe("cancel");
    expect(classifyInboundReply("N.")).toBe("cancel");
  });
});

describe("only an N changes anything by itself", () => {
  it("never acts on a Y", () => {
    // Andy, 06/11/2026: "only changes if N response is received." A
    // confirmation changes nothing operationally, so it stays the one-tap
    // staff review it already was.
    expect(decideReplyAction({
      intent: "confirm", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt()], receivedAt,
    })).toEqual({ act: false, reason: "not_a_cancellation" });
  });

  it("never acts on something it could not read", () => {
    expect(decideReplyAction({
      intent: "unknown", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt()], receivedAt,
    })).toEqual({ act: false, reason: "not_a_cancellation" });
  });

  it("cancels EVERY dog on the booking, not just the one logged", () => {
    /*
     * The trap this function exists for. One reminder covers a whole
     * booking — groupRemindersByBooking groups by (client, start), so
     * "Bella and Max's grooming appointment" is one text — but smsLogs
     * stores only the LEAD appointment's id. Acting on that id alone
     * would take Bella off the board and leave Max on it, for a client
     * who just told us neither was coming.
     */
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt({ id: 11 }), appt({ id: 12 })], receivedAt,
    })).toEqual({ act: true, appointmentIds: [11, 12] });
  });
});

describe("what it refuses to cancel on one letter", () => {
  it("refuses when the dog has already been checked in", () => {
    // The dog is at the salon, possibly wet. A text cannot undo that, and
    // it is the same rule the MoeGo sync works to: only ever act on a row
    // still at `scheduled`.
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt({ workflowState: "bathing" })], receivedAt,
    })).toEqual({ act: false, reason: "already_arrived" });
  });

  it("refuses when ANY dog on the booking has arrived", () => {
    // Half-cancelling a booking is worse than not acting.
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt({ id: 11 }), appt({ id: 12, workflowState: "checked_in" })],
      receivedAt,
    })).toEqual({ act: false, reason: "already_arrived" });
  });

  it("refuses a reply that arrives long after the text it answers", () => {
    // Otherwise an "N" meaning something else entirely cancels a booking
    // off the back of a three-week-old confirmation.
    const old = new Date(receivedAt.getTime() - (REPLY_MATCH_WINDOW_DAYS + 1) * 86_400_000);
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: old,
      bookingAppointments: [appt()], receivedAt,
    })).toEqual({ act: false, reason: "message_too_old" });
  });

  it("still acts at the very edge of the window", () => {
    const edge = new Date(receivedAt.getTime() - REPLY_MATCH_WINDOW_DAYS * 86_400_000);
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: edge,
      bookingAppointments: [appt()], receivedAt,
    })).toEqual({ act: true, appointmentIds: [1] });
  });

  it("refuses when there is no message to tie the reply to", () => {
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: null,
      bookingAppointments: [appt()], receivedAt,
    })).toEqual({ act: false, reason: "no_matching_message" });
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: sentAt,
      bookingAppointments: [], receivedAt,
    })).toEqual({ act: false, reason: "no_matching_message" });
  });

  it("refuses a booking that has started or passed", () => {
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt({ scheduledStart: new Date(receivedAt.getTime() - 1) })],
      receivedAt,
    })).toEqual({ act: false, reason: "not_upcoming" });
  });

  it("is idempotent: a second delivery of the same reply changes nothing", () => {
    // Twilio retries. The first N cancels; the second finds nothing live
    // and says so rather than writing again.
    expect(decideReplyAction({
      intent: "cancel", matchedMessageSentAt: sentAt,
      bookingAppointments: [appt({ status: "cancelled" })], receivedAt,
    })).toEqual({ act: false, reason: "already_cancelled" });
  });

  it("gives every refusal a line a person can read", () => {
    const reasons = [
      "not_a_cancellation", "no_matching_message", "message_too_old",
      "already_cancelled", "not_upcoming", "already_arrived",
    ] as const;
    for (const reason of reasons) {
      expect(describeReplyRefusal(reason), reason).toBeTruthy();
    }
  });
});
