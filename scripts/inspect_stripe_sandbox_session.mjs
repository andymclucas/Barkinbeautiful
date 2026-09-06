import Stripe from "stripe";

const sessionId = "cs_test_a1tuTXpI3Fuet7he6TdgFPaNJem7wBxI7k9efjY7FhFYxXGyNp3k4IgHnn";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const session = await stripe.checkout.sessions.retrieve(sessionId);

console.log(JSON.stringify({
  id: session.id,
  status: session.status,
  paymentStatus: session.payment_status,
  expiresAt: new Date(session.expires_at * 1000).toISOString(),
  livemode: session.livemode,
  urlPresent: Boolean(session.url),
  metadata: session.metadata,
}, null, 2));
