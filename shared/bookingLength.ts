/**
 * Whether a booking's start and end make sense together.
 *
 * Gizmo's booking was saved ending 15/01/2028 for a 15/01/2027 groom — a
 * year typed in the End date box. Nothing checked, so Ashleigh read as
 * booked solid for a year and every 2027 repeat with her was refused
 * (Hunter, 12/11/2026). A groom ends after it starts and the same day.
 */
import { parseBrisbaneLocalDateTime } from "./localDateTime";

export const MAX_BOOKING_HOURS = 12;

export function bookingLengthProblem(scheduledStart: string, scheduledEnd: string): string | null {
  let start: Date, end: Date;
  try {
    start = parseBrisbaneLocalDateTime(scheduledStart);
    end = parseBrisbaneLocalDateTime(scheduledEnd);
  } catch {
    return "The start or end time isn't a real date and time.";
  }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return "The start or end time isn't a real date and time.";
  }
  if (end.getTime() <= start.getTime()) return "The end time is before the start time.";
  if (end.getTime() - start.getTime() > MAX_BOOKING_HOURS * 3_600_000) {
    return `The end is more than ${MAX_BOOKING_HOURS} hours after the start — check the End date.`;
  }
  return null;
}
