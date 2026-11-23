/**
 * Each salon taking its own clients' money.
 *
 * Today every payment runs through one platform key, so a client paying
 * their groomer is paying Groomigo's Stripe account. That is correct
 * while Groomigo IS Barkin' Beautiful and wrong the moment it is not — a
 * second salon's takings would land in somebody else's bank.
 *
 * Express accounts: Stripe hosts the onboarding, so the salon answers
 * Stripe's questions about bank details and identity and comes back. The
 * platform never handles their keys, and charges are made DIRECTLY on
 * their account, so the money never touches Groomigo's balance.
 *
 * Pure, because the two things most worth getting right here — whether a
 * salon may take payments yet, and how much Groomigo keeps — are both
 * arithmetic and both expensive to get wrong.
 */

export type ConnectState =
  /** No Express account has been created. */
  | "not_started"
  /** Account exists, the salon has not finished Stripe's questions. */
  | "onboarding"
  /** Finished, but Stripe wants more before money can move. */
  | "restricted"
  /** Taking payments and paying out. */
  | "ready";

export type ConnectStatusInput = {
  stripeAccountId?: string | null;
  stripeChargesEnabled?: boolean | null;
  stripePayoutsEnabled?: boolean | null;
  stripeDetailsSubmitted?: boolean | null;
};

export function connectState(t: ConnectStatusInput): ConnectState {
  if (!t.stripeAccountId) return "not_started";
  if (!t.stripeDetailsSubmitted) return "onboarding";
  // Charges is the one that matters for taking money. A salon can be
  // charging while payouts are still held — Stripe does that routinely
  // during review — and refusing to let them take bookings for it would
  // be worse than a delayed payout they can see in their own dashboard.
  if (!t.stripeChargesEnabled) return "restricted";
  return "ready";
}

/**
 * Should this salon's payments go to their own account?
 *
 * ONLY when Stripe says they can take charges. Anything else falls back
 * to the platform account, which is exactly what happens today — so a
 * salon part-way through onboarding keeps working rather than finding
 * their clients cannot pay.
 */
export function chargesOnConnectedAccount(t: ConnectStatusInput): boolean {
  return connectState(t) === "ready";
}

export function describeConnectState(state: ConnectState): string {
  switch (state) {
    case "not_started":
      return "Connect a Stripe account so your clients' payments go straight to your bank.";
    case "onboarding":
      return "Stripe still needs a few details before payments can be taken. Pick up where you left off.";
    case "restricted":
      return "Stripe is reviewing this account and is holding payments until it has what it needs.";
    case "ready":
      return "Payments go straight to your bank.";
  }
}

/**
 * Groomigo's cut of a payment, in cents.
 *
 * Basis points, not percent: 250 is 2.5%. A percent stored as a decimal
 * invites a 0.025 / 2.5 confusion that is only ever discovered by someone
 * being charged a hundred times too much.
 *
 * NULL means nobody has decided a fee, and nothing is taken. Zero means
 * deliberately nothing. They are different, and only the second should
 * ever be described to a salon as "no fee".
 */
export function platformFeeCents(amountCents: number, feeBps: number | null | undefined): number | null {
  if (feeBps === null || feeBps === undefined) return null;
  if (!Number.isFinite(feeBps) || feeBps < 0) return null;
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  // Floor, not round: never take more than the stated percentage. A cent
  // in Groomigo's favour on every transaction is the kind of thing a
  // salon finds and does not forgive.
  const fee = Math.floor((amountCents * feeBps) / 10_000);
  // And never more than the payment itself, whatever is configured.
  return Math.max(0, Math.min(fee, amountCents));
}

/** 250 -> "2.5%". For showing a salon what they are being charged. */
export function describeFeeBps(feeBps: number | null | undefined): string {
  if (feeBps === null || feeBps === undefined) return "not set";
  if (feeBps === 0) return "no fee";
  return `${(feeBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Guard rail on anything an administrator can type into the fee field. */
export const MAX_PLATFORM_FEE_BPS = 3000; // 30%

export type ClientMoneyAccount =
  | { kind: "platform" }
  | { kind: "connected"; accountId: string }
  | { kind: "refused"; reason: string };

/**
 * Whose Stripe account a salon's CLIENT payments are taken on.
 *
 * The platform account (STRIPE_SECRET_KEY) is Barkin' Beautiful's own
 * Stripe. Until 23/11/2026 every salon without a ready connected account
 * "fell back" to it, which for any salon but Barkin' Beautiful means its
 * clients' money landing in another business's bank. Now:
 *
 *  - the home salon always uses the platform account: it IS its own;
 *  - every other salon takes money only on its own connected account, and
 *    is refused until that account can take charges.
 *
 * A connected account is also only used once Groomigo can hear its events
 * (`connectEventsReceived`, STRIPE_CONNECT_WEBHOOK_SECRET). A payment taken
 * on a connected account raises its events THERE, and they reach only a
 * Connect webhook; without one the client is charged and the invoice is
 * never marked paid.
 */
export function clientMoneyAccount(input: {
  tenantId: number;
  homeTenantId: number;
  tenant: ConnectStatusInput | null;
  connectEventsReceived: boolean;
}): ClientMoneyAccount {
  // Always, even if it one day connects an Express account: every saved
  // card, customer and subscription it has lives on the platform account,
  // and switching would leave them all unfindable.
  if (input.tenantId === input.homeTenantId) return { kind: "platform" };
  const connectedReady = Boolean(input.tenant && chargesOnConnectedAccount(input.tenant) && input.tenant.stripeAccountId);
  if (connectedReady && input.connectEventsReceived) {
    return { kind: "connected", accountId: input.tenant!.stripeAccountId! };
  }
  if (!connectedReady) {
    return {
      kind: "refused",
      reason: "Card payments are not set up for this salon yet. Connect the salon's own Stripe account in Settings → Payment first.",
    };
  }
  return {
    kind: "refused",
    reason: "This salon's Stripe account is connected, but Groomigo is not receiving its payment notices yet, so a payment could not be recorded. Card payments stay off until that is set up.",
  };
}

/**
 * Why an event from a salon's connected account must not be processed, or
 * null when it may be.
 *
 * The handlers file events by the metadata on them. An event from salon A's
 * account that names salon B, or salon B's client, is wrong whatever caused
 * it, and processing it would write to B's records on A's say-so.
 */
export function connectedEventProblem(input: {
  accountTenantId: number;
  metadataTenantId: number | null;
  clientId: number | null;
  clientTenantId: number | null;
  /** Whether the metadata names an invoice or membership by id. */
  namesARecord?: boolean;
  membershipId?: number | null;
  membershipTenantId?: number | null;
}): string | null {
  if (input.metadataTenantId !== null && input.metadataTenantId !== input.accountTenantId) {
    return `it names salon ${input.metadataTenantId}`;
  }
  /*
   * The handlers read an invoice or membership id with a salon that
   * DEFAULTS TO 1 when metadata has none. Every payment Groomigo creates
   * carries tenant_id; one that names a record without it was made
   * somewhere else, and would mark Barkin' Beautiful's invoice of that
   * number paid.
   */
  if (input.namesARecord && input.metadataTenantId === null) {
    return "it names an invoice or membership but no salon";
  }
  if (input.membershipId != null && input.membershipTenantId !== input.accountTenantId) {
    return `membership ${input.membershipId} is not this salon's`;
  }
  if (input.clientId !== null && input.clientTenantId !== input.accountTenantId) {
    return `client ${input.clientId} is not this salon's`;
  }
  return null;
}
