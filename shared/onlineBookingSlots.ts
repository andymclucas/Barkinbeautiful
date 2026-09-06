export const ONLINE_BOOKING_SLOT_INTERVAL_MINUTES = 30;
export const ONLINE_BOOKING_OPEN_MINUTES = 8 * 60;
export const ONLINE_BOOKING_CLOSE_MINUTES = 17 * 60;

export function buildOnlineBookingSlotStarts(dateKey: string, durationMinutes: number): Date[] {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day || durationMinutes <= 0) return [];

  // Brisbane operates on AEST year-round. Midnight AEST is 14:00 UTC the day before.
  const aestMidnight = Date.UTC(year, month - 1, day - 1, 14, 0, 0, 0);
  const lastStart = ONLINE_BOOKING_CLOSE_MINUTES - durationMinutes;
  const slots: Date[] = [];
  for (let minute = ONLINE_BOOKING_OPEN_MINUTES; minute <= lastStart; minute += ONLINE_BOOKING_SLOT_INTERVAL_MINUTES) {
    slots.push(new Date(aestMidnight + minute * 60_000));
  }
  return slots;
}
