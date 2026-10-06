/**
 * Which salon is this request about?
 *
 * Today the answer is always 1, because the client sends `tenantId: 1`
 * in all 167 places it asks for anything and 122 server procedures
 * default to it. That works precisely as long as there is one salon.
 *
 * The moment there are two, a parameter the CALLER chooses decides whose
 * clients, pets and invoices come back — and the guard meant to catch it
 * (`requireApprovedStaffTenant`) returns null for admins, which every
 * real user currently is. So the tenant has to come from who is asking,
 * not from what they ask for.
 *
 * Pure so the precedence can be tested without a database, because
 * getting it wrong is either locking the salon out of its own data or
 * showing it somebody else's.
 */

export type TenantSources = {
  /** users.tenant_id — the authoritative link once it is populated. */
  userTenantId?: number | null;
  /**
   * staff.tenant_id for this user. Lauren, the owner, has no
   * users.tenant_id at all and only her staff record says which salon
   * she belongs to; resolving strictly from the user row would lock her
   * out of her own business.
   */
  staffTenantId?: number | null;
};

/**
 * Null means "this request has no salon of its own" — an unauthenticated
 * caller, or an account with no link to one. Callers must treat that as
 * "do not assume", never as "default to 1": defaulting is exactly the
 * behaviour being removed.
 */
export function resolveTenantId(sources: TenantSources): number | null {
  const fromUser = normalise(sources.userTenantId);
  if (fromUser !== null) return fromUser;
  const fromStaff = normalise(sources.staffTenantId);
  if (fromStaff !== null) return fromStaff;
  return null;
}

function normalise(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Is this caller allowed to ask about this salon?
 *
 * The whole point of the change. A request that names a tenant must name
 * the caller's own, or it is refused.
 *
 * An unresolved caller (`callerTenantId` null) is NOT refused here: the
 * public surface — online booking, the client portal — legitimately has
 * no signed-in user and is scoped by its own tokens instead. Refusing
 * those would take the booking page down. They get host-based resolution
 * separately; this function governs the authenticated surface.
 */
export function mayAccessTenant(callerTenantId: number | null, requestedTenantId: number | null | undefined): boolean {
  if (callerTenantId === null) return true;        // unauthenticated / public
  if (requestedTenantId === null || requestedTenantId === undefined) return true; // nothing named
  return callerTenantId === requestedTenantId;
}

/** What to say when it is refused. Names no salon the caller cannot see. */
export const CROSS_TENANT_MESSAGE = "That salon is not available to your account";
