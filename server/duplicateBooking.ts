import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { appointments, pets } from "../drizzle/schema";
import { brisbaneDayBounds } from "../shared/localDateTime";
import {
  dogsAlreadyBookedThatDay,
  duplicateBookingMessage,
  type DuplicateBookingClash,
} from "../shared/duplicateBooking";

/**
 * The dogs among `petIds` that already have a live booking on the
 * Brisbane day containing `at`.
 *
 * One place, because there were two and they disagreed — see
 * shared/duplicateBooking.ts for the Leek pair that got through the
 * eight paths that had neither.
 *
 * `excludeAppointmentIds` is for a path that is MOVING a booking rather
 * than making one: a booking must not clash with itself.
 */
export async function findDogsAlreadyBookedThatDay(
  db: any,
  input: {
    tenantId: number;
    petIds: readonly number[];
    at: Date;
    excludeAppointmentIds?: readonly number[];
  },
): Promise<DuplicateBookingClash[]> {
  const petIds = Array.from(new Set(input.petIds)).filter((id) => Number.isFinite(id));
  if (petIds.length === 0) return [];
  if (Number.isNaN(input.at.getTime())) return [];

  const { start, end } = brisbaneDayBounds(input.at);
  const rows = await db
    .select({
      petId: appointments.petId,
      petName: pets.name,
      status: appointments.status,
      workflowState: appointments.workflowState,
      id: appointments.id,
    })
    .from(appointments)
    .leftJoin(pets, eq(pets.id, appointments.petId))
    .where(and(
      eq(appointments.tenantId, input.tenantId),
      inArray(appointments.petId, petIds),
      gte(appointments.scheduledStart, start),
      lt(appointments.scheduledStart, end),
    ));

  const exclude = new Set(input.excludeAppointmentIds ?? []);
  /*
   * The LIVE test is the shared rule's, not the query's. Filtering
   * cancelled rows out in SQL would mean two places deciding what
   * "booked" means, which is how the two old guards drifted apart.
   */
  return dogsAlreadyBookedThatDay(
    petIds,
    rows.filter((row: { id: number }) => !exclude.has(row.id)),
  );
}

/**
 * Refuse the booking when one of its dogs is already in that day.
 *
 * BAD_REQUEST and a message naming the dogs, because this is a thing the
 * person booking can fix — move the booking that exists, or pick another
 * date.
 */
export async function assertDogsNotAlreadyBookedThatDay(
  db: any,
  input: {
    tenantId: number;
    petIds: readonly number[];
    at: Date;
    excludeAppointmentIds?: readonly number[];
  },
): Promise<void> {
  const clashes = await findDogsAlreadyBookedThatDay(db, input);
  if (clashes.length === 0) return;
  throw new TRPCError({ code: "BAD_REQUEST", message: duplicateBookingMessage(clashes) });
}
