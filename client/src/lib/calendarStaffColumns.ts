export type CalendarStaffColumn = {
  id: number;
  name: string;
  colourHex: string | null;
  isActive: boolean | number;
  role?: string | null;
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
