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
  /**
   * Who the dog is against, which is the column it is drawn in. Optional
   * for the same reason as scheduledStart: a caller without the field
   * narrows nothing.
   */
  staffId?: number | string | null;
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
 * Which column a dog sits in, as a comparable key. Nobody assigned is a
 * column of its own — the Unassigned strip — so null and undefined both
 * read as "none" and group together.
 */
function columnKey(appt: SiblingCandidate): string {
  const value = appt.staffId;
  if (value === null || value === undefined) return "none";
  const id = Number(value);
  return Number.isFinite(id) ? String(id) : String(value);
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
 *
 * ## This stays booking-wide, on purpose
 *
 * It does NOT narrow by column. Andy, 09/11/2026: "Booking should span both
 * columns still." The shared price, the booking total and the edit dialog
 * are facts about the BOOKING and must not shrink because the two dogs went
 * to two groomers. Only the card's NAME narrows — see sameColumnSiblings.
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
 * The siblings this card actually DRAWS — the ones in its own column.
 *
 * Andy, 09/11/2026, with a photo of the Wednesday board: "There is also
 * duplicates for Nov 11 for Benji & Sweety Graham — they are under Stephanie
 * & also in unassigned. How does this happen?"
 *
 * They were not duplicates. Benji (1200221) had no groomer and Sweety
 * (2550079) was Stephanie's, one appointment each, both at 08:00, so the
 * board correctly drew a card in each column. But each card took its name
 * from the whole booking, so BOTH read "Benji & Sweety Graham · 2 dogs".
 * The same pair of names in two columns reads as one booking entered twice.
 *
 * Splitting a family across two groomers so the dogs go through together is
 * normal here — 107 upcoming bookings did it on 09/11/2026, so 107 pairs of
 * cards were naming each other's dogs.
 *
 * A card names the dogs it stands for. Everything else about the booking —
 * the total, the pricing panel, the edit dialog, the dog COUNT on the family
 * line — stays whole, because the booking does.
 */
export function sameColumnSiblings<T extends SiblingCandidate>(appt: T, siblings: T[]): T[] {
  const mine = columnKey(appt);
  return siblings.filter((other) => columnKey(other) === mine);
}

/**
 * What the calendar collapses a card by.
 *
 * It must agree with liveSiblings: the card's NAME comes from the siblings
 * and the card's EXISTENCE comes from this key, and when the two disagree a
 * row is either drawn twice or not drawn at all. Keying on the session
 * alone is what hid Minnie above.
 *
 * A cancelled or no-show row therefore gets a key of its own. liveSiblings
 * gives it no siblings and gives it to nobody, so collapsing it with a live
 * dog could only go wrong — and did: the collapse keeps the LOWEST id, so
 * Cleo Speck's cancelled 08:30 row on 10/09/2026 (840002) was drawn and
 * Jamie's live row beside it (840003) was dropped from the board entirely,
 * named nowhere, while Jamie was in fact groomed that day.
 */
export function bookingCardKey<T extends SiblingCandidate>(appt: T): string {
  if (isDeadAppointment(appt)) return `dead:${appt.id}`;
  return `${appt.sessionId ?? ""}@${startKey(appt) ?? ""}`;
}

/**
 * Which cards a calendar column draws, and which dogs each one names.
 *
 * The key is the id of the appointment DRAWN — the lowest id of each
 * card — and the value is the other dogs collapsed into it. An
 * appointment absent from the map is not drawn in this column; one
 * present with an empty array is drawn on its own.
 *
 * Both halves have to come from one place. The card's existence is
 * decided by bookingCardKey and its name by its members, and every bug
 * on this board has been the two disagreeing: a dog named on a card it
 * was not on (Benji and Sweety Graham, 09/11/2026), or a dog drawn on no
 * card at all (Minnie Condon, 11/11/2026; Jamie Speck, 10/09/2026).
 *
 * Takes the column's own appointments, so the caller's definition of a
 * column is the one that applies — the Daycare pseudo-column owns a dog
 * by its service rather than by who is against it.
 */
export function columnCardMembers<T extends SiblingCandidate>(
  columnAppts: T[],
): Map<number, T[]> {
  const byKey = new Map<string, T[]>();
  for (const appt of columnAppts) {
    if (!appt.sessionId) continue;
    const key = bookingCardKey(appt);
    const members = byKey.get(key) ?? [];
    members.push(appt);
    byKey.set(key, members);
  }
  const drawn = new Map<number, T[]>();
  for (const members of byKey.values()) {
    const primary = members.reduce((lowest, member) => (member.id < lowest.id ? member : lowest));
    drawn.set(
      primary.id,
      members.filter((member) => member.id !== primary.id),
    );
  }
  return drawn;
}
