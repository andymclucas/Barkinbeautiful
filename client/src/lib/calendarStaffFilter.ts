/**
 * Which staff columns the calendar shows, and remembering the choice.
 *
 * `null` means "all staff" rather than an explicit list, so the filter
 * keeps working when somebody is hired: a new groomer appears on the board
 * instead of being silently hidden by a list written before they started.
 */

export function toggleCalendarStaffSelection(
  currentSelection: number[] | null,
  allStaffIds: number[],
  staffId: number,
): number[] | null {
  const current = currentSelection ?? allStaffIds;
  const next = current.includes(staffId)
    ? current.filter((id) => id !== staffId)
    : Array.from(new Set([...current, staffId]));
  return next.length === allStaffIds.length ? null : next;
}

/**
 * Per user, not per browser.
 *
 * The salon shares machines. Without the user in the key, Lauren hiding
 * the bathers would hide them for whoever signed in next, on a board they
 * never touched — which reads as the calendar losing people.
 */
export function calendarStaffFilterKey(userId: number | string | null | undefined): string {
  return `groomigo_calendar_staff_${userId ?? "anon"}`;
}

/** `null` is a real choice ("all"), so it has to round-trip as one. */
export function serialiseStaffSelection(selection: number[] | null): string {
  return selection === null ? "all" : JSON.stringify(selection);
}

/**
 * Read back a stored choice, reconciled against who actually works here now.
 *
 * A stored list is a snapshot of a staff list that has since changed, so it
 * is filtered rather than trusted. Three ways it collapses back to "all":
 *
 *  - nothing stored, or stored nonsense;
 *  - every id in it has left, which would otherwise render an empty board
 *    and look like the calendar had broken;
 *  - what remains covers everybody, which IS "all" — and saying so keeps
 *    the button honest and lets a future hire show up.
 */
export function parseStoredStaffSelection(
  raw: string | null | undefined,
  allStaffIds: number[],
): number[] | null {
  if (!raw || raw === "all") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const current = new Set(allStaffIds);
  const kept = Array.from(
    new Set(parsed.filter((id): id is number => typeof id === "number" && current.has(id))),
  );

  if (kept.length === 0) return null;
  if (kept.length === allStaffIds.length) return null;
  return kept;
}
