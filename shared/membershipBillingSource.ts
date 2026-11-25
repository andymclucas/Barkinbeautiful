/**
 * Who is actually billing a membership: Groomigo, or still MoeGo.
 *
 * Andy, 25/11/2026: "Do not class memberships as 'active' if they are not
 * currently being billed in Groomigo. For the ones that are still showing
 * as being billed in MoeGo ... Add another section that shows 'to be
 * migrated'. I need these separated so we can run a report that has clean
 * data on who is on a membership, but still only billing in MoeGo vs
 * Groomigo."
 *
 * The stored status stays "active" for both. It is what makes a membership
 * cover its grooms (shared/appointmentMembershipCoverage), and a MoeGo-billed
 * member is still a member. This only splits the list.
 *
 * Billed in Groomigo means a subscription exists to charge it: a Stripe
 * subscription, or another gateway's. Everything else is collected outside
 * Groomigo, which today means MoeGo. Same test as membershipBillingState's
 * "hasSubscription", without the date-and-card case, which charges nothing
 * on its own.
 */
export type BillingSource = "groomigo" | "moego";

export function billingSourceOf(m: {
  stripeSubscriptionId?: string | null;
  gatewaySubscriptionId?: string | null;
}): BillingSource {
  const has = (v: string | null | undefined) => typeof v === "string" && v.trim() !== "";
  return has(m.stripeSubscriptionId) || has(m.gatewaySubscriptionId) ? "groomigo" : "moego";
}

/** The Memberships list tabs that are filters on the list, and what each asks for. */
export const MEMBERSHIP_LIST_TABS = {
  active: { status: "active", billing: "groomigo" },
  to_migrate: { status: "active", billing: "moego" },
  pending_payment: { status: "pending_payment" },
  paused: { status: "paused" },
  cancelled: { status: "cancelled" },
} as const satisfies Record<string, { status: string; billing?: BillingSource }>;

export type MembershipListTab = keyof typeof MEMBERSHIP_LIST_TABS;

export function membershipListFilter(tab: string): { status?: string; billing?: BillingSource } {
  return (MEMBERSHIP_LIST_TABS as Record<string, { status: string; billing?: BillingSource }>)[tab] ?? {};
}
