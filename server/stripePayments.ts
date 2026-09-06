import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { clients, invoices, membershipLedgerEntries, membershipPayments, memberships, stripeEvents } from "../drizzle/schema";
import { getDb } from "./db";

export type StripeCheckoutRequest = {
  invoiceId: number;
  invoiceNumber: string;
  totalCents: number;
  clientId: number;
  clientName: string;
  clientEmail: string | null;
  membershipId: number | null;
  tenantId: number;
  origin: string;
};

export function requireStripeTestClient() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Stripe is not configured. Open Settings → Payment to complete setup.");
  if (!key.startsWith("sk_test_")) throw new Error("Groomigo is still in prototype mode and accepts Stripe test-mode Checkout only.");
  return new Stripe(key, { typescript: true });
}

export function buildInvoiceCheckoutMetadata(input: Pick<StripeCheckoutRequest, "invoiceId" | "clientId" | "membershipId" | "tenantId">) {
  return {
    invoice_id: String(input.invoiceId),
    client_id: String(input.clientId),
    membership_id: input.membershipId ? String(input.membershipId) : "",
    tenant_id: String(input.tenantId),
    payment_kind: "invoice_settlement",
  };
}

export async function createTestInvoiceCheckout(input: StripeCheckoutRequest) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeTestClient();
  const [client] = await db.select({ stripeCustomerId: clients.stripeCustomerId }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
  let customerId = client?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: input.clientName,
      email: input.clientEmail ?? undefined,
      metadata: { groomigo_client_id: String(input.clientId), tenant_id: String(input.tenantId) },
    });
    customerId = customer.id;
    await db.update(clients).set({ stripeCustomerId: customerId }).where(eq(clients.id, input.clientId));
  }
  const metadata = buildInvoiceCheckoutMetadata(input);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: String(input.clientId),
    metadata,
    payment_intent_data: { metadata },
    allow_promotion_codes: true,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "aud",
        unit_amount: input.totalCents,
        product_data: { name: `Groomigo invoice ${input.invoiceNumber}` },
      },
    }],
    success_url: `${input.origin}/memberships?stripe_checkout=success&invoice=${input.invoiceId}`,
    cancel_url: `${input.origin}/memberships?stripe_checkout=cancelled&invoice=${input.invoiceId}`,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  await db.update(invoices).set({ stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url }).where(eq(invoices.id, input.invoiceId));
  return { checkoutUrl: session.url, checkoutSessionId: session.id, customerId };
}

export async function processStripeEvent(event: Stripe.Event) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const object = event.data.object as Stripe.Checkout.Session;
  const metadata = object.metadata ?? {};
  const tenantId = Number(metadata.tenant_id || 1);
  const invoiceId = Number(metadata.invoice_id || 0) || null;
  const membershipId = Number(metadata.membership_id || 0) || null;
  const clientId = Number(metadata.client_id || 0) || null;
  const [alreadyProcessed] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.stripeEventId, event.id)).limit(1);
  if (alreadyProcessed) return { duplicate: true };
  await db.insert(stripeEvents).values({ stripeEventId: event.id, eventType: event.type, tenantId, clientId, membershipId, invoiceId });
  if (event.type === "checkout.session.completed" && invoiceId && object.payment_status === "paid") {
    const amount = (object.amount_total ?? 0) / 100;
    await db.update(invoices).set({ status: "paid", paymentMethod: "stripe", paidAt: new Date() }).where(eq(invoices.id, invoiceId));
    if (membershipId) {
      await db.insert(membershipPayments).values({ membershipId, amount: String(amount), status: "paid", stripePaymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null, paidAt: new Date() });
      await db.insert(membershipLedgerEntries).values({ tenantId, membershipId, invoiceId, entryType: "payment", amount: String(amount), source: "stripe", externalReference: event.id, note: `Stripe test Checkout settlement for invoice ${invoiceId}` });
    }
  }
  if (event.type === "payment_intent.payment_failed" && membershipId) {
    const [membership] = await db.select({ failedPaymentCount: memberships.failedPaymentCount }).from(memberships).where(eq(memberships.id, membershipId)).limit(1);
    if (membership) {
      await db.update(memberships).set({
        failedPaymentCount: membership.failedPaymentCount + 1,
        lastFailedPaymentAt: new Date(),
        status: "pending_payment",
      }).where(eq(memberships.id, membershipId));
    }
  }
  return { duplicate: false };
}
