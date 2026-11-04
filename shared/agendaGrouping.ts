/**
 * The agenda list, with the dogs of one booking held together.
 *
 * Lauren, 04/11/2026: "just need that link dog's to show in agenda /
 * also red line if possible - Albert & Eddy are together."
 *
 * The agenda deliberately draws one row PER DOG — that is the whole
 * reason it exists, because the grid collapses a family into a single
 * block and Brooklyn could not find a name on it while the owner stood
 * there waiting. One row per dog loses the other half of the fact
 * though: nothing said Albert and Eddy go home in the same car.
 *
 * So the rows stay one-per-dog and gain a bracket: a group of adjacent
 * rows, marked, that staff can read as one booking.
 *
 * ## Two things this has to get right
 *
 * **Session-mates must be ADJACENT, deterministically.** They share a
 * `scheduledStart`, so a sort on time alone leaves their order to
 * whatever the query returned, and two families booked at 12:30 can
 * interleave. A bracket drawn around rows 1 and 3 is worse than no
 * bracket. The sort therefore falls through time -> booking -> dog.
 *
 * **A cancelled dog is not in the group.** `liveSiblings` already draws
 * a cancelled dog on its own on the calendar, for the same reason it
 * matters more here: the bracket answers "who leaves together", and a
 * dog who is not coming does not. It sorts to the end of its own
 * booking's run so it never breaks the bracket in half.
 */

export type AgendaAppointment = {
  id: number;
  sessionId?: string | null;
  scheduledStart: Date | string | number;
  status?: string | null;
  workflowState?: string | null;
};

/** Where a row sits in its booking, for drawing the bracket. */
export type GroupPosition = "only" | "first" | "middle" | "last";

export type AgendaRow<T> = {
  appointment: T;
  /** Live dogs in this booking. 1 for a dog booked on its own. */
  groupSize: number;
  position: GroupPosition;
  /** 1-based, for "Dog 2 of 3". Always 1 when `groupSize` is 1. */
  indexInGroup: number;
};

const NOT_COMING = new Set(["cancelled", "no_show"]);

function notComing(appt: AgendaAppointment): boolean {
  return NOT_COMING.has(String(appt.workflowState ?? "").trim())
    || NOT_COMING.has(String(appt.status ?? "").trim());
}

function startMs(appt: AgendaAppointment): number {
  const d = appt.scheduledStart instanceof Date ? appt.scheduledStart : new Date(appt.scheduledStart);
  const t = d.getTime();
  // An unparseable date sorts last rather than throwing the whole list
  // into an arbitrary order around a NaN comparison.
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Only a dog that is coming AND shares a booking can be bracketed.
 * Everything else is its own row, keyed so it cannot collide.
 */
function groupKeyOf(appt: AgendaAppointment): string {
  const session = (appt.sessionId ?? "").trim();
  if (!session || notComing(appt)) return `solo:${appt.id}`;
  return `session:${session}`;
}

export function agendaRows<T extends AgendaAppointment>(appointments: readonly T[]): AgendaRow<T>[] {
  const sizes = new Map<string, number>();
  for (const appt of appointments) {
    const key = groupKeyOf(appt);
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }

  /*
   * Time, then booking, then the not-coming dogs of that booking, then
   * id. The third term is what keeps a cancelled session-mate from
   * landing between two live ones and splitting the bracket.
   */
  const sorted = [...appointments].sort((a, b) => {
    const byTime = startMs(a) - startMs(b);
    if (byTime !== 0) return byTime;
    const sessionA = (a.sessionId ?? "").trim();
    const sessionB = (b.sessionId ?? "").trim();
    if (sessionA !== sessionB) return sessionA < sessionB ? -1 : 1;
    /*
     * Sessions are equal from here, so this only ever separates a
     * not-coming dog from its own booking-mates. Compared as 0 and 1
     * rather than branching on `notComing(a)` alone: that returned the
     * same answer whichever way round the pair arrived, which is an
     * inconsistent comparator, and it reversed two unrelated dogs that
     * merely shared a time.
     */
    const deadA = notComing(a) ? 1 : 0;
    const deadB = notComing(b) ? 1 : 0;
    if (deadA !== deadB) return deadA - deadB;
    return a.id - b.id;
  });

  const seen = new Map<string, number>();
  return sorted.map((appointment) => {
    const key = groupKeyOf(appointment);
    const size = sizes.get(key) ?? 1;
    const index = (seen.get(key) ?? 0) + 1;
    seen.set(key, index);
    const position: GroupPosition = size === 1
      ? "only"
      : index === 1 ? "first" : index === size ? "last" : "middle";
    return { appointment, groupSize: size, position, indexInGroup: index };
  });
}

/** The label on a bracket. Says how many, because that is the useful part. */
export function describeGroup(groupSize: number): string | null {
  return groupSize > 1 ? `Together · ${groupSize} dogs` : null;
}
