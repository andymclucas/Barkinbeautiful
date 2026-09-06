import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is not available for sandbox verification.");
}

const stripe = new Stripe(secretKey);
const origin = "https://groomingsos-mqzfsvzv.manus.space";
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items: [
    {
      price_data: {
        currency: "aud",
        product_data: {
          name: "Groomigo isolated Stripe sandbox verification",
          description: "Test-only payment integration verification. No client, invoice or membership is involved.",
        },
        unit_amount: 50,
      },
      quantity: 1,
    },
  ],
  success_url: `${origin}/memberships?stripe_test=success`,
  cancel_url: `${origin}/memberships?stripe_test=cancelled`,
  metadata: {
    groomigo_test_only: "true",
    purpose: "stripe_webhook_verification",
  },
  payment_intent_data: {
    metadata: {
      groomigo_test_only: "true",
      purpose: "stripe_webhook_verification",
    },
  },
});

console.log(JSON.stringify({
  sessionId: session.id,
  url: session.url,
  amount: "AUD 0.50",
  testOnly: true,
}, null, 2));
