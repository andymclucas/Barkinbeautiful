import { isDeadAppointment, type SummarisableAppointment } from "./calendarSummary";

export type SiblingCandidate = SummarisableAppointment & {
  id: number;
  sessionId?: string | null;
  /**
   * When this dog is due. Optional, so a caller that does not have it
   * keeps the old session-only behaviour rather than silently losing
   * siblings; the calendar always has it.
   */
  scheduledStart?: Date | string | number | null;
};

/**
 * The instant a row starts, as a comparable key. Null when absent or
 * unparseable — two rows that both lack a time are treated as agreeing,
 * which is what keeps a caller without the field working as before.
 */
function startKey(appt: SiblingCandidate): string | null {
  const value = appt.scheduledStart;
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? String(ms) : null;
}

/**
 * The other pets sharing a booking, as the calendar should draw them.
 *
 * A session keeps holding a dog after it is cancelled, which is right for
 * history and wrong for the block on the calendar: the card builds its name
 * and its shared price from the siblings, so one cancelled dog made a one-dog
 * booking read "Murphy & Eddie smithson · 2 DOGS".
 *
 * Seen on 09/10/2026 and reported as a duplicate booking. The two smithson
 * dogs sat in DIFFERENT sessions, and each of those sessions also held the
 * other dog as a cancelled row, so the calendar drew two two-dog blocks for
 * what was really one two-dog booking.
 *
 * A cancelled dog gets no siblings either, so it is drawn on its own rather
 * than borrowing the names of the dogs still coming in.
 *
 * ## A dog at a different time is not on this card
 *
 * Andy, 09/11/2026, with a photo of Kate Condon's thread: "I did move both
 * appointments last week to 12pm for the owner. Don't know why it's saying
 * 8am & 12pm."
 *
 * Only Molly moved. Minnie's row was still 08:00 and the reminders were
 * telling the truth — but the BOARD said "Molly & Minnie · 2 DOGS · 12:00
 * pm", because a session was collapsed to one card whatever its rows said,
 * and that card took its time from the lowest id. Molly's id is 1200688 and
 * Minnie's is 2580020, so the 12:00 row won and Minnie's 08:00 row was not
 * drawn at all. A dog was due at the salon and was on nobody's column.
 *
 * So a sibling now has to share the start time. A booking whose dogs are
 * genuinely staggered draws one card per time, each naming only the dogs at
 * that time, which is what the column already had to be able to show.
 */
export function liveSiblings<T extends SiblingCandidate>(appt: T, sessionMembers: T[]): T[] {
  if (!appt.sessionId) return [];
  if (isDeadAppointment(appt)) return [];
  const mine = startKey(appt);
  return sessionMembers.filter(
    (other) =>
      other.id !== appt.id && !isDeadAppointment(other) && startKey(other) === mine,
  );
}

/**
 * What the calendar collapses a card by.
 *
 * It must agree with liveSiblings: the card's NAME comes from the siblings
 * and the card's EXISTENCE comes from this key, and when the two disagree a
 * row is either drawn twice or not drawn at all. Keying on the session
 * alone is what hid Minnie above.
 */
export function bookingCardKey<T extends SiblingCandidate>(appt: T): string {
  return `${appt.sessionId ?? ""}@${startKey(appt) ?? ""}`;
}
