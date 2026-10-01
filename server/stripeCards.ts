/**
 * Cards on file, off-session charges, and weekly membership subscriptions.
 *
 * The salon never sees or types a card number. A client is sent a Stripe
 * Checkout link in "setup" mode; they enter the card on Stripe's own page;
 * Stripe tells us the payment method id through the webhook. That is the only
 * way card details enter this system, and it keeps the business out of PCI
 * scope entirely.
 *
 * Once a card is attached, two things become possible:
 *
 *  - a weekly Stripe Subscription against the membership price, which is what
 *    bills the membership clients;
 *  - an off-session PaymentIntent, which is what the retry job uses when a
 *    weekly invoice has failed and we want to try again on OUR schedule
 *    (the next business day) rather than Stripe's, which knows nothing about
 *    weekends.
 *
 * Nothing here decides anything: whether to retry, when, and whether a
 * decline is worth retrying all live in shared/stripeBilling.ts where they
 * can be tested without a Stripe key.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { clients, memberships } from "../drizzle/schema";
import { getDb } from "./db";
import { requireStripeClient } from "./stripeClient";
import { getAppBaseUrl } from "./appUrl";
import { toStripeCents, stripeRecurring, billingCycleFromWeeks } from "@shared/stripeBilling";
import { buildCardLinkEmail } from "@shared/cardLinkEmail";

/** Find or create the Stripe customer that represents this client. */
export async function ensureStripeCustomer(clientId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeClient();
  const [client] = await db
    .select({
      id: clients.id,
      tenantId: clients.tenantId,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
      stripeCustomerId: clients.stripeCustomerId,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw new Error("Client not found");
  if (client.stripeCustomerId) return client.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: `${client.firstName} ${client.lastName}`.trim(),
    email: client.email ?? undefined,
    phone: client.phone ?? undefined,
    metadata: { groomigo_client_id: String(client.id), tenant_id: String(client.tenantId) },
  });
  await db.update(clients).set({ stripeCustomerId: customer.id }).where(eq(clients.id, client.id));
  return customer.id;
}

/**
 * A link the client opens to put a card on file. Nothing is charged.
 *
 * Checkout in setup mode rather than a bare SetupIntent because the salon
 * sends this by SMS or email and the client opens it on a phone: Stripe's
 * hosted page handles 3DS, Apple Pay and the card form, and we handle none
 * of it.
 */
export async function createCardSetupLink(clientId: number) {
  const stripe = requireStripeClient();
  const customerId = await ensureStripeCustomer(clientId);
  const base = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    currency: "aud",
    metadata: { groomigo_client_id: String(clientId), payment_kind: "card_on_file" },
    // The webhook does the saving; these two only decide what the client sees
    // when Stripe sends them back.
    success_url: `${base}/portal/card-saved?client=${clientId}`,
    cancel_url: `${base}/portal/card-cancelled?client=${clientId}`,
  });
  if (!session.url) throw new Error("Stripe did not return a setup link");
  return { url: session.url, sessionId: session.id, customerId };
}

/**
 * Create a card setup link and email it to the client.
 *
 * Separate from createCardSetupLink, which only returns the URL: emailing a
 * real client is a deliberate act, so it is its own procedure rather than a
 * flag. Fails loudly when the client has no email rather than silently
 * doing nothing, because the staff member is standing there expecting the
 * client to receive something.
 *
 * Not idempotent by design — clicking twice emails twice, the same as any
 * other "send it again" action. The link itself is single-use at Stripe's
 * end and the newest one always works.
 */
export async function emailCardSetupLink(clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [client] = await db
    .select({
      id: clients.id,
      tenantId: clients.tenantId,
      firstName: clients.firstName,
      email: clients.email,
      existingPaymentMethodId: clients.stripeDefaultPaymentMethodId,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client || (client.tenantId ?? 1) !== 1) throw new Error("Client not found");

  const to = (client.email ?? "").trim();
  if (!to) {
    throw new Error(
      "This client has no email address on file. Add one first, or use the link below and send it yourself.",
    );
  }

  const link = await createCardSetupLink(clientId);
  const { subject, html } = buildCardLinkEmail({
    firstName: client.firstName,
    url: link.url,
    replacingExistingCard: Boolean(client.existingPaymentMethodId),
  });

  const { sendEmail } = await import("./email");
  const emailSent = await sendEmail({ to, subject, html });

  return { ...link, emailSent, emailedTo: emailSent ? to : null };
}

/**
 * Copy a payment method's display details onto the client and make it the
 * customer's default for invoices.
 *
 * Called from the webhook once the client has entered a card.
 */
export async function attachPaymentMethodToClient(clientId: number, paymentMethodId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeClient();
  const method = await stripe.paymentMethods.retrieve(paymentMethodId);
  const customerId = typeof method.customer === "string" ? method.customer : method.customer?.id;
  if (customerId) {
    // Without this, Stripe bills subscription invoices against nothing and
    // every weekly charge fails with "no payment method".
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }
  const card = method.card;
  // A wallet or Link payment method has no `card` block, so brand and last4
  // come back empty even though the method charges fine. Record the method
  // type so the client page can say something true rather than "no card".
  const brand = card?.brand ?? (method.type ? String(method.type) : null);
  await db
    .update(clients)
    .set({
      stripeDefaultPaymentMethodId: paymentMethodId,
      stripeCardBrand: brand,
      stripeCardLast4: card?.last4 ?? null,
      stripeCardExpMonth: card?.exp_month ?? null,
      stripeCardExpYear: card?.exp_year ?? null,
      stripeCardSavedAt: new Date(),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    })
    .where(eq(clients.id, clientId));
  return { brand, last4: card?.last4 ?? null };
}

/** Forget the card. The client is asked for a new one before the next bill. */
export async function detachClientCard(clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [client] = await db
    .select({ paymentMethodId: clients.stripeDefaultPaymentMethodId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (client?.paymentMethodId) {
    const stripe = requireStripeClient();
    // Stripe may already have detached it; that is not worth stopping for,
    // because the row must be cleared either way.
    await stripe.paymentMethods.detach(client.paymentMethodId).catch(() => undefined);
  }
  await db
    .update(clients)
    .set({
      stripeDefaultPaymentMethodId: null,
      stripeCardBrand: null,
      stripeCardLast4: null,
      stripeCardExpMonth: null,
      stripeCardExpYear: null,
      stripeCardSavedAt: null,
    })
    .where(eq(clients.id, clientId));
  return { success: true };
}

export interface OffSessionChargeResult {
  ok: boolean;
  paymentIntentId: string | null;
  /** Stripe's decline code, which shared/stripeBilling classifies. */
  declineCode: string | null;
  message: string | null;
}

/**
 * Charge a saved card with nobody present.
 *
 * `off_session: true` tells Stripe the client is not at the keyboard, which
 * is what lets a saved card be charged at all and what makes Stripe return
 * `authentication_required` instead of silently hanging when the bank wants
 * 3DS. That code is classified as "needs a new card" rather than retried,
 * because no number of automatic attempts can satisfy a 3DS challenge.
 */
export async function chargeSavedCard(input: {
  customerId: string;
  paymentMethodId: string;
  amountDollars: string | number;
  description: string;
  metadata?: Record<string, string>;
}): Promise<OffSessionChargeResult> {
  const stripe = requireStripeClient();
  const amount = toStripeCents(input.amountDollars);
  if (amount <= 0) {
    return { ok: false, paymentIntentId: null, declineCode: null, message: "Nothing to charge" };
  }
  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "aud",
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: true,
      confirm: true,
      description: input.description,
      metadata: input.metadata ?? {},
    });
    return {
      ok: intent.status === "succeeded",
      paymentIntentId: intent.id,
      declineCode: null,
      message: intent.status,
    };
  } catch (err: any) {
    // A decline arrives as a thrown StripeCardError carrying the intent.
    const error = err?.raw ?? err;
    return {
      ok: false,
      paymentIntentId: error?.payment_intent?.id ?? null,
      declineCode: error?.decline_code ?? error?.code ?? null,
      message: error?.message ?? String(err),
    };
  }
}

/**
 * The Stripe Product that membership subscriptions bill against.
 *
 * Stripe wants a product id on a recurring price - inline product data is
 * only allowed for one-off Checkout lines. Rather than create a product per
 * membership and fill the Stripe dashboard with near-duplicates, each salon
 * gets one product at a deterministic id, created on first use.
 */
async function ensureMembershipProduct(stripe: Stripe, tenantId: number): Promise<string> {
  const id = `groomigo_membership_t${tenantId}`;
  try {
    const existing = await stripe.products.retrieve(id);
    if (!existing.deleted) return existing.id;
  } catch {
    // Not there yet - fall through and create it.
  }
  const product = await stripe.products.create({
    id,
    name: "Grooming membership",
    description: "Recurring grooming membership",
    metadata: { tenant_id: String(tenantId) },
  });
  return product.id;
}

/**
 * Put a membership onto a weekly Stripe Subscription.
 *
 * The price is built from the membership's own `pricePerCycle` rather than
 * from a Stripe price id, because the salon sets prices per client in
 * Groomigo and mirroring a price catalogue into Stripe would be a second
 * source of truth to keep in step.
 */
/**
 * Put a membership onto automatic Stripe billing.
 *
 * The cadence is derived from the membership's own billingCycleWeeks, never
 * passed in: a caller-supplied cycle meant a stale tab or a second caller
 * could bill a client at a cadence the membership does not agree with.
 */
export async function startMembershipSubscription(membershipId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeClient();
  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      clientId: memberships.clientId,
      name: memberships.name,
      pricePerCycle: memberships.pricePerCycle,
      billingCycleWeeks: memberships.billingCycleWeeks,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  // Same tenant guard the client-portal procedures use: the tRPC context
  // carries no tenantId, so fail closed rather than trusting an id.
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");
  if (membership.stripeSubscriptionId) {
    return { subscriptionId: membership.stripeSubscriptionId, alreadyExisted: true };
  }
  if (!membership.clientId) throw new Error("This membership has no client attached");

  const [client] = await db
    .select({
      stripeCustomerId: clients.stripeCustomerId,
      paymentMethodId: clients.stripeDefaultPaymentMethodId,
    })
    .from(clients)
    .where(eq(clients.id, membership.clientId))
    .limit(1);
  if (!client?.stripeCustomerId || !client.paymentMethodId) {
    throw new Error("This client has no card on file yet. Send them a card link first.");
  }

  const amount = toStripeCents(membership.pricePerCycle);
  if (amount <= 0) throw new Error("This membership has no price to bill");

  // Guessing a cadence overcharges or undercharges a real person, so refuse.
  const cycle = billingCycleFromWeeks(membership.billingCycleWeeks);
  if (!cycle) {
    throw new Error(
      `This membership bills every ${membership.billingCycleWeeks ?? "?"} weeks, which automatic Stripe billing doesn't cover. Change it to weekly or fortnightly first.`,
    );
  }

  const productId = await ensureMembershipProduct(stripe, membership.tenantId ?? 1);
  const subscription = await stripe.subscriptions.create({
    customer: client.stripeCustomerId,
    default_payment_method: client.paymentMethodId,
    collection_method: "charge_automatically",
    items: [{
      metadata: { groomigo_membership_name: membership.name ?? "Grooming membership" },
      price_data: {
        currency: "aud",
        unit_amount: amount,
        recurring: stripeRecurring(cycle),
        product: productId,
      },
    }],
    metadata: {
      groomigo_membership_id: String(membership.id),
      groomigo_client_id: String(membership.clientId),
      tenant_id: String(membership.tenantId ?? 1),
      payment_kind: "membership_subscription",
    },
    // A failed first payment should not leave a half-live subscription: we
    // want the invoice to exist so the retry job can pay it.
    payment_behavior: "allow_incomplete",
  }, {
    // Without this, a retry after a failed DB write — or two admins clicking
    // at once — creates a second live subscription that bills forever.
    idempotencyKey: `groomigo-membership-sub-${membership.id}`,
  });

  await db
    .update(memberships)
    .set({
      stripeSubscriptionId: subscription.id,
      gatewaySubscriptionId: subscription.id,
      paymentGateway: "stripe",
    })
    .where(eq(memberships.id, membership.id));

  return { subscriptionId: subscription.id, alreadyExisted: false };
}

export async function cancelMembershipSubscription(membershipId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");
  if (!membership.stripeSubscriptionId) return { cancelled: false };
  const stripe = requireStripeClient();
  await stripe.subscriptions.cancel(membership.stripeSubscriptionId).catch(() => undefined);
  await db
    .update(memberships)
    .set({
      stripeSubscriptionId: null,
      gatewaySubscriptionId: null,
      // Without this the row still claims Stripe billing while holding no
      // subscription, and nothing would ever charge it again.
      paymentGateway: "other",
    })
    .where(eq(memberships.id, membership.id));
  return { cancelled: true };
}

/**
 * Stop charging a membership without tearing down its subscription.
 *
 * For a client who is away or between dogs: Stripe keeps the subscription
 * and the saved card, but issues nothing while paused. "void" rather than
 * "keep_as_draft" so no invoice quietly accrues and lands as a lump sum the
 * day they come back.
 *
 * NOTE: membership status "paused" is also what the failed-payment
 * escalation sets. A deliberate pause leaves failedPaymentCount at 0 and
 * bookingSuspended false, which is how the two are told apart.
 */
export async function pauseMembershipSubscription(membershipId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");
  if (!membership.stripeSubscriptionId) throw new Error("This membership is not on automatic billing");

  const stripe = requireStripeClient();
  await stripe.subscriptions.update(membership.stripeSubscriptionId, {
    pause_collection: { behavior: "void" },
  });
  await db.update(memberships).set({ status: "paused" }).where(eq(memberships.id, membership.id));
  return { paused: true };
}

/** Start charging a paused membership again from its next cycle. */
export async function resumeMembershipSubscription(membershipId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");
  if (!membership.stripeSubscriptionId) throw new Error("This membership is not on automatic billing");

  const stripe = requireStripeClient();
  await stripe.subscriptions.update(membership.stripeSubscriptionId, { pause_collection: null });
  await db.update(memberships).set({ status: "active" }).where(eq(memberships.id, membership.id));
  return { resumed: true };
}

/**
 * Pay an open Stripe invoice now - what the retry job calls when a weekly
 * membership invoice has failed.
 *
 * Paying the invoice rather than raising a fresh PaymentIntent keeps Stripe's
 * own records straight: the subscription sees its invoice settled, rather
 * than an unrelated charge appearing beside a still-unpaid invoice.
 */
export async function payOpenInvoice(stripeInvoiceId: string): Promise<OffSessionChargeResult> {
  const stripe = requireStripeClient();
  try {
    const invoice = await stripe.invoices.pay(stripeInvoiceId, { off_session: true });
    const paymentIntent = (invoice as unknown as { payment_intent?: string | Stripe.PaymentIntent }).payment_intent;
    return {
      ok: invoice.status === "paid",
      paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null),
      declineCode: null,
      message: invoice.status ?? null,
    };
  } catch (err: any) {
    const error = err?.raw ?? err;
    // Stripe refuses to pay an invoice that is already settled. The money is
    // there, so that is a success, not a decline to escalate on.
    const code = error?.code ?? "";
    if (code === "invoice_no_payment_required" || code === "invoice_already_paid") {
      return { ok: true, paymentIntentId: null, declineCode: null, message: "already paid" };
    }
    return {
      ok: false,
      paymentIntentId: error?.payment_intent?.id ?? null,
      declineCode: error?.decline_code ?? error?.code ?? null,
      message: error?.message ?? String(err),
    };
  }
}
