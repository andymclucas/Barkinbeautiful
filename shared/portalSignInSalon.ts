/**
 * Which salon's portal account a sign-in belongs to.
 *
 * Every salon's clients sign in on the same portal page, and the login
 * email is unique only WITHIN a salon (uq_clients_tenant_portal_login_email).
 * Until 23/11/2026 every sign-in looked in Barkin' Beautiful alone, so a
 * client of any other salon could never get in. Now the email is looked up
 * in every salon:
 *
 *  - an emailed link or code goes out once per salon account, and the code
 *    or link itself identifies the account, so nothing needs choosing;
 *  - a password is tried against each account, and only when it is right
 *    for more than one salon is the person asked which salon they meant.
 */

export type PortalSalonChoice = { tenantId: number; name: string };

/** Accounts in a fixed order, so the same person always sees the same list. */
export function inSalonOrder<T extends { tenantId: number }>(accounts: readonly T[]): T[] {
  return [...accounts].sort((a, b) => a.tenantId - b.tenantId);
}

export type PasswordSignInDecision<T> =
  | { kind: "signIn"; account: T }
  | { kind: "choose"; salons: PortalSalonChoice[] }
  | { kind: "refused" };

/**
 * Given the accounts whose password matched, which one to sign in to.
 *
 * `chosenTenantId` is what the person picked after being asked. It only
 * ever selects among accounts whose password already matched, so it cannot
 * be used to reach an account the password does not open.
 */
export function decidePasswordSignIn<T extends { tenantId: number }>(input: {
  matched: readonly T[];
  chosenTenantId?: number | null;
  salonName: (tenantId: number) => string;
}): PasswordSignInDecision<T> {
  const matched = inSalonOrder(input.matched);
  if (matched.length === 0) return { kind: "refused" };
  if (input.chosenTenantId != null) {
    const chosen = matched.find((a) => a.tenantId === input.chosenTenantId);
    return chosen ? { kind: "signIn", account: chosen } : { kind: "refused" };
  }
  if (matched.length === 1) return { kind: "signIn", account: matched[0] };
  return {
    kind: "choose",
    salons: matched.map((a) => ({ tenantId: a.tenantId, name: input.salonName(a.tenantId) })),
  };
}
