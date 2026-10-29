/**
 * Day care on the workflow board, kept apart from grooming.
 *
 * A day care dog is not moving through a pipeline. It arrives, it is
 * here, it goes home — there is no bath, no dry, no groom, and putting
 * one in the twelve-state machine asks the floor to drag it through
 * stages that will never happen. Andy, 28/10/2026: a section below the
 * board "that doesn't have moveable grooming cycle sections and just
 * has a time in and time out based on the appt terms".
 *
 * `daycare` was already a bookable service and four were already in the
 * diary, sitting on the grooming board with bath and groom columns they
 * would never use. Nothing new is bookable here; what changes is where
 * those dogs appear.
 */

export type BoardRow = {
  id: number;
  serviceType?: string | null;
  workflowState?: string | null;
  status?: string | null;
  scheduledStart: Date | string | number;
  scheduledEnd: Date | string | number;
  /**
   * Epoch MILLISECONDS on the board, not a Date — the workflow query
   * hands these over as numbers, the same shape `completed_at` has.
   * Accepting all three beats a cast at the call site that would hide
   * the next shape change.
   */
  checkedInAt?: Date | string | number | null;
};

export const DAYCARE_SERVICE = "daycare";

/** Whether this booking belongs in the day care section. */
export function isDaycare(row: Pick<BoardRow, "serviceType">): boolean {
  return String(row.serviceType ?? "").toLowerCase() === DAYCARE_SERVICE;
}

/**
 * The board's rows split in two, each keeping its original order.
 *
 * One pass rather than two filters, because the board re-renders on a
 * timer and this runs over every dog in the salon each time.
 */
export function splitDaycare<T extends Pick<BoardRow, "serviceType">>(
  rows: readonly T[],
): { grooming: T[]; daycare: T[] } {
  const grooming: T[] = [];
  const daycare: T[] = [];
  for (const row of rows) (isDaycare(row) ? daycare : grooming).push(row);
  return { grooming, daycare };
}

export type DaycarePresence = "expected" | "here" | "gone" | "cancelled";

const DEAD = new Set(["cancelled", "no_show"]);

/**
 * Where a day care dog is, in the only three states that apply.
 *
 * Derived from the same columns grooming uses, so marking a day care
 * dog in or out needs no separate concept of arrival — `checked_in`
 * and `complete` already mean exactly this. What it does NOT do is
 * offer the ten states in between.
 */
export function daycarePresence(row: Pick<BoardRow, "workflowState" | "status" | "checkedInAt">): DaycarePresence {
  if (DEAD.has(String(row.workflowState ?? "")) || DEAD.has(String(row.status ?? ""))) return "cancelled";
  if (String(row.workflowState ?? "") === "complete") return "gone";
  return row.checkedInAt ? "here" : "expected";
}

/**
 * The times the section exists to show.
 *
 * `in` and `out` are the BOOKED window, always. A day care booking is
 * an agreement about a window — "in from 10, out by 11" — and that is
 * what the floor and the owner both mean by the dog's times.
 *
 * This used to put the real arrival in `in`, on the reasoning that a
 * board showing 7:30 for a dog that turned up at 8:10 tells the floor
 * something untrue. That reasoning holds for grooming, where the
 * question is when work started. It does not hold here, and it
 * produced a row reading "In 12:16 pm · Out 11:00 am" for Lola and
 * Ollie on 29/10/2026 — booked 10 to 11, checked in at 12:16. Out
 * before in is not a time anyone can act on.
 *
 * The real arrival is still worth seeing when it is not the booked
 * one, so it comes back separately as `arrivedAt` for the caller to
 * show alongside rather than instead.
 */
export function daycareTimes(row: Pick<BoardRow, "scheduledStart" | "scheduledEnd" | "checkedInAt">): {
  in: Date;
  out: Date;
  /** When the dog actually arrived, if it has and the value is usable. */
  arrivedAt: Date | null;
  /** True when the arrival is known and differs from the booked start. */
  arrivedLate: boolean;
} {
  const arrival = row.checkedInAt ? new Date(row.checkedInAt) : null;
  const usable = arrival && !Number.isNaN(arrival.getTime()) ? arrival : null;
  const bookedIn = new Date(row.scheduledStart);
  return {
    in: bookedIn,
    out: new Date(row.scheduledEnd),
    arrivedAt: usable,
    /* A minute either side is the staff member reaching the button, not
       a late arrival worth putting on the board. */
    arrivedLate: usable !== null && Math.abs(usable.getTime() - bookedIn.getTime()) > 60_000,
  };
}

/**
 * Whether a dog still here is past the time it was booked out.
 *
 * The one thing a day care board needs to shout about: somebody is
 * late collecting. Grooming has its own "must go home by" logic;
 * this is simpler because a day care booking already carries an end.
 */
export function overdueForCollection(
  row: Pick<BoardRow, "workflowState" | "status" | "checkedInAt" | "scheduledStart" | "scheduledEnd">,
  now: Date,
): boolean {
  if (daycarePresence(row) !== "here") return false;
  return daycareTimes(row).out.getTime() < now.getTime();
}
