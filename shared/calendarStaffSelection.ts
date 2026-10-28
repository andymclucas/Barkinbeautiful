/**
 * Which staff columns the diary shows, and what it opens on.
 *
 * The salon has twelve active people but only eight of them take dogs for a
 * groom: an owner, two managers and five groomers. The other four are the
 * bathing team, whose columns earn their place on the workflow board and
 * mostly just narrow the grooming columns in the diary. So the calendar now
 * opens on the grooming side, and the bathing team is opt-in from the same
 * staff menu.
 *
 * The selection is a tagged union rather than a plain list of ids because the
 * INTENT has to survive hiring. "Groomers" stored as today's eight ids would
 * hide the ninth groomer on the morning she starts — the bug the previous
 * `null`-means-all design existed to avoid. Stored as an intent, she appears.
 * An explicit list is still there for "just me and Lauren".
 *
 * The dividing line is bather / not-bather, matching the "Groomers" and
 * "Bathing team" headings the staff menu already groups by. Owner and
 * managers groom, so they sit on the grooming side.
 */

export type CalendarStaffSelection =
  | { kind: "groomers" }
  | { kind: "all" }
  | { kind: "ids"; ids: number[] };

/** Enough of a staff member to place them in a column. */
export type CalendarStaffMember = { id: number; role?: string | null };

export const DEFAULT_CALENDAR_STAFF_SELECTION: CalendarStaffSelection = { kind: "groomers" };

/**
 * The one place the grooming/bathing line is drawn.
 *
 * Inlined as `role !== "bather"` in two different components before this,
 * which is how a default and the menu grouping it is meant to match drift
 * apart.
 */
export function isBatherRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim().toLowerCase() === "bather";
}

export function splitCalendarStaff<T extends CalendarStaffMember>(
  staff: readonly T[] | undefined,
): { groomers: T[]; bathers: T[] } {
  const groomers: T[] = [];
  const bathers: T[] = [];
  for (const member of staff ?? []) {
    (isBatherRole(member.role) ? bathers : groomers).push(member);
  }
  return { groomers, bathers };
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((id) => seen.has(id));
}

/** The staff ids a selection resolves to, against who works here today. */
export function visibleStaffIds(
  selection: CalendarStaffSelection,
  staff: readonly CalendarStaffMember[] | undefined,
): number[] {
  const everyone = (staff ?? []).map((member) => member.id);
  switch (selection.kind) {
    case "all":
      return everyone;
    case "groomers":
      return splitCalendarStaff(staff).groomers.map((member) => member.id);
    case "ids": {
      // Reconciled, not trusted: a list outlives the people in it.
      const current = new Set(everyone);
      return selection.ids.filter((id) => current.has(id));
    }
  }
}

export function isStaffSelected(
  selection: CalendarStaffSelection,
  staff: readonly CalendarStaffMember[] | undefined,
  staffId: number,
): boolean {
  return visibleStaffIds(selection, staff).includes(staffId);
}

/**
 * Normalise a resolved set back to the strongest intent that describes it.
 *
 * Covering everybody is "all" and covering exactly the grooming side is
 * "groomers", so a future hire is picked up instead of being filtered out by
 * a list written before they started. "all" wins when the two coincide —
 * a salon with no bathers has ticked every box there is.
 */
function narrow(
  ids: readonly number[],
  staff: readonly CalendarStaffMember[] | undefined,
): CalendarStaffSelection {
  const everyone = (staff ?? []).map((member) => member.id);
  if (everyone.length > 0 && sameSet(ids, everyone)) return { kind: "all" };
  const groomerIds = splitCalendarStaff(staff).groomers.map((member) => member.id);
  if (groomerIds.length > 0 && sameSet(ids, groomerIds)) return { kind: "groomers" };
  return { kind: "ids", ids: Array.from(new Set(ids)) };
}

export function toggleCalendarStaff(
  selection: CalendarStaffSelection,
  staff: readonly CalendarStaffMember[] | undefined,
  staffId: number,
): CalendarStaffSelection {
  const current = visibleStaffIds(selection, staff);
  const next = current.includes(staffId)
    ? current.filter((id) => id !== staffId)
    : [...current, staffId];
  return narrow(next, staff);
}

/** Label for the staff menu's button. */
export function describeCalendarStaffSelection(
  selection: CalendarStaffSelection,
  staff: readonly CalendarStaffMember[] | undefined,
): string {
  const visible = visibleStaffIds(selection, staff);
  const everyone = (staff ?? []).map((member) => member.id);
  if (everyone.length > 0 && sameSet(visible, everyone)) return "All staff";
  if (selection.kind === "groomers") return "Groomers";
  if (visible.length === 0) return "No staff selected";
  return `${visible.length} staff selected`;
}

/**
 * Whether the "All staff" row should read as ticked.
 *
 * Based on the resolved set, not the tag: with no bathers on the books,
 * "groomers" and "all" are the same board and claiming otherwise would make
 * the tick look broken.
 */
export function coversAllStaff(
  selection: CalendarStaffSelection,
  staff: readonly CalendarStaffMember[] | undefined,
): boolean {
  const everyone = (staff ?? []).map((member) => member.id);
  return everyone.length > 0 && sameSet(visibleStaffIds(selection, staff), everyone);
}

export function serialiseCalendarStaffSelection(selection: CalendarStaffSelection): string {
  return selection.kind === "ids" ? JSON.stringify(selection.ids) : selection.kind;
}

/**
 * Read a stored choice back, reconciled against the current staff list.
 *
 * Falls back to the default — the grooming side — when there is nothing
 * stored, when it is nonsense, or when everybody in it has left. That last
 * case would otherwise render an empty diary and read as the calendar having
 * broken.
 *
 * An empty stored list is deliberately NOT honoured for the same reason, even
 * though clearing every tick live is allowed.
 */
export function parseCalendarStaffSelection(
  raw: string | null | undefined,
  staff: readonly CalendarStaffMember[] | undefined,
): CalendarStaffSelection {
  const text = String(raw ?? "").trim();
  if (text === "all") return { kind: "all" };
  if (text === "groomers") return DEFAULT_CALENDAR_STAFF_SELECTION;
  if (!text) return DEFAULT_CALENDAR_STAFF_SELECTION;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_CALENDAR_STAFF_SELECTION;
  }
  if (!Array.isArray(parsed)) return DEFAULT_CALENDAR_STAFF_SELECTION;

  const current = new Set((staff ?? []).map((member) => member.id));
  const kept = Array.from(
    new Set(parsed.filter((id): id is number => typeof id === "number" && current.has(id))),
  );
  if (kept.length === 0) return DEFAULT_CALENDAR_STAFF_SELECTION;
  return narrow(kept, staff);
}

/**
 * Per user, and versioned.
 *
 * The salon shares machines, so the user id keeps Lauren's hidden bathers
 * out of whoever signs in next.
 *
 * `_v2` retires the old key rather than migrating it. The old one saved
 * `"all"` on every visit, including for people who never opened the menu, so
 * a stored `"all"` cannot be told apart from never having chosen — and
 * reading it would mean nobody ever sees this new default.
 */
export function calendarStaffFilterKey(userId: number | string | null | undefined): string {
  return `groomigo_calendar_staff_v2_${userId ?? "anon"}`;
}

/**
 * Whether the Unassigned column is shown, remembered separately from the
 * staff selection.
 *
 * Deliberately NOT folded into CalendarStaffSelection. That union is about
 * WHO works here, and every path through it reconciles ids against the
 * current roster. "Nobody" is not a staff member and has no id to
 * reconcile, so putting it in there would mean a sentinel id that narrow(),
 * visibleStaffIds() and parse() would each have to know to spare — three
 * chances to filter the column out of existence. A second key is duller and
 * cannot be got wrong.
 *
 * Defaults to SHOWN. The column only appears on days that actually have a
 * dog with nobody against it, and defaulting those to hidden is how 107
 * bookings stayed invisible on the board in the first place.
 */
export function calendarUnassignedColumnKey(userId: number | string | null | undefined): string {
  return `groomigo_calendar_unassigned_v1_${userId ?? "anon"}`;
}

export function serialiseShowUnassignedColumn(show: boolean): string {
  return show ? "1" : "0";
}

/** Anything that is not an explicit "0" means shown, including nothing. */
export function parseShowUnassignedColumn(raw: string | null | undefined): boolean {
  return String(raw ?? "").trim() !== "0";
}

/**
 * Whether the Daycare column is shown, per user.
 *
 * Its own key, for the same reason the Unassigned one is separate: the
 * staff selection is about WHICH PEOPLE to show, and Daycare is not a
 * person. Folding it into that list would give two chances to filter a
 * column out of existence.
 *
 * Defaults to SHOWN, and the column only appears on days that actually
 * have a daycare dog.
 */
export function calendarDaycareColumnKey(userId: number | string | null | undefined): string {
  return `groomigo_calendar_daycare_v1_${userId ?? "anon"}`;
}

export function serialiseShowDaycareColumn(show: boolean): string {
  return show ? "1" : "0";
}

/** Anything that is not an explicit "0" means shown, including nothing. */
export function parseShowDaycareColumn(raw: string | null | undefined): boolean {
  return String(raw ?? "").trim() !== "0";
}
