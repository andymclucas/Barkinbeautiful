/**
 * The status a membership is CREATED with.
 *
 * Andy, 08/10/2026: a membership can be added to a client's record while
 * they are still on the phone, without starting the weekly charge. Somebody
 * presses Set Weekly Billing afterwards. Until then it must read "Added —
 * not billing yet" (see shared/membershipBillingState.ts), which is derived
 * from `pending_payment` with no subscription.
 *
 * This is a function, with a test, because the rule was once written inline
 * in `memberships.create` as
 *
 *   { ...(startPending ? { status: "pending_payment" } : {}), …, status: "active" }
 *
 * and the later key overwrote the spread. From 8056242 (08/10/2026) until
 * 12/11/2026 every membership added that way was created `active`: it
 * covered grooms and counted in the active totals while charging nobody,
 * and Set Weekly Billing then refused it as "already billing weekly".
 */
export type InitialMembershipStatus = "active" | "pending_payment";

export function initialMembershipStatus(input: {
  startPending?: boolean | null;
}): InitialMembershipStatus {
  return input.startPending === true ? "pending_payment" : "active";
}
