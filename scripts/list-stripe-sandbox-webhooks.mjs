import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true });
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });

console.log(JSON.stringify(endpoints.data.map((endpoint) => ({
  id: endpoint.id,
  url: endpoint.url,
  status: endpoint.status,
  enabledEvents: endpoint.enabled_events,
  livemode: endpoint.livemode,
  created: endpoint.created,
}))));
