/**
 * Keeping the revenue target out of general staff payloads.
 *
 * The target leaves the server through ONE procedure — revenueTargets.list,
 * which is gated on canAdministerStaff — and nowhere else. Everything that
 * hands back a staff record goes through here first.
 *
 * This exists because adding the column to schema.ts was enough to leak it.
 * Drizzle names every declared column in a bare select(), so
 * `db.select().from(staff)` started returning the target the moment it was
 * added, and two procedures spread that row straight into their response:
 *
 *   staff.getProfile  — adminProcedure, and SIX of the eight users here are
 *                       admins, four of them groomers. Every one of them
 *                       could have read anyone's target by opening a profile.
 *   staff.getMyPortal — a restricted staff account reading its own record.
 *
 * Stripping on the way out, rather than listing columns at each call site,
 * is deliberate: a new field spread into a response later cannot reopen this.
 */

export type MaybeWithRevenueTarget = {
  revenueTarget?: unknown;
  revenueTargetPeriod?: unknown;
};

/*
 * Constrained to `object`, not to MaybeWithRevenueTarget.
 *
 * Both of that type's properties are optional, which makes it a WEAK type:
 * TypeScript refuses any argument sharing no property with it. So a staff
 * record that never carried a target -- the thing this function is meant to
 * cope with, and what its own "copes with a record that never had them"
 * test passes -- was rejected at the call site. Nothing caught it because
 * every real caller hands over a full row from the staff table.
 *
 * The implementation still names MaybeWithRevenueTarget, since that is what
 * it destructures.
 */
export function withoutRevenueTarget<T extends object>(
  member: T,
): Omit<T, "revenueTarget" | "revenueTargetPeriod">;
export function withoutRevenueTarget<T extends object>(
  member: T | null | undefined,
): Omit<T, "revenueTarget" | "revenueTargetPeriod"> | null;
export function withoutRevenueTarget(member: MaybeWithRevenueTarget | null | undefined) {
  if (member === null || member === undefined) return null;
  const { revenueTarget: _target, revenueTargetPeriod: _period, ...rest } = member;
  return rest;
}
