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
 * The two times the section exists to show.
 *
 * `in` is when the dog actually arrived once it has, and the booked
 * start until then — a board showing 7:30 for a dog that turned up at
 * 8:10 is telling the floor something untrue. `out` is always the
 * booked end: when the dog actually left is not what anyone standing
 * at the board needs, they need to know who is still to collect.
 */
export function daycareTimes(row: Pick<BoardRow, "scheduledStart" | "scheduledEnd" | "checkedInAt">): {
  in: Date;
  out: Date;
  /** True when `in` is the real arrival rather than the booking. */
  arrived: boolean;
} {
  const arrival = row.checkedInAt ? new Date(row.checkedInAt) : null;
  const usable = arrival && !Number.isNaN(arrival.getTime()) ? arrival : null;
  return {
    in: usable ?? new Date(row.scheduledStart),
    out: new Date(row.scheduledEnd),
    arrived: usable !== null,
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
