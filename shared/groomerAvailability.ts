/**
 * What a groomer already has on, while you are booking into their day.
 *
 * The New Appointment dialog offered every half-hour from 7am to 6pm
 * regardless of who was selected, so the only way to find out Charlotte
 * was already on a Mastiff at 10:30 was to book it and look at the board
 * afterwards. Two dogs, one groomer, one slot.
 *
 * ## Warn, don't block
 *
 * This marks and warns; it never refuses. The salon squeezes dogs in for
 * real reasons — a quick nail trim beside a long groom, a family that
 * can only come at one time — and `createAppointment` already carries
 * that reasoning for the daily clip cap: "a system that refused would
 * simply be worked around". Hiding busy slots would also contradict
 * itself, since booking over one has to stay possible for the warning to
 * have anything to warn about.
 *
 * So every slot stays in the list, the taken ones say what is in the way,
 * and going ahead costs one extra confirmation.
 *
 * ## Minutes, not Dates
 *
 * Everything here is minutes from midnight in the SALON's day. A Date
 * built in the browser is read in the browser's zone and lands an hour
 * out for anyone outside Brisbane, which is the bug `e6a4662` fixed and
 * `shared/bookingTimeSlots.ts` is careful to avoid. The server converts
 * once, at the edge.
 */

export type BusyKind = "appointment" | "blockout";

export type BusyInterval = {
  /** Minutes from midnight, salon time. */
  startMinutes: number;
  /** Exclusive. A 9:00–10:00 groom does not collide with a 10:00 start. */
  endMinutes: number;
  kind: BusyKind;
  /** "Buddy (Smith)" or "Annual leave" — what to name in the warning. */
  label: string;
};

/**
 * Half-open overlap: [aStart, aEnd) against [bStart, bEnd).
 *
 * Touching ends do NOT overlap, which is the whole point — the salon
 * books back-to-back all day and a 10:00 start after a 10:00 finish is
 * the normal case, not a clash.
 */
export function intervalsOverlap(
  aStart: number, aEnd: number, bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Everything in the groomer's day that the proposed booking runs into. */
export function clashesFor(
  startMinutes: number,
  endMinutes: number,
  busy: readonly BusyInterval[],
): BusyInterval[] {
  // A zero- or negative-length booking cannot overlap anything, and
  // treating it as if it did would warn on every slot.
  if (!(endMinutes > startMinutes)) return [];
  return busy
    .filter((b) => intervalsOverlap(startMinutes, endMinutes, b.startMinutes, b.endMinutes))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export type SlotStatus<T> = T & {
  /** What this slot runs into, given the booking's length. Empty is free. */
  clashes: BusyInterval[];
  busy: boolean;
};

/**
 * Mark each offered slot with what a booking starting there would hit.
 *
 * The duration matters: a 30-minute nail trim at 10:00 is free where a
 * three-hour Giant groom at the same time is not. Passing a duration of
 * 0 or less falls back to the slot's own start, so a half-filled form
 * still marks the obvious collisions instead of marking nothing.
 */
export function annotateSlots<T extends { value: string }>(
  slots: readonly T[],
  busy: readonly BusyInterval[],
  durationMinutes: number,
  toMinutes: (value: string) => number | null,
): SlotStatus<T>[] {
  const span = durationMinutes > 0 ? durationMinutes : 1;
  return slots.map((slot) => {
    const start = toMinutes(slot.value);
    if (start === null) return { ...slot, clashes: [], busy: false };
    const clashes = clashesFor(start, start + span, busy);
    return { ...slot, clashes, busy: clashes.length > 0 };
  });
}

/** 570 → "9:30am", for naming a clash inside a sentence. */
export function shortTime(minutesFromMidnight: number): string {
  const h24 = Math.floor(minutesFromMidnight / 60) % 24;
  const m = minutesFromMidnight % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? "am" : "pm";
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Midnight to midnight: a full-day blockout, stored as 0 to 24 x 60. */
const DAY_END_MINUTES = 24 * 60;

/**
 * "10am–1pm Link (Mastiff X)" — one clash, said in full.
 *
 * A full-day blockout is named rather than given a span: it runs 0 to
 * 1440, and both ends format as "12am", so it read "12am–12am Annual
 * leave".
 */
export function describeClash(clash: BusyInterval): string {
  if (clash.startMinutes <= 0 && clash.endMinutes >= DAY_END_MINUTES) {
    return `${clash.label} (all day)`;
  }
  return `${shortTime(clash.startMinutes)}–${shortTime(clash.endMinutes)} ${clash.label}`;
}

/**
 * The sentence shown before a double booking goes ahead.
 *
 * It names the groomer and what is already there, because "this slot is
 * taken" tells staff nothing they can act on — whether to go ahead
 * depends entirely on WHAT is in the way, and a blockout is a different
 * decision from a dog.
 */
export function clashWarning(
  clashes: readonly BusyInterval[],
  groomerName: string,
): string | null {
  if (clashes.length === 0) return null;
  const who = groomerName.trim() || "This groomer";
  const leave = clashes.filter((c) => c.kind === "blockout");
  if (leave.length > 0 && clashes.length === leave.length) {
    return `${who} is not working then — ${leave.map(describeClash).join(", ")}.`;
  }
  const listed = clashes.slice(0, 3).map(describeClash).join(", ");
  const more = clashes.length > 3 ? `, and ${clashes.length - 3} more` : "";
  return clashes.length === 1
    ? `${who} already has ${listed} booked at that time.`
    : `${who} already has ${clashes.length} things booked at that time: ${listed}${more}.`;
}
