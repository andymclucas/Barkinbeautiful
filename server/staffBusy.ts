/**
 * When a groomer is not free: booked dogs, and leave.
 *
 * Lifted out of the membership sign-up router on 03/11/2026, when the
 * rebook button became the second thing that needed it. Two copies of
 * "is this groomer free" is how two features end up disagreeing about
 * whether somebody is on annual leave.
 *
 * One query each over the whole window rather than a lookup per
 * candidate slot: a cadence search is twenty occurrences times a
 * nine-day window, which is a lot of round trips for a question the
 * calendar answers once.
 */
import { and, eq, gt, gte, lt, ne } from "drizzle-orm";
import { appointments, staffBlockouts } from "../drizzle/schema";
import { blockoutBusyInterval } from "@shared/staffBlockouts";
import type { BusyInterval } from "@shared/membershipSeries";

export async function busyForStaff(
  db: any, tenantId: number, staffId: number, from: Date, to: Date,
): Promise<BusyInterval[]> {
  const booked = await db.select({
    start: appointments.scheduledStart,
    end: appointments.scheduledEnd,
  }).from(appointments).where(and(
    eq(appointments.tenantId, tenantId),
    eq(appointments.staffId, staffId),
    ne(appointments.workflowState, "cancelled"),
    ne(appointments.status, "cancelled"),
    lt(appointments.scheduledStart, to),
    gt(appointments.scheduledEnd, from),
  ));

  const leave = await db.select({
    staffId: staffBlockouts.staffId,
    blockoutDate: staffBlockouts.blockoutDate,
    isFullDay: staffBlockouts.isFullDay,
    startTime: staffBlockouts.startTime,
    endTime: staffBlockouts.endTime,
  }).from(staffBlockouts).where(and(
    eq(staffBlockouts.tenantId, tenantId),
    eq(staffBlockouts.staffId, staffId),
    // A day either side, because a blockout row is a date label at
    // midnight UTC and the Brisbane day it means straddles two of them.
    gte(staffBlockouts.blockoutDate, new Date(from.getTime() - 86_400_000)),
    lt(staffBlockouts.blockoutDate, new Date(to.getTime() + 86_400_000)),
  ));

  return [
    ...booked.map((row: any) => ({ start: row.start, end: row.end })),
    ...leave.map(blockoutBusyInterval),
  ];
}
