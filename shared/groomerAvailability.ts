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

/**
 * Build a groomer's busy list from rows already converted to salon
 * minutes.
 *
 * The conversion stays at the call site, which has the right helper for
 * its own data. What lives here are the two things that actually bite
 * when moving an appointment rather than creating one:
 *
 * - the appointment being MOVED must be excluded, or it clashes with
 *   itself and every reschedule warns;
 * - a cancelled row is not a commitment, and counting one blocks a slot
 *   that is genuinely free.
 *
 * Both are easy to leave out and neither shows up until someone tries to
 * nudge a booking half an hour.
 */
export function busyFromRows(input: {
  rows: readonly {
    id: number;
    startMinutes: number;
    endMinutes: number;
    label: string;
    kind?: BusyKind;
    cancelled?: boolean;
  }[];
  excludeId?: number | null;
}): BusyInterval[] {
  return input.rows
    .filter((row) => row.id !== input.excludeId)
    .filter((row) => !row.cancelled)
    .filter((row) => row.endMinutes > row.startMinutes)
    .map((row) => ({
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes,
      kind: row.kind ?? "appointment",
      label: row.label,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
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
 * How many dogs the groomer already has on at that time.
 *
 * CONTEXT, not a problem. An overlapping appointment is the normal way
 * this salon runs: one dog in the bath, one drying, one being clipped,
 * which is what the 12-state workflow exists for. Across the diary there
 * are 14,445 overlapping pairs against 12,728 appointments, and only 150
 * of those pairs are one family — so a warning on "this overlaps
 * something" fires on nearly every booking, and a warning that always
 * fires is one staff learn to dismiss.
 *
 * What limits a groomer is their DAY, not the clock: Lauren's numbers
 * are 8 clips for Charlotte and Megs, 6 for Brooklyn and Zakaria, 5 for
 * Ashleigh, with two tidies counting as one clip. That lives in
 * `shared/groomerCapacity.ts` and is the real overbooking check.
 */
export function concurrentDogs(clashes: readonly BusyInterval[]): number {
  return clashes.filter((c) => c.kind === "appointment").length;
}

/** Only the things that mean the groomer genuinely is not there. */
export function blockingClashes(clashes: readonly BusyInterval[]): BusyInterval[] {
  return clashes.filter((c) => c.kind === "blockout");
}

/**
 * The sentence shown before booking into time the groomer is not working.
 *
 * Blockouts ONLY. This used to warn on any overlap, which was wrong for
 * how the salon works — see `concurrentDogs` above. Leave is
 * unambiguous: nobody means to book a dog onto a day off, and there is
 * no reading of it that is routine.
 */
export function unavailableWarning(
  clashes: readonly BusyInterval[],
  groomerName: string,
): string | null {
  const leave = blockingClashes(clashes);
  if (leave.length === 0) return null;
  const who = groomerName.trim() || "This groomer";
  return `${who} is not working then — ${leave.map(describeClash).join(", ")}.`;
}
