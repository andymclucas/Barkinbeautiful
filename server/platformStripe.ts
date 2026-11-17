/**
 * Groomigo's OWN Stripe account — the one salons pay their subscription
 * into.
 *
 * Separate from STRIPE_SECRET_KEY on purpose (Andy, 17/11/2026). That key
 * is the account client payments run through, which today is Barkin'
 * Beautiful's. Groomigo is becoming its own company with its own Stripe
 * account, and a salon's subscription fee belongs there, not in a
 * grooming salon's balance.
 *
 * ## There is no fallback to STRIPE_SECRET_KEY
 *
 * Unset means salon billing is CLOSED: no plan is offered, no checkout
 * can start, and no trial locks anybody out (shared/planEntitlements.ts,
 * trialLocksSalon). Falling back would quietly bill other salons into
 * Barkin' Beautiful's account, and it would look like it worked.
 *
 * ## Switching it on is configuration only
 *
 *   GROOMIGO_STRIPE_SECRET_KEY        the new account's secret key
 *   GROOMIGO_STRIPE_WEBHOOK_SECRET    signing secret of the endpoint below
 *   GROOMIGO_STRIPE_PRICE_STARTER     \
 *   GROOMIGO_STRIPE_PRICE_PROFESSIONAL  one recurring price id per plan
 *   GROOMIGO_STRIPE_PRICE_ENTERPRISE  /
 *
 * and, in the new Stripe account, a webhook endpoint at
 * /api/stripe/platform-webhook subscribed to the events in
 * PLATFORM_WEBHOOK_EVENTS (shared/platformBilling.ts), with the customer
 * portal switched on. docs/groomigo-billing-switch-on.md is the checklist.
 */
import Stripe from "stripe";
import { platformBillingReadiness, type PlatformBillingReadiness } from "@shared/platformBilling";

export type SalonPlan = "starter" | "professional" | "enterprise";

const read = (name: string): string | null => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
};

/** The Stripe price for a plan on Groomigo's account, or null when unset. */
export function priceIdForPlan(plan: SalonPlan): string | null {
  return read(`GROOMIGO_STRIPE_PRICE_${plan.toUpperCase()}`);
}

export function platformWebhookSecret(): string | null {
  return read("GROOMIGO_STRIPE_WEBHOOK_SECRET");
}

/** Whether salons can be charged yet, and what is missing if not. */
export function platformBillingState(): PlatformBillingReadiness {
  return platformBillingReadiness({
    secretKey: read("GROOMIGO_STRIPE_SECRET_KEY"),
    webhookSecret: platformWebhookSecret(),
    prices: {
      starter: priceIdForPlan("starter"),
      professional: priceIdForPlan("professional"),
      enterprise: priceIdForPlan("enterprise"),
    },
  });
}

export function isPlatformBillingOpen(): boolean {
  return platformBillingState().open;
}

/** A client for Groomigo's own account. Never passes { stripeAccount }. */
export function requirePlatformStripeClient(): Stripe {
  const key = read("GROOMIGO_STRIPE_SECRET_KEY");
  if (!key) throw new Error("Groomigo's own billing is not set up yet, so plans cannot be bought.");
  return new Stripe(key, { typescript: true });
}
