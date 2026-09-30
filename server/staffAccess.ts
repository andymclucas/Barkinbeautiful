/**
 * Who may touch which appointment.
 *
 * These guards live here rather than inside routers.ts because a second
 * router file (payments) now needs them, and a security check that exists in
 * two copies is a security check that will drift. `operationalProcedure` only
 * establishes that the caller is signed in - restricted `staff` accounts pass
 * it - so anything reached that way has to ask these before touching a row.
 *
 * An admin gets null back: there is no salon staff profile to scope them to,
 * and they are allowed across tenants. Anyone who is neither admin nor
 * approved staff is rejected.
 */
import { eq } from "drizzle-orm";
import { appointments, pets, staff } from "../drizzle/schema";

export async function requireApprovedStaffTenant(db: any, user: { id: number; role: string }) {
  if (user.role === "admin") return null;
  if (user.role !== "staff") throw new Error("Only approved staff can access salon operations");
  const [portalStaff] = await db.select({ id: staff.id, tenantId: staff.tenantId, role: staff.role, portalStatus: staff.portalStatus })
    .from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!portalStaff || portalStaff.portalStatus !== "approved") {
    throw new Error("Your staff access is awaiting administrator approval");
  }
  return portalStaff;
}

export async function requireApprovedFamilyLinkStaff(db: any, user: { id: number; role: string }) {
  const portalStaff = await requireApprovedStaffTenant(db, user);
  if (!portalStaff) return null;
  if (portalStaff.role !== "groomer" && portalStaff.role !== "bather") {
    throw new Error("Only approved Groomers and Bathers can create family links from Workflow");
  }
  return portalStaff;
}

export async function requireApprovedStaffAppointmentAccess(db: any, user: { id: number; role: string }, appointmentId: number, expectedPetId?: number) {
  const portalStaff = await requireApprovedStaffTenant(db, user);
  if (!portalStaff) return null;
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appointment || appointment.tenantId !== portalStaff.tenantId || (expectedPetId !== undefined && appointment.petId !== expectedPetId)) {
    throw new Error("This appointment is not available to your salon staff profile");
  }
  return portalStaff;
}

export async function requireApprovedStaffPetAccess(db: any, user: { id: number; role: string }, petId: number) {
  const portalStaff = await requireApprovedStaffTenant(db, user);
  if (!portalStaff) return null;
  const [pet] = await db.select({ id: pets.id, tenantId: pets.tenantId }).from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet || pet.tenantId !== portalStaff.tenantId) {
    throw new Error("This pet is not available to your salon staff profile");
  }
  return portalStaff;
}
