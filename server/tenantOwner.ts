/**
 * Who may change a salon's own settings.
 *
 * canAdministerStaff — the existing gate on salon-wide settings — is Lauren
 * and Andy by user id. That is correct for Barkin' Beautiful and useless for
 * anybody else: a second salon's owner could not change their own branding,
 * and could not set the number their texts send from, which means they could
 * not send texts at all.
 *
 * So: the platform's administrators, OR the owner of the salon in question.
 * The owner is identified by their own staff record for that tenant, not by
 * users.role — six of the eight users here hold users.role = "admin",
 * four of them groomers, so role proves nothing.
 */
import { and, eq } from "drizzle-orm";
import { staff } from "../drizzle/schema";
import { canAdministerStaff } from "@shared/staffAdministrators";

export const NOT_SALON_OWNER =
  "Only the salon owner can change this.";

export async function isSalonOwner(
  db: any,
  user: { id: number; email?: string | null } | null | undefined,
  tenantId: number,
): Promise<boolean> {
  if (!user) return false;
  // Platform administrators, who are not any one salon's staff.
  if (canAdministerStaff(user)) return true;

  const [member] = await db
    .select({ role: staff.role })
    .from(staff)
    .where(and(eq(staff.userId, user.id), eq(staff.tenantId, tenantId)))
    .limit(1);
  return member?.role === "owner";
}

export async function requireSalonOwner(
  db: any,
  user: { id: number; email?: string | null } | null | undefined,
  tenantId: number,
): Promise<void> {
  if (!(await isSalonOwner(db, user, tenantId))) throw new Error(NOT_SALON_OWNER);
}
