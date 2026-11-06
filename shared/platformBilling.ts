/**
 * Groomigo charging a salon for Groomigo.
 *
 * Lauren's second salon, The Pet Pad, goes live 23/11/2026 as a paying
 * subscriber. Barkin' Beautiful is Andy's own and does not pay, so this is
 * the first money that flows TOWARDS the platform rather than through it.
 *
 * ## This is the opposite direction to everything else here
 *
 * `stripeConnect` and `stripePayments` move a dog owner's money to the
 * SALON — on the salon's own connected account where it has one, falling
 * back to the platform account where it does not. This file moves the
 * SALON's money to Groomigo, and that is always the platform account.
 *
 * The distinction is not pedantic. A Stripe customer belongs to the
 * account it was created on, so reusing `clients.stripe_customer_id` — or
 * any id minted while a connected account was in play — produces "No such
 * customer" at best and bills the wrong party at worst. Every id this
 * feature stores is named `platform*` so the next person cannot pick the
 * wrong one by reaching for the obvious name.
 *
 * ## Why the status mapping is here and not inline
 *
 * Stripe has eight subscription statuses and `tenants.subscription_status`
 * has four. Collapsing them is a judgement about who keeps access to their
 * salon's diary, which is worth testing without a webhook, a Stripe
 * account or a database.
 */

/** What tenants.subscription_status can hold. */
export type SalonSubscriptionStatus = "active" | "past_due" | "cancelled" | "trialing";

/** What Stripe reports. Listed in full so a new one cannot pass silently. */
export type StripeSubscriptionStatus =
  | "active" | "past_due" | "unpaid" | "canceled"
  | "incomplete" | "incomplete_expired" | "trialing" | "paused";

/**
 * Stripe's status, as ours.
 *
 * The two that deserve explaining:
 *
 * `incomplete` is a subscription whose FIRST payment has not gone through
 * — the card was declined at sign-up. It maps to past_due rather than
 * cancelled because it is recoverable: Stripe keeps it open for 23 hours
 * and a working card rescues it. Treating it as cancelled would tell a
 * salon that mistyped a card number that their account is gone.
 *
 * `paused` is Stripe's own pause-collection. Nobody is paying, so it
 * cannot read as active — but it is not cancelled either, and past_due is
 * the state this app already knows how to show and recover from.
 *
 * An unrecognised status maps to past_due, never active. Guessing in the
 * direction of "they have paid" is the one guess that costs money.
 */
export function salonStatusFromStripe(status: string): SalonSubscriptionStatus {
  switch (status) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused": return "past_due";
    case "canceled":
    case "incomplete_expired": return "cancelled";
    default: return "past_due";
  }
}

/**
 * Can this salon use the product?
 *
 * Deliberately generous to past_due. A card that expired overnight must
 * not take a salon's diary away on the morning of a full book — they have
 * dogs arriving at 7:30 and no way to serve them without it. The existing
 * trial expiry already holds the line on people who never paid at all,
 * and its allowlist lets even those sign in, read why and fix it.
 *
 * Cancelled is the only state that stops the product, and only once the
 * period they paid for has actually run out.
 */
export function salonHasAccess(input: {
  status: SalonSubscriptionStatus;
  /** End of the period already paid for. */
  currentPeriodEnd?: Date | null;
  now?: Date;
}): boolean {
  if (input.status !== "cancelled") return true;
  const now = input.now ?? new Date();
  const paidUntil = input.currentPeriodEnd ?? null;
  // Cancelled mid-period: they bought the month, they keep the month.
  return paidUntil !== null && paidUntil.getTime() > now.getTime();
}

/** One line for the salon's own billing page and the switcher badge. */
export function describeSalonSubscription(input: {
  status: SalonSubscriptionStatus;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const day = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "Australia/Brisbane" });

  switch (input.status) {
    case "active":
      return input.currentPeriodEnd
        ? `Active — renews ${day(input.currentPeriodEnd)}`
        : "Active";
    case "trialing":
      return input.trialEndsAt
        ? `Free trial — ends ${day(input.trialEndsAt)}`
        : "Free trial";
    case "past_due":
      // Says what to do, not just what is wrong. "Past due" on its own
      // sends somebody looking for a phone number.
      return "Payment failed — update the card to keep the salon running";
    case "cancelled":
      return input.currentPeriodEnd && input.currentPeriodEnd.getTime() > now.getTime()
        ? `Cancelled — access until ${day(input.currentPeriodEnd)}`
        : "Cancelled";
  }
}

/**
 * Does this Stripe object belong to the PLATFORM subscription feature?
 *
 * Memberships already run Stripe subscriptions — a client paying the salon
 * weekly — and they produce the same `invoice.*` and
 * `customer.subscription.*` events on the same webhook. Barkin' Beautiful
 * has no connected account, so those membership subscriptions live on the
 * platform account too and `event.account` does NOT separate them.
 *
 * So the discriminator is a marker we put there ourselves. Required, and
 * checked before any platform handler claims an event: the webhook records
 * each event id once and returns early on a duplicate, so a handler that
 * claimed a membership invoice by mistake would silently stop that
 * membership's billing from ever being processed.
 */
export const PLATFORM_SUBSCRIPTION_MARKER = "groomigo_platform_subscription";

export function isPlatformSubscriptionMetadata(
  metadata: Record<string, string> | null | undefined,
): boolean {
  return (metadata ?? {})[PLATFORM_SUBSCRIPTION_MARKER] === "1";
}

export function platformSubscriptionMetadata(tenantId: number): Record<string, string> {
  return {
    [PLATFORM_SUBSCRIPTION_MARKER]: "1",
    groomigo_tenant_id: String(tenantId),
  };
}
