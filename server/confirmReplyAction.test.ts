import { describe, it, expect } from "vitest";
import { decideConfirmAction, decideReplyAction } from "@shared/inboundReplyAction";

const start = new Date("2026-11-12T23:00:00Z"); // Fri 13 Nov, 09:00 Brisbane
const received = new Date("2026-11-09T06:00:00Z");
const sent = new Date("2026-11-09T05:00:00Z");

const booking = (over: Partial<{ id: number; status: string; workflowState: string }>[] = [{}]) =>
  over.map((o, i) => ({
    id: o.id ?? 100 + i,
    status: o.status ?? "pending",
    workflowState: o.workflowState ?? "scheduled",
    scheduledStart: start,
  }));

const decide = (over: Partial<Parameters<typeof decideConfirmAction>[0]> = {}) =>
  decideConfirmAction({
    intent: "confirm",
    matchedMessageSentAt: sent,
    bookingAppointments: booking(),
    receivedAt: received,
    ...over,
  });

/**
 * A client's "Y" marking the booking confirmed.
 *
 * Andy set this up on 06/11/2026 so only an N acted by itself, because
 * the badge did not matter while MoeGo held the diary. He asked for the
 * Y side on 09/11/2026, the night before the salon ran entirely on
 * Groomigo, when the badge became how staff know who is coming.
 */
describe("decideConfirmAction", () => {
  it("confirms a booking the client said yes to", () => {
    expect(decide()).toEqual({ act: true, appointmentIds: [100] });
  });

  it("confirms every dog in the booking, not just the lead", () => {
    // The reason this exists at all. sms_logs holds only the lead
    // appointment's id, so confirming that alone left the second dog of
    // a family booking pending — 19 dogs of 102 on the backlog.
    const d = decide({ bookingAppointments: booking([{ id: 1 }, { id: 2 }]) });
    expect(d).toEqual({ act: true, appointmentIds: [1, 2] });
  });

  it("acts only on a confirmation", () => {
    for (const intent of ["cancel", "unknown"] as const) {
      expect(decide({ intent })).toEqual({ act: false, reason: "not_a_confirmation" });
    }
  });

  it("will not restate a booking that is already cancelled", () => {
    const d = decide({ bookingAppointments: booking([{ status: "cancelled" }]) });
    expect(d).toEqual({ act: false, reason: "already_cancelled" });
  });

  it("will not confirm a dog that has already arrived", () => {
    // A text cannot say anything useful about a dog that is at the salon.
    const d = decide({ bookingAppointments: booking([{ workflowState: "bathing" }]) });
    expect(d).toEqual({ act: false, reason: "already_arrived" });
  });

  it("will not confirm something that has already happened", () => {
    const d = decide({ receivedAt: new Date("2026-11-14T00:00:00Z") });
    expect(d).toEqual({ act: false, reason: "not_upcoming" });
  });

  it("ignores a reply that came long after the text it answers", () => {
    // Same seven-day window the cancel path uses: past that, the client
    // is almost certainly talking about something else.
    const d = decide({ matchedMessageSentAt: new Date("2026-10-01T00:00:00Z") });
    expect(d).toEqual({ act: false, reason: "message_too_old" });
  });

  it("needs a text to tie the reply to", () => {
    expect(decide({ matchedMessageSentAt: null }))
      .toEqual({ act: false, reason: "no_matching_message" });
    expect(decide({ bookingAppointments: [] }))
      .toEqual({ act: false, reason: "no_matching_message" });
  });

  it("writes nothing when the booking is already confirmed", () => {
    const d = decide({ bookingAppointments: booking([{ status: "confirmed" }]) });
    expect(d.act).toBe(false);
  });

  it("confirms only the rows that still need it", () => {
    const d = decide({ bookingAppointments: booking([{ id: 1, status: "confirmed" }, { id: 2 }]) });
    expect(d).toEqual({ act: true, appointmentIds: [2] });
  });

  it("leaves the cancel rule alone", () => {
    // Both read the same booking; a Y must never reach the cancel path.
    expect(decideReplyAction({
      intent: "confirm", matchedMessageSentAt: sent,
      bookingAppointments: booking(), receivedAt: received,
    })).toEqual({ act: false, reason: "not_a_cancellation" });
  });
});
