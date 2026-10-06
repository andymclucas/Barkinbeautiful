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
