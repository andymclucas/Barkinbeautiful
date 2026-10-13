export type CalendarStaffColumn = {
  id: number;
  name: string;
  colourHex: string | null;
  isActive: boolean | number;
  role?: string | null;
  /** Clips a day, for the column header. Null when nobody has said. */
  dailyClipCapacity?: number | null;
};

export type AssignedCalendarAppointment = {
  staffId: number | string | null;
  staffName: string | null;
  staffColour: string | null;
  staffRole?: string | null;
};

const FALLBACK_COLOUR = "#6366f1";

function isActiveStaffValue(value: unknown): boolean {
  return value !== false && value !== 0 && value !== "0";
}

/**
 * The staff list is the preferred source because it includes all active team
 * members. Appointment data is an intentional fallback: migrated bookings
 * already carry the assigned staff join, so the calendar must still display
 * those columns if a staff-list request is temporarily unavailable.
 */
export function resolveCalendarStaffColumns(
  configuredStaff: CalendarStaffColumn[] | undefined,
  appointments: AssignedCalendarAppointment[] | undefined,
): CalendarStaffColumn[] {
  const staffById = new Map<number, CalendarStaffColumn>();

  for (const member of configuredStaff ?? []) {
    const id = Number(member.id);
    if (!Number.isFinite(id) || !isActiveStaffValue(member.isActive)) continue;
    staffById.set(id, {
      id,
      name: member.name,
      colourHex: member.colourHex || FALLBACK_COLOUR,
      isActive: member.isActive,
      role: member.role,
      dailyClipCapacity: member.dailyClipCapacity ?? null,
    });
  }

  for (const appointment of appointments ?? []) {
    const id = Number(appointment.staffId);
    if (!Number.isFinite(id) || !appointment.staffName?.trim()) continue;
    if (!staffById.has(id)) {
      staffById.set(id, {
        id,
        name: appointment.staffName,
        colourHex: appointment.staffColour || FALLBACK_COLOUR,
        isActive: true,
        role: appointment.staffRole ?? "groomer",
      });
    }
  }

  return Array.from(staffById.values()).sort((a, b) => {
    const group = (member: CalendarStaffColumn) => member.role === "bather" ? 1 : 0;
    return group(a) - group(b) || a.name.localeCompare(b.name);
  });
}

/**
 * The column a dog with nobody against it sits in.
 *
 * Not a staff member, so it carries a null id — which is also what makes the
 * day grid's `appointment.staffId === column.id` test match it without any
 * special case, and what makes a drop onto it unassign the dog.
 */
export const UNASSIGNED_COLUMN: CalendarStaffColumn = {
  id: null as unknown as number,
  name: "Unassigned",
  colourHex: "#94a3b8",
  isActive: true,
  role: null,
};

/**
 * Append the Unassigned column when, and only when, the day being looked at
 * actually has a dog with nobody against it.
 *
 * Before this the day grid drew staff columns only, so an unassigned dog
 * matched no column and was never drawn — 107 forward bookings, nearly all
 * baths off the MoeGo import, existed on the board only as a chip in the
 * strip underneath it. Showing the column unconditionally would put an empty
 * grey column on every normal day, so it is conditional.
 *
 * With no roster at all the Unassigned column is the whole board, which is
 * the behaviour the day view already had.
 */
export function withUnassignedColumn(
  staffColumns: CalendarStaffColumn[],
  hasUnassigned: boolean,
): CalendarStaffColumn[] {
  if (staffColumns.length === 0) return [UNASSIGNED_COLUMN];
  return hasUnassigned ? [...staffColumns, UNASSIGNED_COLUMN] : staffColumns;
}

/**
 * How many columns sit under each banner across the top of the day grid.
 *
 * The spans have to add up to the number of columns or the header row stops
 * lining up with the board. Unassigned is its own group: it has no role, and
 * counting "not a bather" as a groomer would file it under Groomers.
 */
export function calendarColumnGroups(columns: CalendarStaffColumn[]): {
  groomers: number;
  bathers: number;
  unassigned: number;
} {
  return {
    groomers: columns.filter((c) => c.id !== null && c.role !== "bather").length,
    bathers: columns.filter((c) => c.id !== null && c.role === "bather").length,
    unassigned: columns.filter((c) => c.id === null).length,
  };
}
