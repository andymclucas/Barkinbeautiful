export const READABLE_STAFF_COLUMN_WIDTH = 320;

export function getDayCalendarGridSizing(
  staffCount: number,
  timeColumnWidth: number,
  staffColumnWidth = READABLE_STAFF_COLUMN_WIDTH,
) {
  const safeStaffCount = Math.max(1, Math.floor(staffCount));

  return {
    totalWidth: timeColumnWidth + safeStaffCount * staffColumnWidth,
    gridTemplateColumns: `${timeColumnWidth}px repeat(${safeStaffCount}, ${staffColumnWidth}px)`,
  };
}
