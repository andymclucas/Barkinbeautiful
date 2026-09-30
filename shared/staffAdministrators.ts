/**
 * Who may change SOMEONE ELSE'S staff record.
 *
 * `protectedProcedure` was doing this job and it is far too wide: it means
 * "signed in and not a restricted staff account", and six people currently
 * hold `users.role = "admin"` - four of them groomers who were made admins to
 * get at the salon floor, not to administer personnel. Any of them could edit
 * anyone's pay-adjacent details, portal access or role.
 *
 * Editing your OWN profile is a different thing and is not gated by this:
 * every staff member can do that through staff.updateMyProfile.
 *
 * Identified by user id first, because ids are stable primary keys, with
 * email as a fallback so the list survives an account being recreated. Both
 * are deliberately explicit: there is no role that distinguishes Lauren and
 * Andy from the other admins, and inventing one would be a bigger change than
 * this warrants.
 */
export const STAFF_ADMINISTRATOR_USER_IDS: readonly number[] = [
  1,      // Lauren Romari - salon owner
  30001,  // Andy McLucas
];

export const STAFF_ADMINISTRATOR_EMAILS: readonly string[] = [
  "barkinbeautiful@hotmail.com.au",
  "mclucas.andy@gmail.com",
];

export function canAdministerStaff(user: { id?: number | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.id === "number" && STAFF_ADMINISTRATOR_USER_IDS.includes(user.id)) return true;
  const email = (user.email ?? "").trim().toLowerCase();
  return email !== "" && STAFF_ADMINISTRATOR_EMAILS.includes(email);
}

export const STAFF_ADMIN_DENIED_MESSAGE =
  "Only the salon owner can change another staff member's details. You can edit your own from My Profile.";
