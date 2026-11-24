/**
 * "Next available" for a client booking in the portal.
 *
 * Andy, 24/11/2026: "Add in a 'book next available' date button so clients
 * don't have to try and find the right day." With 30 minutes clear either
 * side of every booking (shared/clientBookingBuffer.ts) a full groom is
 * free on only a few days a month, and clicking through a calendar to find
 * them is not something a client will do.
 *
 * The search runs on the server, a day at a time, and has to stay cheap on
 * the database: one query loads a day's bookings for every groomer, these
 * pure functions rule out every time that is not clear, and only the times
 * left are given the full capacity check (leave, daily caps, large dogs,
 * bath stations). It stops at the first time that passes.
 */
import { buildOnlineBookingSlotStarts } from "./onlineBookingSlots";
import { isClearOfBookings, type BookedWindow } from "./clientBookingBuffer";

/** How far ahead "Next available" looks before giving up. */
export const NEXT_AVAILABLE_SEARCH_DAYS = 56;

/** Brisbane calendar days from `fromDateKey` (inclusive), as YYYY-MM-DD. */
export function searchDayKeys(fromDateKey: string, days: number = NEXT_AVAILABLE_SEARCH_DAYS): string[] {
  const [y, m, d] = fromDateKey.split("-").map(Number);
  if (!y || !m || !d) return [];
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

export type Candidate = { scheduledStart: Date; staffId: number };

/**
 * The times on one day that are clear of every booking for at least one
 * groomer, earliest first, each paired with the first groomer it is clear
 * for. Closed days give nothing (the slot builder knows Sat, Sun, Mon).
 */
export function clearCandidatesOnDay(input: {
  dateKey: string;
  durationMinutes: number;
  groomerIds: readonly number[];
  bookingsByGroomer: ReadonlyMap<number, readonly BookedWindow[]>;
  /** Nothing earlier than this, for the salon's notice period. */
  notBefore: Date;
}): Candidate[] {
  const starts = buildOnlineBookingSlotStarts(input.dateKey, input.durationMinutes);
  const out: Candidate[] = [];
  for (const scheduledStart of starts) {
    if (scheduledStart.getTime() < input.notBefore.getTime()) continue;
    const end = new Date(scheduledStart.getTime() + input.durationMinutes * 60_000);
    for (const staffId of input.groomerIds) {
      if (isClearOfBookings(input.bookingsByGroomer.get(staffId) ?? [], scheduledStart, end)) {
        out.push({ scheduledStart, staffId });
      }
    }
  }
  return out;
}
