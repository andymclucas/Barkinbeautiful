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
      if (!input.trialEndsAt) return "Free trial";
      // Once it has run out this is the first line of the one page the
      // salon can still open, so it says what happened and what to do.
      return input.trialEndsAt.getTime() <= now.getTime()
        ? `Free trial ended ${day(input.trialEndsAt)} — choose a plan to carry on`
        : `Free trial — ends ${day(input.trialEndsAt)}`;
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

/**
 * Which salon a marked Stripe object belongs to, or null.
 *
 * Null is the important answer. A missing, zero, negative or garbled
 * tenant id is NOT "tenant 1" — tenant 1 is Barkin' Beautiful, and the
 * generic checkout handler's `Number(metadata.tenant_id || 1)` default is
 * exactly how a platform payment would be filed under the one salon that
 * never pays. There is no default here at all.
 */
export function platformTenantIdFromMetadata(
  metadata: Record<string, string> | null | undefined,
): number | null {
  if (!isPlatformSubscriptionMetadata(metadata)) return null;
  const raw = (metadata ?? {}).groomigo_tenant_id;
  if (typeof raw !== "string" || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Metadata keys that only a salon's OWN client payments carry — a
 * membership, an invoice link, a card on file, the portal's pay-today.
 * platformSubscriptionMetadata() never writes any of them.
 */
export const CLIENT_PAYMENT_METADATA_KEYS = [
  "tenant_id", "client_id", "groomigo_client_id", "membership_id",
  "groomigo_membership_id", "invoice_id", "payment_kind", "appointment_ids",
] as const;

type StripeRef = string | { id?: string | null } | null | undefined;
const refId = (ref: StripeRef): string | null => {
  if (!ref) return null;
  const id = typeof ref === "string" ? ref : ref.id;
  return typeof id === "string" && id.trim() ? id : null;
};

export type PlatformCheckoutDecision =
  /** A salon's own client paying the salon. Not ours; the other handlers take it. */
  | { kind: "not_platform" }
  /** A salon paying Groomigo, and everything needed to link it. */
  | { kind: "platform"; tenantId: number; subscriptionId: string; customerId: string }
  /** Carries our marker but cannot be trusted. Handled by NOBODY. */
  | { kind: "refused"; reason: string };

/**
 * Is this completed Checkout a salon subscribing to Groomigo, and which
 * salon?
 *
 * Asked before any other checkout handler, because the two directions of
 * money share one webhook and one Stripe account:
 *
 *   - no marker            -> not ours, whatever else it looks like. A
 *                             client's membership or one-off payment can
 *                             never be claimed here.
 *   - marker, and sound    -> ours, for the tenant the marker names.
 *   - marker, but unsound  -> refused. It is not handed on to the client
 *                             handlers either, because their default
 *                             tenant is 1 and a platform payment must
 *                             never be filed under Barkin' Beautiful.
 *
 * "Unsound" includes a marked session that ALSO carries client-payment
 * keys. No code writes both, so one that has both is a bug somewhere, and
 * guessing which half to believe is how money gets filed under the wrong
 * party.
 */
export function classifyPlatformCheckout(session: {
  mode?: string | null;
  metadata?: Record<string, string> | null;
  subscription?: StripeRef;
  customer?: StripeRef;
}): PlatformCheckoutDecision {
  const metadata = session.metadata ?? {};
  if (!isPlatformSubscriptionMetadata(metadata)) return { kind: "not_platform" };

  const mixed = CLIENT_PAYMENT_METADATA_KEYS.filter((key) => key in metadata);
  if (mixed.length > 0) {
    return { kind: "refused", reason: `carries the platform marker and client-payment metadata (${mixed.join(", ")})` };
  }
  if (session.mode !== "subscription") {
    return { kind: "refused", reason: `platform marker on a "${session.mode ?? "unknown"}" checkout, not a subscription` };
  }
  const tenantId = platformTenantIdFromMetadata(metadata);
  if (tenantId === null) return { kind: "refused", reason: "platform marker without a usable salon id" };
  const subscriptionId = refId(session.subscription);
  if (!subscriptionId) return { kind: "refused", reason: "platform checkout completed without a subscription id" };
  const customerId = refId(session.customer);
  if (!customerId) return { kind: "refused", reason: "platform checkout completed without a customer id" };

  return { kind: "platform", tenantId, subscriptionId, customerId };
}

/**
 * May this salon's record be pointed at this subscription?
 *
 * The marker says which salon; this checks the claim against things only
 * we could have written. The customer was created by us for this salon
 * and stored before Checkout opened, and the subscription carries its own
 * copy of the marker. All three have to name the same salon.
 *
 * A salon that already has a DIFFERENT live subscription keeps it. Two
 * completed checkouts means two things charging one salon, which a person
 * has to untangle in Stripe — silently swapping which one the app follows
 * would hide the one it stopped looking at.
 */
export function platformLinkProblem(input: {
  tenantId: number;
  subscriptionId: string;
  customerId: string | null;
  tenant: { platformStripeCustomerId: string | null; platformStripeSubscriptionId: string | null } | null;
  subscriptionMetadata: Record<string, string> | null | undefined;
}): { problem: null } | { problem: "refuse" | "second_subscription"; reason: string } {
  if (!input.tenant) return { problem: "refuse", reason: `salon ${input.tenantId} does not exist` };
  if (!input.tenant.platformStripeCustomerId || input.tenant.platformStripeCustomerId !== input.customerId) {
    return { problem: "refuse", reason: `Stripe customer ${input.customerId ?? "(none)"} is not salon ${input.tenantId}'s billing customer` };
  }
  if (platformTenantIdFromMetadata(input.subscriptionMetadata) !== input.tenantId) {
    return { problem: "refuse", reason: `subscription ${input.subscriptionId} is not marked for salon ${input.tenantId}` };
  }
  const existing = input.tenant.platformStripeSubscriptionId;
  if (existing && existing !== input.subscriptionId) {
    return {
      problem: "second_subscription",
      reason: `salon ${input.tenantId} already follows ${existing}; ${input.subscriptionId} is a second subscription and needs cancelling or refunding in Stripe`,
    };
  }
  return { problem: null };
}

/**
 * Which plan a Stripe price buys.
 *
 * The price on the subscription is the truth about what the salon is
 * paying for — it is what Stripe charges, and it follows a plan change
 * made in Stripe's own portal. Null for a price we do not recognise, and
 * the caller then leaves the plan alone: guessing a plan in either
 * direction either gives the workflow board away or takes it off a salon
 * that paid for it.
 */
export function planForPriceId(
  priceId: string | null | undefined,
  prices: Partial<Record<"starter" | "professional" | "enterprise", string | null | undefined>>,
): "starter" | "professional" | "enterprise" | null {
  if (!priceId) return null;
  for (const plan of ["starter", "professional", "enterprise"] as const) {
    const configured = prices[plan]?.trim();
    if (configured && configured === priceId) return plan;
  }
  return null;
}
