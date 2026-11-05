/**
 * Close a waitlist entry once the dog actually has a booking.
 *
 * Andy, 05/11/2026: "once they've been booked, remove waitlist
 * notification."
 *
 * Nothing in the application ever closed an entry. `status` and
 * `fulfilled_appointment_id` were in the schema from the start and only
 * a person pressing Remove ever moved them, so the salon's single
 * active entry had sat open since it was typed.
 *
 * ## Why this runs on READ as well as on write
 *
 * There are six places that create an appointment — the single, the
 * multi-pet, the recurring and the add-to-shared paths, plus two online
 * booking ones — and the Monday MoeGo sync creates hundreds more with
 * direct SQL that runs no application code at all. Hooking each of them
 * means the one that gets added next week is the one that forgets.
 *
 * So this is a reconciliation, not a trigger: it asks "does this dog
 * now have a booking inside the window it is waiting for", and it is
 * cheap enough to run whenever the list is looked at. A booking made
 * any way at all closes the entry the next time anybody reads it.
 *
 * It matters beyond tidiness: `matchesForSlot` offers freed slots to
 * entries with `status = 'active'`, so an entry left open after the dog
 * was booked gets offered a cancellation the client no longer wants.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { appointments, waitlistEntries } from "../drizzle/schema";
import { bookingFulfilsEntry } from "@shared/waitlist";

type Db = any;

/**
 * Settle every active entry that now has a booking behind it.
 *
 * Scope it to a client when you have one — the client record reads its
 * own entries and has no business scanning the salon's.
 *
 * Returns how many it closed, which is what the caller logs.
 */
export async function settleWaitlistEntries(
  db: Db,
  tenantId: number,
  scope: { clientId?: number; petIds?: number[] } = {},
): Promise<number> {
  const active = await db.select({
    id: waitlistEntries.id,
    petId: waitlistEntries.petId,
    earliestDate: waitlistEntries.earliestDate,
    latestDate: waitlistEntries.latestDate,
    status: waitlistEntries.status,
  })
    .from(waitlistEntries)
    .where(and(
      eq(waitlistEntries.tenantId, tenantId),
      eq(waitlistEntries.status, "active"),
      scope.clientId ? eq(waitlistEntries.clientId, scope.clientId) : undefined,
      scope.petIds?.length ? inArray(waitlistEntries.petId, scope.petIds) : undefined,
    ));
  if (active.length === 0) return 0;

  const petIds: number[] = Array.from(new Set<number>(active.map((entry: any) => Number(entry.petId))));
  /*
   * The dog's own bookings, as Brisbane calendar days.
   *
   * CONVERT_TZ here and not in JavaScript: the window is stored as a
   * Brisbane day string and the comparison has to be against the same
   * thing. Reading scheduled_start through the driver and formatting it
   * in Node would use the machine's clock, which is the timezone bug
   * this codebase has already paid for once.
   *
   * Cancelled and no-show rows do not count. A booking that was made
   * and then cancelled is exactly when somebody should still be waiting.
   */
  const booked = await db.select({
    petId: appointments.petId,
    appointmentId: appointments.id,
    dayKey: sql<string>`DATE_FORMAT(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00'), '%Y-%m-%d')`.as("dayKey"),
  })
    .from(appointments)
    .where(and(
      eq(appointments.tenantId, tenantId),
      inArray(appointments.petId, petIds),
      ne(appointments.workflowState, "cancelled"),
      ne(appointments.workflowState, "no_show"),
    ));

  let settled = 0;
  for (const entry of active) {
    const match = booked.find((row: any) =>
      bookingFulfilsEntry(entry, { petId: row.petId, dayKey: row.dayKey }));
    if (!match) continue;
    await db.update(waitlistEntries)
      .set({ status: "fulfilled", fulfilledAppointmentId: match.appointmentId, updatedAt: new Date() })
      .where(and(eq(waitlistEntries.id, entry.id), eq(waitlistEntries.status, "active")));
    settled++;
  }
  return settled;
}
