/**
 * Whether a membership is actually billing in Groomigo, or only exists here
 * as a record of something MoeGo is still running.
 *
 * Andy, 08/10/2026: clients "active in MoeGo only... needs to be flagged on
 * Groomigo... so we can know that they aren't live in the Groomigo system
 * until the billing weekly button is clicked and card details are entered."
 *
 * He is right, and the scale of it is worth stating. On 08/10/2026 all 154
 * of the salon's memberships read "✓ Active" on screen. Every single one has
 * payment_gateway "other", no Stripe subscription, no gateway subscription
 * and no next billing date. $4,101 a week of memberships, and Groomigo
 * charges none of it — a green tick on each one saying otherwise.
 *
 * So the badge is DERIVED, never stored. A stored flag would have to be
 * backfilled onto 154 rows and would drift the first time somebody set up
 * billing without updating it. What makes a membership live is whether it
 * has the means to take money, which the row already says.
 */

export type MembershipBillingState =
  | "live"              // billing weekly in Groomigo
  | "needs_migration"   // says active, but nothing here can charge it
  | "added_not_live"    // deliberately added without starting billing
  | "paused"
  | "ended";

export type MembershipBillingInput = {
  status: string | null | undefined;
  nextBillingDate: Date | string | null | undefined;
  stripeSubscriptionId?: string | null;
  gatewaySubscriptionId?: string | null;
  /** Whether the client has a card Groomigo could charge. */
  hasCardOnFile?: boolean | null;
};

export function membershipBillingState(m: MembershipBillingInput): MembershipBillingState {
  if (m.status === "cancelled" || m.status === "expired") return "ended";
  if (m.status === "paused") return "paused";
  // Added on the phone and not yet made live. The deliberate version of
  // "not billing", as distinct from the accidental one below.
  if (m.status === "pending_payment") return "added_not_live";

  const hasSubscription = Boolean(m.stripeSubscriptionId || m.gatewaySubscriptionId);
  const hasSchedule = Boolean(m.nextBillingDate);
  // A subscription charges on its own. Without one, Groomigo needs both a
  // date to charge on and a card to charge — either alone takes no money.
  if (hasSubscription) return "live";
  if (hasSchedule && m.hasCardOnFile) return "live";

  // Says active, cannot charge. This is every membership imported from
  // MoeGo, which is all of them today.
  return "needs_migration";
}

export const BILLING_STATE_LABEL: Record<MembershipBillingState, string> = {
  live: "Billing weekly",
  needs_migration: "In MoeGo only — needs migration",
  added_not_live: "Added — not billing yet",
  paused: "Paused",
  ended: "Ended",
};

/** One line saying what to do about it, or null when nothing is needed. */
export function billingStateHint(state: MembershipBillingState): string | null {
  switch (state) {
    case "needs_migration":
      return "MoeGo is still charging this client. Groomigo is not. Press Set Weekly Billing and add a card to move it across.";
    case "added_not_live":
      return "Nothing is being charged yet. Press Set Weekly Billing when the client is ready.";
    default:
      return null;
  }
}

/** True when somebody should act on this. Drives the count on the tab. */
export function needsAttention(state: MembershipBillingState): boolean {
  return state === "needs_migration" || state === "added_not_live";
}
