/**
 * Booking requests: bookings clients made themselves, waiting for the salon.
 *
 * Andy, 27/11/2026 (see shared/bookingRequests.ts). A client's booking from
 * /book or the portal lands as "pending"; staff see it here, open it on the
 * calendar, and approve it, which makes it "confirmed".
 *
 * protectedProcedure: owners and admins, the people who take bookings.
 * Restricted staff (groomers on their own diary) neither see nor approve.
 */
import { z } from "zod";
import { and, asc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireCallerTenant } from "../_core/trpc";
import { getDb } from "../db";
import { appointments, clients, pets, staff } from "../../drizzle/schema";
import { REQUEST_STALE_AFTER_MS } from "@shared/bookingRequests";
import { brisbaneDateKey } from "@shared/localDateTime";
import { calendarAppointmentHref } from "@shared/calendarDeepLink";

/** The one definition of an open request in SQL; the sidebar count uses it too. */
export function openRequestWhere(tenantId: number) {
  return and(
    eq(appointments.tenantId, tenantId),
    eq(appointments.bookedOnline, true),
    eq(appointments.status, "pending"),
    notInArray(appointments.workflowState, ["cancelled", "no_show"]),
    gt(appointments.scheduledStart, new Date(Date.now() - REQUEST_STALE_AFTER_MS)),
  );
}

export const bookingRequestsRouter = router({
  /** Every open request, soonest first. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const tenantId = requireCallerTenant(ctx);
    const rows = await db.select({
      id: appointments.id,
      sessionId: appointments.sessionId,
      scheduledStart: appointments.scheduledStart,
      scheduledEnd: appointments.scheduledEnd,
      serviceType: appointments.serviceType,
      price: appointments.price,
      notes: appointments.notes,
      createdAt: appointments.createdAt,
      clientId: appointments.clientId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientPhone: clients.phone,
      petId: appointments.petId,
      petName: pets.name,
      staffName: staff.name,
    })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .innerJoin(pets, eq(pets.id, appointments.petId))
      .leftJoin(staff, eq(staff.id, appointments.staffId))
      .where(openRequestWhere(tenantId))
      .orderBy(asc(appointments.scheduledStart))
      .limit(200);
    return rows.map((r) => ({
      ...r,
      calendarHref: calendarAppointmentHref(r.id, brisbaneDateKey(new Date(r.scheduledStart))),
    }));
  }),

  /**
   * Approve one request. Any other dogs booked in the same request (a
   * family booking shares a session) are approved with it, so a household
   * is never left half confirmed.
   */
  approve: protectedProcedure
    .input(z.object({ appointmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireCallerTenant(ctx);
      const [appt] = await db.select({ id: appointments.id, sessionId: appointments.sessionId })
        .from(appointments)
        .where(and(eq(appointments.id, input.appointmentId), openRequestWhere(tenantId)))
        .limit(1);
      if (!appt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That booking is not waiting for approval any more." });
      }
      const ids = [appt.id];
      if (appt.sessionId) {
        const family = await db.select({ id: appointments.id }).from(appointments)
          .where(and(eq(appointments.sessionId, appt.sessionId), openRequestWhere(tenantId)));
        for (const f of family) if (!ids.includes(f.id)) ids.push(f.id);
      }
      await db.update(appointments).set({ status: "confirmed" })
        .where(and(inArray(appointments.id, ids), openRequestWhere(tenantId)));
      return { approved: ids.length, ids };
    }),
});
