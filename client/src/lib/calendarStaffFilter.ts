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
