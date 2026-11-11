/**
 * The reschedule window for a booking that belongs to a cycle — the
 * database half of shared/cycleRescheduleWindow.ts. Used by the client
 * portal to limit the date picker AND by the reschedule itself, which is
 * what actually enforces it.
 */
import { and, asc, desc, eq, gt, lt, ne, notInArray } from "drizzle-orm";
import { appointments, memberships } from "../drizzle/schema";
import { brisbaneDateKey } from "@shared/localDateTime";
import { cycleRescheduleWindow, type CycleWindow } from "@shared/cycleRescheduleWindow";

export type CycleAppointment = {
  id: number;
  tenantId: number;
  petId: number | null;
  membershipId: number | null;
  recurringGroupId: string | null;
  scheduledStart: Date | string;
};

/** Null for a one-off booking: those move freely, as before. */
export async function loadCycleWindow(db: any, appt: CycleAppointment): Promise<CycleWindow | null> {
  if (!appt.petId || (!appt.membershipId && !appt.recurringGroupId)) return null;
  const start = new Date(appt.scheduledStart);
  const sameCycle = appt.recurringGroupId
    ? eq(appointments.recurringGroupId, appt.recurringGroupId)
    : eq(appointments.membershipId, appt.membershipId!);
  const base = and(
    eq(appointments.tenantId, appt.tenantId),
    eq(appointments.petId, appt.petId),
    ne(appointments.id, appt.id),
    sameCycle,
    notInArray(appointments.status, ["cancelled", "no_show"]),
    notInArray(appointments.workflowState, ["cancelled", "no_show"]),
  );
  const [[prev], [next]] = await Promise.all([
    db.select({ at: appointments.scheduledStart }).from(appointments)
      .where(and(base, lt(appointments.scheduledStart, start))).orderBy(desc(appointments.scheduledStart)).limit(1),
    db.select({ at: appointments.scheduledStart }).from(appointments)
      .where(and(base, gt(appointments.scheduledStart, start))).orderBy(asc(appointments.scheduledStart)).limit(1),
  ]);

  let intervalWeeks: number | null = null;
  if (appt.membershipId) {
    const [m] = await db.select({ weeks: memberships.appointmentIntervalWeeks }).from(memberships)
      .where(and(eq(memberships.id, appt.membershipId), eq(memberships.tenantId, appt.tenantId))).limit(1);
    intervalWeeks = m?.weeks ?? null;
  }

  return cycleRescheduleWindow({
    currentDateKey: brisbaneDateKey(start),
    prevDateKey: prev ? brisbaneDateKey(new Date(prev.at)) : null,
    nextDateKey: next ? brisbaneDateKey(new Date(next.at)) : null,
    intervalWeeks,
  });
}
