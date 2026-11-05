/**
 * Groomigo charging a salon for Groomigo.
 *
 * The rules are in shared/platformBilling.ts. This is the Stripe half.
 *
 * ## Every call here is on the PLATFORM account, with no exceptions
 *
 * `requireStripeClient()` is built from STRIPE_SECRET_KEY, and nothing in
 * this file passes Stripe's `{ stripeAccount }` option. That is the whole
 * difference from stripePayments.ts, which passes it whenever the salon
 * has a working connected account so a dog owner's money lands with the
 * salon rather than with us.
 *
 * Get that backwards and the salon's subscription fee is charged on the
 * salon's own account — Lauren would be billing herself, into her own
 * balance, and Groomigo would be paid nothing. It would look like it
 * worked.
 *
 * ## The customer id is its own column for the same reason
 *
 * A Stripe customer belongs to the account it was created on.
 * `clients.stripe_customer_id` is a dog owner, often minted on a connected
 * account; `tenants.stripe_account_id` is the salon's own account. Neither
 * is usable here, and reusing either produces "No such customer" or bills
 * the wrong party. `tenants.platform_stripe_customer_id` exists so the
 * obvious name is the wrong one.
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
import { requireStripeClient } from "./stripeClient";
import { getAppBaseUrl } from "./appUrl";
import {
  platformSubscriptionMetadata, salonStatusFromStripe,
  type SalonSubscriptionStatus,
} from "@shared/platformBilling";

export type SalonPlan = "starter" | "professional" | "enterprise";

/**
 * The Stripe price for each plan, from the environment.
 *
 * Not hardcoded and not in the database: a price id is configuration that
 * differs between Stripe's test and live modes, and baking the live one
 * into the repo is how a test deploy charges somebody real money.
 *
 * Unset means that plan cannot be sold yet, and says so rather than
 * failing somewhere inside Stripe with a less useful message.
 */
export function priceIdForPlan(plan: SalonPlan): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}`;
  const value = process.env[key];
  return value && value.trim() ? value.trim() : null;
}

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

  const stripe = requireStripeClient();
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
  const priceId = priceIdForPlan(input.plan);
  if (!priceId) {
    throw new Error(
      `The ${input.plan} plan has no Stripe price configured (STRIPE_PRICE_${input.plan.toUpperCase()}).`,
    );
  }

  const { tenant } = await loadTenantBilling(input.tenantId);
  if (tenant.platformStripeSubscriptionId) {
    throw new Error("This salon already has a subscription. Use Manage billing to change it.");
  }

  const customerId = await ensurePlatformCustomer(input.tenantId);
  const stripe = requireStripeClient();
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
  const stripe = requireStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.platformStripeCustomerId,
    return_url: `${getAppBaseUrl()}/settings`,
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
  }).where(eq(tenants.id, tenantId));

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
