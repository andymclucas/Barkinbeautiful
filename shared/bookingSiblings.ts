import { isDeadAppointment, type SummarisableAppointment } from "./calendarSummary";

export type SiblingCandidate = SummarisableAppointment & { id: number; sessionId?: string | null };

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
 */
export function liveSiblings<T extends SiblingCandidate>(appt: T, sessionMembers: T[]): T[] {
  if (!appt.sessionId) return [];
  if (isDeadAppointment(appt)) return [];
  return sessionMembers.filter((other) => other.id !== appt.id && !isDeadAppointment(other));
}
