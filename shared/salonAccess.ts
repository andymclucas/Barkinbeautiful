/**
 * Which salon a request acts on, when a person belongs to more than one.
 *
 * Lauren bought The Pet Pad, live 23/11/2026, and runs it alongside
 * Barkin' Beautiful. Separate books — own clients, pets, staff, calendar,
 * pricing and subscription — so this is two TENANTS and a switcher, not
 * the shared-site rebuild her 12/10/2026 note rightly says needs its own
 * scoping pass.
 *
 * ## This is the security boundary, so it is a pure function
 *
 * Everything the salon can see is filtered by the number this returns.
 * Get it wrong in one direction and Lauren is locked out of a business
 * she owns; get it wrong in the other and one salon reads another's
 * clients. Neither is acceptable and neither needs a database to test.
 *
 * ## The requested salon is NEVER trusted
 *
 * It arrives from the browser, so it is checked against the list of
 * salons this user actually has access to — a list the server built from
 * the user's own rows. An unrecognised request is IGNORED rather than
 * refused: falling back to their own salon leaves them working, where
 * throwing would lock somebody out of everything because one tab held a
 * stale selection. That matches the rule already in createContext — a
 * signed-in caller's own salon always wins over anything in the request.
 *
 * ## And it is deterministic
 *
 * tenantForUser used to fall back to `staff.tenantId` with `.limit(1)`
 * and no ordering. With one salon that is fine. The moment Lauren has a
 * staff row at both, which salon she lands in is whatever the database
 * happens to return first — different between two requests, with no
 * error to notice. Ordering is not tidiness here.
 */

export type ActiveSalonInput = {
  /**
   * What the browser asked for. Untrusted: validated against `accessible`
   * and discarded if it is not in it.
   */
  requested?: number | null;
  /**
   * Every salon this user may act in, built server-side from their own
   * rows. Order is not significant; the lowest id is the tie-break.
   */
  accessible: readonly number[];
  /**
   * Their home salon — users.tenant_id, or the salon on their staff
   * record. Used when nothing was requested.
   */
  fallback?: number | null;
};

/** Null means "this request has no salon", never "default to 1". */
export function resolveActiveSalon(input: ActiveSalonInput): number | null {
  const accessible = [...new Set(input.accessible.filter(isUsableId))].sort((a, b) => a - b);
  if (accessible.length === 0) return null;

  const requested = isUsableId(input.requested) ? input.requested : null;
  if (requested !== null && accessible.includes(requested)) return requested;

  const fallback = isUsableId(input.fallback) ? input.fallback : null;
  if (fallback !== null && accessible.includes(fallback)) return fallback;

  // Deterministic, so two requests from the same person in the same
  // second cannot land in different salons.
  return accessible[0]!;
}

/** Can this user act in that salon at all? */
export function canAccessSalon(accessible: readonly number[], tenantId: number | null | undefined): boolean {
  return isUsableId(tenantId) && accessible.includes(tenantId);
}

/**
 * Should the switcher be shown?
 *
 * One salon is the overwhelming majority of accounts and must not grow a
 * dropdown that does nothing — it would read as a setting somebody has
 * failed to configure.
 */
export function shouldOfferSalonSwitcher(accessible: readonly number[]): boolean {
  return new Set(accessible.filter(isUsableId)).size > 1;
}

function isUsableId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
