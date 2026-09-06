export type TimeWindow = { scheduledStart: Date | string | number; scheduledEnd: Date | string | number };
export type BathResourceBooking = { serviceType: string; scheduledStart: Date | string | number };

export const BATH_RESOURCE_MINUTES: Record<string, number> = {
  classic_groom: 45,
  styled_groom: 45,
  bath_only: 60,
  deshed: 45,
};

export function countOverlappingBookings(bookings: TimeWindow[], requestedStart: Date, requestedEnd: Date): number {
  return bookings.filter(booking => {
    const start = new Date(booking.scheduledStart).getTime();
    const end = new Date(booking.scheduledEnd).getTime();
    return start < requestedEnd.getTime() && end > requestedStart.getTime();
  }).length;
}

export function isOnlineSlotAvailable(params: {
  overlappingBookings: number;
  slotLimit: number;
  bookingsToday: number;
  dailyLimit: number;
}): boolean {
  if (params.overlappingBookings >= Math.max(1, params.slotLimit)) return false;
  if (params.dailyLimit > 0 && params.bookingsToday >= params.dailyLimit) return false;
  return true;
}

export function countSharedBathResourceOverlaps(bookings: BathResourceBooking[], requestedService: string, requestedStart: Date): number {
  const requestedMinutes = BATH_RESOURCE_MINUTES[requestedService] ?? 0;
  if (!requestedMinutes) return 0;
  const requestedEnd = new Date(requestedStart.getTime() + requestedMinutes * 60000);
  return bookings.filter(booking => {
    const minutes = BATH_RESOURCE_MINUTES[booking.serviceType] ?? 0;
    if (!minutes) return false;
    const start = new Date(booking.scheduledStart).getTime();
    const end = start + minutes * 60000;
    return start < requestedEnd.getTime() && end > requestedStart.getTime();
  }).length;
}
