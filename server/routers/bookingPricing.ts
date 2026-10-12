/**
 * What the New Appointment dialog needs to price a booking.
 *
 * Two queries, deliberately split:
 *
 *   `catalogue` is the salon's price list. It changes a few times a year,
 *   is the same for every booking, and is small (43 service rows), so it
 *   is fetched once and cached. The dialog then works out options and
 *   defaults client-side with the pure functions in shared/groomPricing —
 *   which is what makes switching Classic ↔ Styled instant instead of a
 *   round trip per tap.
 *
 *   `context` is what differs per booking: this client's tier, each dog's
 *   size band, and what each dog had last time.
 *
 * `operationalProcedure` throughout. The person booking a dog in is the
 * receptionist or the groomer taking the call; `protectedProcedure`
 * rejects restricted staff accounts and would leave the salon floor
 * unable to book. Both queries are scoped to the caller's own tenant and
 * refuse a client that is not theirs.
 */
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { appointments, appointmentAddOns, clients, pets, pricingServices } from "../../drizzle/schema";
import { requireApprovedStaffTenant } from "../staffAccess";
import { clientPriceTier } from "../../shared/groomPricing";

/**
 * The client owns the pets, and the caller's salon owns the client.
 *
 * Both halves matter. Checking only the tenant lets one salon price
 * another client's dogs; checking only the client lets a staff account
 * read a client from a salon it does not work for.
 */
async function assertClientPets(db: any, tenantId: number, clientId: number, petIds: number[]) {
  const [client] = await db
    .select({ id: clients.id, tenantId: clients.tenantId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client || client.tenantId !== tenantId) {
    throw new Error("This client is not available to your salon");
  }
  if (petIds.length === 0) return;
  const owned = await db
    .select({ id: pets.id, clientId: pets.clientId, tenantId: pets.tenantId })
    .from(pets)
    .where(inArray(pets.id, petIds));
  if (
    owned.length !== petIds.length ||
    owned.some((pet: any) => pet.clientId !== clientId || pet.tenantId !== tenantId)
  ) {
    throw new Error("The selected pets do not belong to this client");
  }
}

export const bookingPricingRouter = router({
  /**
   * The salon's service price list.
   *
   * Only `service` rows — add-ons have their own picker and their own
   * procedure in appointmentAddOns. Inactive rows are left out: a retired
   * price must not be offered on a new booking, even though appointments
   * already charged at it keep their figure.
   */
  catalogue: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = tenantOf(ctx, input) ?? 1;
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== tenantId) {
        throw new Error("This salon is not available to your staff profile");
      }
      return db
        .select({
          id: pricingServices.id,
          name: pricingServices.name,
          legacyServiceType: pricingServices.legacyServiceType,
          weightBand: pricingServices.weightBand,
          priceMode: pricingServices.priceMode,
          priceAud: pricingServices.priceAud,
          durationMinutes: pricingServices.durationMinutes,
          sortOrder: pricingServices.sortOrder,
        })
        .from(pricingServices)
        .where(
          and(
            eq(pricingServices.tenantId, tenantId),
            eq(pricingServices.catalogueType, "service"),
            eq(pricingServices.isActive, true),
            isNotNull(pricingServices.legacyServiceType),
          ),
        )
        .orderBy(asc(pricingServices.sortOrder), asc(pricingServices.id));
    }),

  /**
   * This client's tier, and each dog's size and last booking.
   *
   * The last booking is what "Book again" repeats. It is the most recent
   * COMPLETED groom, not simply the most recent row: a cancellation or a
   * no-show is not what the dog had, and repeating a cancelled booking's
   * service and price would carry a mistake forward.
   */
  context: operationalProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive().default(1),
        clientId: z.number().int().positive(),
        petIds: z.array(z.number().int().positive()).max(20).default([]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tenantId = tenantOf(ctx, input);
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== tenantId) {
        throw new Error("This salon is not available to your staff profile");
      }
      const petIds = Array.from(new Set(input.petIds));
      await assertClientPets(db, tenantId, input.clientId, petIds);

      // "Has this client ever had a groom finished?" decides new vs regular.
      // One row is enough to answer it, so this never scans their history.
      const completed = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenantId),
            eq(appointments.clientId, input.clientId),
            eq(appointments.workflowState, "complete"),
          ),
        )
        .limit(1);
      const hasCompletedAppointment = completed.length > 0;

      const petRows =
        petIds.length === 0
          ? []
          : await db
              .select({
                id: pets.id,
                name: pets.name,
                breed: pets.breed,
                weightKg: pets.weightKg,
                sizeBand: pets.sizeBand,
                sizeBandSource: pets.sizeBandSource,
              })
              .from(pets)
              .where(inArray(pets.id, petIds));

      // Each dog's last finished groom, for "Book again". Ordered newest
      // first and read per pet, so a dog with ten years of history costs
      // one indexed lookup (appointments is indexed on pet_id).
      const lastByPetId = new Map<number, any>();
      for (const petId of petIds) {
        const [last] = await db
          .select({
            id: appointments.id,
            serviceType: appointments.serviceType,
            price: appointments.price,
            staffId: appointments.staffId,
            scheduledStart: appointments.scheduledStart,
            scheduledEnd: appointments.scheduledEnd,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.tenantId, tenantId),
              eq(appointments.petId, petId),
              eq(appointments.workflowState, "complete"),
            ),
          )
          .orderBy(desc(appointments.scheduledStart))
          .limit(1);
        if (last) lastByPetId.set(petId, last);
      }

      // The extras that went with those grooms, so Book again carries the
      // de-matt and the glands rather than just the cut.
      const lastAppointmentIds = Array.from(lastByPetId.values()).map((row: any) => row.id);
      const addOnRows =
        lastAppointmentIds.length === 0
          ? []
          : await db
              .select({
                appointmentId: appointmentAddOns.appointmentId,
                pricingServiceId: appointmentAddOns.pricingServiceId,
                name: appointmentAddOns.name,
                unitPrice: appointmentAddOns.unitPrice,
                quantity: appointmentAddOns.quantity,
              })
              .from(appointmentAddOns)
              .where(
                and(
                  eq(appointmentAddOns.tenantId, tenantId),
                  inArray(appointmentAddOns.appointmentId, lastAppointmentIds),
                ),
              );

      return {
        tier: clientPriceTier({ hasCompletedAppointment }),
        hasCompletedAppointment,
        pets: petRows.map((pet: any) => {
          const last = lastByPetId.get(pet.id) ?? null;
          const minutes =
            last && last.scheduledStart && last.scheduledEnd
              ? Math.round(
                  (new Date(last.scheduledEnd).getTime() - new Date(last.scheduledStart).getTime()) /
                    60000,
                )
              : null;
          return {
            petId: pet.id,
            name: pet.name,
            breed: pet.breed,
            weightKg: pet.weightKg,
            sizeBand: pet.sizeBand,
            sizeBandSource: pet.sizeBandSource,
            last: last
              ? {
                  appointmentId: last.id,
                  serviceType: last.serviceType,
                  price: last.price,
                  staffId: last.staffId,
                  when: last.scheduledStart,
                  durationMinutes: minutes && minutes > 0 ? minutes : null,
                  addOns: addOnRows
                    .filter((addOn: any) => addOn.appointmentId === last.id)
                    .map((addOn: any) => ({
                      pricingServiceId: addOn.pricingServiceId,
                      name: addOn.name,
                      unitPrice: addOn.unitPrice,
                      quantity: addOn.quantity,
                    })),
                }
              : null,
          };
        }),
      };
    }),
});
