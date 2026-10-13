/**
 * Who among the salon's own people may do what.
 *
 * The guards in server/staffAccess.ts take a database handle, so they
 * cannot be unit-tested without mocking one — which is why the decisions
 * inside them were "tested" by grepping routers.ts for the literal
 * `portalStaff.role !== "groomer" && portalStaff.role !== "bather"`. That
 * assertion did not even know which file it had found: the test
 * concatenated routers.ts and staffAccess.ts and searched the pair.
 *
 * The decisions are pure. They live here; the guards keep the queries.
 *
 * Two role systems meet here and must not be conflated (CLAUDE.md §5):
 * `users.role` is platform level — user | admin | staff — and
 * `staff.role` is salon level — owner | groomer | bather | receptionist |
 * manager. A `users.role` of "staff" is the RESTRICTED account; six of the
 * eight real users are "admin" and bypass all of this.
 */

/** What a platform-level role means before any lookup. */
export type PlatformAccess =
  /** Unrestricted: no salon profile is consulted. */
  | { kind: "unrestricted" }
  /** Not salon staff at all — a client portal user, say. */
  | { kind: "denied"; reason: string }
  /** A restricted staff account; their salon profile decides the rest. */
  | { kind: "check_profile" };

export function platformAccess(role: string | null | undefined): PlatformAccess {
  if (role === "admin") return { kind: "unrestricted" };
  if (role !== "staff") {
    return { kind: "denied", reason: "Only approved staff can access salon operations" };
  }
  return { kind: "check_profile" };
}

/**
 * A staff profile is usable only once an administrator has approved it.
 *
 * "invited" and "awaiting_approval" are people who exist but have not been
 * let in yet; "revoked" is someone who has been let out again. Treating
 * any of them as approved would hand the salon floor to somebody nobody
 * admitted.
 */
export const APPROVED_PORTAL_STATUS = "approved";

export function isApprovedStaffProfile(portalStatus: string | null | undefined): boolean {
  return portalStatus === APPROVED_PORTAL_STATUS;
}

/**
 * Who may link dogs into a family group from the Workflow board.
 *
 * Deliberately the people on the floor. A receptionist or manager is not
 * standing over the dogs working out that these two came in together, and
 * a family link changes how a booking is grouped and billed.
 */
export const FAMILY_LINK_SALON_ROLES: readonly string[] = ["groomer", "bather"];

export function canCreateFamilyLinks(salonRole: string | null | undefined): boolean {
  return FAMILY_LINK_SALON_ROLES.includes((salonRole ?? "").trim());
}

/**
 * Whether a restricted staff member may touch a row from this salon.
 *
 * Trivial, and stated anyway: it is the single comparison that keeps one
 * salon's staff out of another's appointments, and it was previously only
 * ever asserted by finding the text `requireApprovedStaffTenant` somewhere
 * in a file — which it appears in 24 times.
 */
export function ownsTenantRow(
  rowTenantId: number | null | undefined,
  staffTenantId: number | null | undefined,
): boolean {
  return (
    typeof rowTenantId === "number" &&
    typeof staffTenantId === "number" &&
    rowTenantId === staffTenantId
  );
}
