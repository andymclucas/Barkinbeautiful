/**
 * The Stripe SDK client, in its own module so that stripePayments (invoice
 * checkout, webhooks) and stripeCards (cards on file, subscriptions) can both
 * use it without importing each other in a cycle.
 */
import Stripe from "stripe";

export function requireStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Stripe is not configured. Open Settings → Payment to complete setup.");
  return new Stripe(key, { typescript: true });
}
