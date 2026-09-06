export type StaffAssignment = {
  staffId: number | null;
  bathStaffId: number | null;
  dryStaffId: number | null;
};

export function canStaffUpdateAppointment(staffId: number, appointment: StaffAssignment): boolean {
  return [appointment.staffId, appointment.bathStaffId, appointment.dryStaffId].includes(staffId);
}
