/**
 * Which bookings the client has already said Y to.
 *
 * Andy, 09/11/2026, looking at Jeanette Nicholaou's thread — a Y on
 * Saturday to the four-day reminder, and the two-day reminder on Monday
 * asking her the same question again: "Doesn't need a second
 * confirmation text — once the client responds with Y, then just a
 * reminder only goes out. Does not need another confirmation."
 *
 * ## Derived from the reply, not stored on the appointment
 *
 * The obvious move is a `client_confirmed_at` column. This does not add
 * one, for two reasons.
 *
 * The first is that `sms_logs` ALREADY holds the answer, and holds it
 * better: the client's own inbound message, classified `confirm`, tied
 * to the appointment the outbound text was logged against. A column
 * would be a second copy of a fact the evidence already carries, and
 * the copy is the thing that drifts.
 *
 * The second is the backlog. 102 replies came in before this existed.
 * A new column starts NULL on every one of them, so Jeanette would be
 * asked a third time tomorrow unless somebody also wrote a backfill —
 * and the backfill would have to redo exactly the booking resolution
 * below. Reading the replies needs no backfill: the evidence was always
 * there.
 *
 * It also makes the rule testable without a database, which the column
 * version is not. CLAUDE.md §6 is explicit that a schema change here is
 * migrate-first and deploy-order-sensitive; this ships tonight instead.
 *
 * ## The booking, not the row
 *
 * One reminder covers a whole family — groupRemindersByBooking groups by
 * (client, start) — but `sms_logs.appointment_id` holds only the LEAD
 * appointment's id. Keying on (clientId, scheduledStart) is what makes
 * one Y speak for every dog on it, the same key the reminder grouping
 * and the inbound-reply cancel path both already use.
 *
 * ## A move re-opens the question
 *
 * A Y agrees to an arrangement, so a Y that predates the salon moving
 * the booking to another DAY does not carry over — `rescheduleSmsSentAt`
 * is set only when the client was told about a day change, which is
 * exactly the case where the thing they agreed to is no longer what is
 * happening. A move of minutes does not set it and does not re-ask.
 */

/** One client, one start time: the key a reminder and a reply agree on. */
export function bookingKey(
  clientId: number,
  scheduledStart: Date | string | number,
): string {
  return `${clientId}|${new Date(scheduledStart).getTime()}`;
}

export type ConfirmReplyRow = {
  clientId: number | null | undefined;
  /** The start of the appointment the reply was logged against. */
  scheduledStart: Date | string | number | null | undefined;
  /** When the client's Y arrived. */
  repliedAt: Date | string | number | null | undefined;
  /**
   * When that booking was last moved to another day and the client told.
   * A Y older than this agreed to a different day.
   */
  rescheduleSmsSentAt?: Date | string | number | null;
};

/**
 * The set of bookings whose client has already confirmed.
 *
 * Rows with nothing usable in them are dropped rather than throwing: a
 * reply that cannot be tied to a booking is not evidence of anything,
 * and an exception here would stop the whole reminder run.
 */
export function confirmedBookingKeys(
  replies: readonly ConfirmReplyRow[],
): Set<string> {
  const out = new Set<string>();
  for (const reply of replies) {
    if (reply.clientId === null || reply.clientId === undefined) continue;
    if (reply.scheduledStart === null || reply.scheduledStart === undefined) continue;
    const start = new Date(reply.scheduledStart).getTime();
    if (!Number.isFinite(start)) continue;

    if (reply.rescheduleSmsSentAt && reply.repliedAt) {
      const movedAt = new Date(reply.rescheduleSmsSentAt).getTime();
      const saidYesAt = new Date(reply.repliedAt).getTime();
      if (Number.isFinite(movedAt) && Number.isFinite(saidYesAt) && saidYesAt < movedAt) {
        continue;
      }
    }

    out.add(bookingKey(reply.clientId, start));
  }
  return out;
}
