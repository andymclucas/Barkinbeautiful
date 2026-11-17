/**
 * Groomigo charging a salon for Groomigo.
 *
 * The rules are in shared/platformBilling.ts. This is the Stripe half.
 *
 * ## Every call here is on GROOMIGO'S OWN Stripe account
 *
 * `requirePlatformStripeClient()` (server/platformStripe.ts) is built
 * from GROOMIGO_STRIPE_SECRET_KEY — a different account from
 * STRIPE_SECRET_KEY, which is the one client payments run through.
 * Nothing in this file touches that key or passes Stripe's
 * `{ stripeAccount }` option, which is what stripePayments.ts uses to
 * land a dog owner's money with the salon.
 *
 * Get that backwards and a salon's subscription fee is charged on a
 * salon's account — Lauren would be billing herself, into her own
 * balance, and Groomigo would be paid nothing. It would look like it
 * worked.
 *
 * Until that account exists and is configured, billing is closed and
 * every entry point here says so rather than reaching Stripe.
 *
 * ## The customer id is its own column for the same reason
 *
 * A Stripe customer belongs to the account it was created on.
 * `clients.stripe_customer_id` is a dog owner; `tenants.stripe_account_id`
 * is the salon's own account. Neither is usable here.
 * `tenants.platform_stripe_customer_id` is the salon as a customer of
 * Groomigo's account, and only ever created by this file.
 *
 * ## Card changes and cancellation go to Stripe's own portal
 *
 * Not built here. A billing portal session hands the salon Stripe's
 * hosted page for cards, invoices and cancelling — which means this app
 * never touches a card number, and the PCI surface stays zero.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { isPlatformBillingOpen, priceIdForPlan, requirePlatformStripeClient, type SalonPlan } from "./platformStripe";
import { getAppBaseUrl } from "./appUrl";
import { forgetTrialState } from "./trialState";
import {
  planForPriceId, platformSubscriptionMetadata, salonStatusFromStripe,
  type SalonSubscriptionStatus,
} from "@shared/platformBilling";

export { priceIdForPlan, type SalonPlan };

async function loadTenantBilling(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.select({
    id: tenants.id,
    name: tenants.name,
    email: tenants.email,
    platformStripeCustomerId: tenants.platformStripeCustomerId,
    platformStripeSubscriptionId: tenants.platformStripeSubscriptionId,
    subscriptionStatus: tenants.subscriptionStatus,
    subscriptionPlan: tenants.subscriptionPlan,
    subscriptionCurrentPeriodEnd: tenants.subscriptionCurrentPeriodEnd,
    trialEndsAt: tenants.trialEndsAt,
    billingExempt: tenants.billingExempt,
  }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!row) throw new Error("That salon does not exist");
  return { db, tenant: row };
}

/**
 * The salon's customer record on OUR account, made once and reused.
 *
 * Reused rather than recreated because a second customer would split the
 * salon's invoice history in Stripe's own dashboard, which is where
 * somebody looks when a payment is disputed.
 */
async function ensurePlatformCustomer(tenantId: number): Promise<string> {
  const { db, tenant } = await loadTenantBilling(tenantId);
  if (tenant.platformStripeCustomerId) return tenant.platformStripeCustomerId;

  const stripe = requirePlatformStripeClient();
  // No { stripeAccount } — see the note at the top of this file.
  const customer = await stripe.customers.create({
    name: tenant.name,
    email: tenant.email ?? undefined,
    metadata: platformSubscriptionMetadata(tenantId),
  });
  await db.update(tenants)
    .set({ platformStripeCustomerId: customer.id })
    .where(eq(tenants.id, tenantId));
  return customer.id;
}

/**
 * Start paying.
 *
 * Checkout rather than a card form: Stripe collects the card on its own
 * page, so no card number reaches this app at any point.
 *
 * The marker metadata goes on BOTH the session and the subscription it
 * creates. The subscription's copy is the one that matters — every later
 * invoice.* and customer.subscription.* event is matched against it, and
 * memberships raise those same events for client subscriptions on this
 * same account.
 */
export async function createPlatformSubscriptionCheckout(input: {
  tenantId: number;
  plan: SalonPlan;
}): Promise<{ url: string }> {
  // Closed until Groomigo's own Stripe account, webhook and prices are
  // all in place. Checked before anything is read or created.
  if (!isPlatformBillingOpen()) {
    throw new Error("Plans are not open yet. Talk to us and we will set your subscription up with you.");
  }
  const priceId = priceIdForPlan(input.plan);
  if (!priceId) throw new Error(`The ${input.plan} plan is not on sale yet.`);

  const { tenant } = await loadTenantBilling(input.tenantId);
  // Barkin' Beautiful. The billing card is on its Settings page like any
  // salon's, and one click must not start charging the salon this was
  // built for — see isBillable() in shared/planEntitlements.ts.
  if (tenant.billingExempt) {
    throw new Error("This salon is not billed for Groomigo, so there is no plan to choose.");
  }
  if (tenant.platformStripeSubscriptionId) {
    throw new Error("This salon already has a subscription. Use Manage billing to change it.");
  }

  const customerId = await ensurePlatformCustomer(input.tenantId);
  const stripe = requirePlatformStripeClient();
  const base = getAppBaseUrl();
  const metadata = platformSubscriptionMetadata(input.tenantId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // On the session, so checkout.session.completed can be attributed.
    metadata,
    // And on the subscription, which is what every LATER event carries.
    subscription_data: { metadata },
    success_url: `${base}/settings?billing=started`,
    cancel_url: `${base}/settings?billing=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

/**
 * Stripe's own page for cards, invoices and cancelling.
 *
 * Everything a salon needs to do to its own billing, hosted by Stripe.
 * Building any of it here would mean handling a card number for no gain.
 */
export async function createPlatformBillingPortal(tenantId: number): Promise<{ url: string }> {
  const { tenant } = await loadTenantBilling(tenantId);
  if (!tenant.platformStripeCustomerId) {
    throw new Error("This salon has no billing set up yet.");
  }
  if (!isPlatformBillingOpen()) throw new Error("Billing is not open yet.");
  const stripe = requirePlatformStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.platformStripeCustomerId,
    return_url: `${getAppBaseUrl()}/settings?tab=billing`,
  });
  return { url: session.url };
}

/**
 * Write a Stripe subscription's state onto the salon.
 *
 * The single place that moves tenants.subscription_status, so the webhook
 * and any manual resync cannot disagree. Everything it writes is derived
 * from what Stripe just said, never from what we thought before.
 */
export async function syncPlatformSubscription(
  tenantId: number,
  subscription: Stripe.Subscription,
): Promise<{ status: SalonSubscriptionStatus }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const status = salonStatusFromStripe(subscription.status);
  const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;

  /*
   * What they are paying for, read off the price Stripe is charging.
   *
   * Until 17/11/2026 nothing wrote subscription_plan when a salon paid,
   * so every salon stayed on "trial" — which is every feature — whichever
   * plan it bought. The cheapest plan bought the workflow board.
   *
   * A price that matches none of ours leaves the plan alone and says so:
   * guessing would either give a plan away or take one off a salon that
   * paid for it.
   */
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const plan = planForPriceId(priceId, {
    starter: priceIdForPlan("starter"),
    professional: priceIdForPlan("professional"),
    enterprise: priceIdForPlan("enterprise"),
  });
  if (plan === null) {
    console.error(
      `[stripe] tenant ${tenantId}: subscription ${subscription.id} is on price ${priceId ?? "(none)"}, ` +
      `which is none of GROOMIGO_STRIPE_PRICE_STARTER / _PROFESSIONAL / _ENTERPRISE. The salon's plan was left unchanged.`,
    );
  }

  await db.update(tenants).set({
    subscriptionStatus: status,
    // Cleared when the subscription ends, so a cancelled salon cannot be
    // mistaken for one that simply has no billing yet — the status says
    // cancelled and the id is gone, which is what Stripe now reports.
    platformStripeSubscriptionId: status === "cancelled" ? null : subscription.id,
    subscriptionCurrentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
    /*
     * A paying salon is not on a trial any more.
     *
     * Left set, enforceTrial would keep counting down and lock out a
     * salon that is paying us every month — the worst possible version
     * of this feature.
     */
    ...(status === "active" ? { trialEndsAt: null } : {}),
    ...(plan !== null ? { subscriptionPlan: plan } : {}),
  }).where(eq(tenants.id, tenantId));

  // enforceTrial caches the trial state for thirty seconds. Somebody who
  // has just paid should not be refused by a cached "expired".
  forgetTrialState(tenantId);

  return { status };
}

/** The salon a platform subscription belongs to, or null if it is not ours. */
export async function tenantIdForPlatformSubscription(
  subscriptionId: string | null | undefined,
): Promise<number | null> {
  if (!subscriptionId) return null;
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ id: tenants.id }).from(tenants)
    .where(eq(tenants.platformStripeSubscriptionId, subscriptionId)).limit(1);
  return row?.id ?? null;
}
