import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true });
const session = await stripe.checkout.sessions.retrieve("cs_test_b1zIdlRHjx9qHWYzvbx70OaKBEzIdCNgGbwyf30eKHuUjAWsIidwf8XC3x");

console.log(JSON.stringify({
  id: session.id,
  status: session.status,
  paymentStatus: session.payment_status,
  paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
  checkoutUrl: session.url,
}));
