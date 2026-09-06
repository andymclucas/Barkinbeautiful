import { createTestInvoiceCheckout } from "../server/stripePayments.ts";

const result = await createTestInvoiceCheckout({
  invoiceId: 90002,
  invoiceNumber: "TEST-STRIPE-20260827-01",
  totalCents: 100,
  clientId: 120002,
  clientName: "Groomigo Stripe Test 2026-08-27",
  clientEmail: null,
  membershipId: null,
  tenantId: 1,
  origin: "https://groomingsos-mqzfsvzv.manus.space",
});

console.log(JSON.stringify({
  checkoutUrl: result.checkoutUrl,
  checkoutSessionId: result.checkoutSessionId,
  customerId: result.customerId,
}));
