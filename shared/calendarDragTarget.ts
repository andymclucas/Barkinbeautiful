export type CalendarDragTargetInput = {
  clientY: number;
  columnTop: number;
  scrollTop: number;
  grabOffsetY: number;
  hourHeight: number;
  latestStartMinutes: number;
};

/**
 * Converts a pointer position in the scrollable day grid into the nearest 15-minute
 * target, preserving the appointment-grab offset used by the final reschedule.
 */
export function buildCalendarDragTargetMinutes(input: CalendarDragTargetInput): number {
  const relativeY = input.clientY - input.columnTop + input.scrollTop - input.grabOffsetY;
  const roundedToQuarterHour = Math.round((relativeY / input.hourHeight) * 60 / 15) * 15;
  return Math.max(0, Math.min(roundedToQuarterHour, input.latestStartMinutes));
}

export function formatCalendarDragTargetTime(minutesFromSeven: number): string {
  const totalMinutes = (7 * 60) + minutesFromSeven;
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
