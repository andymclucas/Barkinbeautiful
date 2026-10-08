import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { clients, invoices, membershipLedgerEntries, membershipPayments, memberships, stripeEvents, tenants } from "../drizzle/schema";
import { getDb } from "./db";
import { requireStripeClient } from "./stripeClient";
import { syncAccountStatus, tenantIdForStripeAccount } from "./stripeConnectAccounts";
import { chargesOnConnectedAccount, platformFeeCents } from "../shared/stripeConnect";
import { attachPaymentMethodToClient } from "./stripeCards";
import { notifyOwner } from "./ownerNotification";
import { classifyFailure, fromStripeCents, planAfterFailure } from "@shared/stripeBilling";
import { nextBillingDateFromInvoice, type InvoicePeriodSource } from "@shared/stripeInvoicePeriod";
import { isDuplicateEntryError } from "./dbErrors";

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

// requireStripeClient moved to ./stripeClient so stripeCards can share it.
export { requireStripeClient } from "./stripeClient";

export function buildInvoiceCheckoutMetadata(input: Pick<StripeCheckoutRequest, "invoiceId" | "clientId" | "membershipId" | "tenantId">) {
  return {
    invoice_id: String(input.invoiceId),
    client_id: String(input.clientId),
    membership_id: input.membershipId ? String(input.membershipId) : "",
    tenant_id: String(input.tenantId),
    payment_kind: "invoice_settlement",
  };
}

export async function createInvoiceCheckout(input: StripeCheckoutRequest) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeClient();

  // Whose account does this money go to?
  //
  // Only the salon's own, and only once Stripe says it can take charges.
  // Everything else — no account, mid-onboarding, under review — falls
  // back to the platform account, which is exactly what happens today.
  // That fallback is what keeps Barkin' Beautiful, who have no connected
  // account, taking payments through this change.
  const [tenant] = await db.select({
    stripeAccountId: tenants.stripeAccountId,
    stripeChargesEnabled: tenants.stripeChargesEnabled,
    stripeDetailsSubmitted: tenants.stripeDetailsSubmitted,
    platformFeeBps: tenants.platformFeeBps,
  }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);

  const onConnected = tenant ? chargesOnConnectedAccount(tenant) : false;
  // Stripe's own option bag. Empty means "the platform account", which is
  // the behaviour every payment has today.
  const stripeAccount = onConnected && tenant?.stripeAccountId
    ? { stripeAccount: tenant.stripeAccountId }
    : undefined;
  const feeCents = onConnected ? platformFeeCents(input.totalCents, tenant?.platformFeeBps) : null;

  const [client] = await db.select({ stripeCustomerId: clients.stripeCustomerId }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
  let customerId = client?.stripeCustomerId ?? null;
  if (!customerId) {
    // A customer belongs to the account it was made on. Creating it on
    // the platform and then charging on the salon's account fails with
    // "No such customer", so both must happen in the same place.
    const customer = await stripe.customers.create({
      name: input.clientName,
      email: input.clientEmail ?? undefined,
      metadata: { groomigo_client_id: String(input.clientId), tenant_id: String(input.tenantId) },
    }, stripeAccount);
    customerId = customer.id;
    await db.update(clients).set({ stripeCustomerId: customerId }).where(eq(clients.id, input.clientId));
  }
  const metadata = buildInvoiceCheckoutMetadata(input);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: String(input.clientId),
    metadata,
    payment_intent_data: {
      metadata,
      // Groomigo's cut, taken by Stripe at the moment of the charge.
      // Undefined when no fee is set, which is every salon today.
      ...(feeCents !== null && feeCents > 0 ? { application_fee_amount: feeCents } : {}),
    },
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
  }, stripeAccount);
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  await db.update(invoices).set({ stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url }).where(eq(invoices.id, input.invoiceId));
  return { checkoutUrl: session.url, checkoutSessionId: session.id, customerId };
}

/**
 * Everything Stripe tells us about money, in one place.
 *
 * Four kinds of event matter:
 *
 *  checkout.session.completed (mode: payment) - a one-off invoice was paid.
 *  checkout.session.completed (mode: setup)   - a client saved a card. This
 *      is the only way card details enter the system, and the payment method
 *      id arrives here rather than from anything the salon typed.
 *  invoice.paid / invoice.payment_failed      - the weekly membership
 *      subscription billed, or did not. A failure sets failedPaymentCount and
 *      lastFailedPaymentAt, which is what lights the Dashboard alert, and
 *      schedules OUR retry for the next business day rather than leaving it
 *      to Stripe's own schedule, which knows nothing about weekends.
 *  customer.subscription.deleted              - the subscription is gone;
 *      stop pointing the membership at it.
 *
 * Every event is recorded in `stripe_events` first and skipped if already
 * seen: Stripe retries deliveries, and a duplicate would double-count a
 * payment or double-count a failure into a suspension.
 */

/** Which membership, if any, a subscription invoice belongs to. */
async function membershipForSubscription(db: any, subscriptionId: string | null) {
  if (!subscriptionId) return null;
  const [row] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      clientId: memberships.clientId,
      name: memberships.name,
      failedPaymentCount: memberships.failedPaymentCount,
    })
    .from(memberships)
    .where(eq(memberships.stripeSubscriptionId, subscriptionId))
    .limit(1);
  return row ?? null;
}

/**
 * Which subscription produced this invoice.
 *
 * Stripe MOVED this. Up to API version 2025-03-31 the invoice carried a
 * top-level `subscription`; after it, the same id lives at
 * `parent.subscription_details.subscription`, and the old field is simply
 * absent. The SDK here (22.5, 2026-07-29.dahlia) only knows the new shape.
 *
 * Reading only one of them is a silent failure, not a crash: an unmatched
 * invoice event returns 200 to Stripe and does nothing at all - no payment
 * recorded, no Dashboard alert, no retry scheduled - so weekly billing would
 * look configured and heal nothing. Both paths are read, because the webhook
 * endpoint's API version is chosen in the Stripe dashboard and can be moved
 * by someone who has no idea this function exists.
 */
export function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
  }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  const legacy = (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription;
  const value = fromParent ?? legacy;
  if (!value) return null;
  return typeof value === "string" ? value : (value.id ?? null);
}

export async function processStripeEvent(event: Stripe.Event) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [alreadyProcessed] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.stripeEventId, event.id)).limit(1);
  if (alreadyProcessed) return { duplicate: true };

  // A salon's Express account changing state — they finished onboarding,
  // Stripe cleared them, or Stripe wants something more. Handled first
  // because it is the one event that arrives ABOUT a connected account
  // rather than about a payment, and it carries no tenant metadata of its
  // own: the account id is the only link back to the salon.
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const tenantId = await tenantIdForStripeAccount(account.id);
    if (tenantId === null) {
      // An account we do not know about. Recorded and ignored rather than
      // failing the webhook, which would make Stripe retry it forever.
      console.warn(`[stripe] account.updated for an unknown account ${account.id}`);
      return { ignored: true };
    }
    await db.insert(stripeEvents).values({ stripeEventId: event.id, eventType: event.type, tenantId });
    await syncAccountStatus(tenantId, account);
    console.log(`[stripe] tenant ${tenantId} account ${account.id}: charges ${account.charges_enabled}, payouts ${account.payouts_enabled}`);
    return { accountUpdated: true };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata ?? {};
    const tenantId = Number(metadata.tenant_id || 1);
    const invoiceId = Number(metadata.invoice_id || 0) || null;
    const membershipId = Number(metadata.membership_id || 0) || null;
    const clientId = Number(metadata.client_id || metadata.groomigo_client_id || 0) || null;
    await db.insert(stripeEvents).values({ stripeEventId: event.id, eventType: event.type, tenantId, clientId, membershipId, invoiceId });

    if (session.mode === "setup" && clientId) {
      // The client just entered a card on Stripe's hosted page.
      const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
      if (setupIntentId) {
        const stripe = requireStripeClient();
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId = typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;
        if (paymentMethodId) await attachPaymentMethodToClient(clientId, paymentMethodId);
      }
      return { duplicate: false, handled: "card_on_file" };
    }

    if (invoiceId && session.payment_status === "paid") {
      const amount = (session.amount_total ?? 0) / 100;
      await db.update(invoices).set({ status: "paid", paymentMethod: "stripe", paidAt: new Date() }).where(eq(invoices.id, invoiceId));
      if (membershipId) {
        await db.insert(membershipPayments).values({ membershipId, amount: String(amount), status: "paid", stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null, paidAt: new Date() });
        await db.insert(membershipLedgerEntries).values({ tenantId, membershipId, invoiceId, entryType: "payment", amount: String(amount), source: "stripe", note: "Stripe Checkout payment" });
      }
    }
    return { duplicate: false, handled: "invoice_checkout" };
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const membership = await membershipForSubscription(db, subscriptionIdOf(invoice));
    await db.insert(stripeEvents).values({
      stripeEventId: event.id, eventType: event.type,
      tenantId: membership?.tenantId ?? 1, clientId: membership?.clientId ?? null,
      membershipId: membership?.id ?? null, invoiceId: null,
    });
    if (!membership) return { duplicate: false, handled: "invoice_paid_unmatched" };

    // Book the money against the INVOICE, not the event.
    //
    // Stripe sends both `invoice.paid` and `invoice.payment_succeeded` for a
    // single successful subscription charge, and they carry different event
    // ids - so the dedupe above does not catch the pair, and whoever
    // configures the webhook endpoint decides whether every membership
    // payment gets counted once or twice. A payment row already existing for
    // this invoice is the reliable signal, and it holds against Stripe's
    // delivery retries and a manual replay from the dashboard too.
    const amount = fromStripeCents(invoice.amount_paid);
    const [alreadyBooked] = invoice.id
      ? await db
          .select({ id: membershipPayments.id })
          .from(membershipPayments)
          .where(and(
            eq(membershipPayments.stripeInvoiceId, invoice.id),
            eq(membershipPayments.status, "paid"),
          ))
          .limit(1)
      : [];

    // Keep the Next Billing column honest as each cycle is paid. The
    // subscription period lives on the LINE, not on the invoice's own
    // window — shared/stripeInvoicePeriod.ts says what reading the wrong one
    // did. Null means leave the stored date alone.
    const nextBilling = nextBillingDateFromInvoice(invoice as unknown as InvoicePeriodSource);
    if (nextBilling) {
      await db.update(memberships)
        .set({ nextBillingDate: nextBilling })
        .where(eq(memberships.id, membership.id));
    }

    if (!alreadyBooked) {
      // The check above is a fast path, not a guarantee. Stripe sends
      // `invoice.paid` and `invoice.payment_succeeded` for one charge and
      // they can arrive together: on 08/10/2026 both handlers selected,
      // neither saw the other, and both inserted — one $1 booked twice, in
      // the same second. The unique index on the paid invoice is what makes
      // this safe; the loser of the race lands here as a duplicate-key
      // error, which means "already booked" and nothing more.
      try {
        await db.insert(membershipPayments).values({
          membershipId: membership.id,
          amount: String(amount),
          status: "paid",
          stripeInvoiceId: invoice.id ?? null,
          paidAt: new Date(),
        });
        await db.insert(membershipLedgerEntries).values({
          tenantId: membership.tenantId ?? 1, membershipId: membership.id, invoiceId: null,
          entryType: "payment", amount: String(amount), source: "stripe",
          note: "Stripe subscription payment",
          externalReference: invoice.id ?? null,
        });
      } catch (error) {
        if (!isDuplicateEntryError(error)) throw error;
      }
    }
    // A successful charge clears the whole failure state, including a retry
    // that had been scheduled and any booking suspension it caused.
    await db.update(memberships).set({
      failedPaymentCount: 0,
      lastFailedPaymentAt: null,
      paymentRetryScheduledAt: null,
      bookingSuspended: false,
      status: "active",
    }).where(eq(memberships.id, membership.id));
    // Clearing the failure state is idempotent, so it runs either way.
    return { duplicate: false, handled: alreadyBooked ? "subscription_paid_already_booked" : "subscription_paid" };
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const membership = await membershipForSubscription(db, subscriptionIdOf(invoice));
    await db.insert(stripeEvents).values({
      stripeEventId: event.id, eventType: event.type,
      tenantId: membership?.tenantId ?? 1, clientId: membership?.clientId ?? null,
      membershipId: membership?.id ?? null, invoiceId: null,
    });
    if (!membership) return { duplicate: false, handled: "invoice_failed_unmatched" };

    const now = new Date();
    const failedCount = (membership.failedPaymentCount ?? 0) + 1;
    const declineCode = (invoice as unknown as { last_finalization_error?: { decline_code?: string; code?: string } })
      .last_finalization_error?.decline_code ?? null;
    const plan = planAfterFailure(failedCount, classifyFailure(declineCode), now);

    await db.insert(membershipPayments).values({
      membershipId: membership.id,
      amount: String(fromStripeCents(invoice.amount_due)),
      status: "failed",
      stripeInvoiceId: invoice.id ?? null,
      failureReason: plan.reason,
    });
    await db.update(memberships).set({
      failedPaymentCount: failedCount,
      lastFailedPaymentAt: now,
      paymentRetryScheduledAt: plan.retryAt,
      bookingSuspended: plan.suspend,
      status: plan.suspend ? "paused" : "pending_payment",
    }).where(eq(memberships.id, membership.id));

    // Lights the Dashboard's failed-payments alert, and emails the owner.
    await notifyOwner({
      title: plan.suspend ? "⛔ Membership payment failed - suspended" : "⚠️ Membership payment failed",
      content: `${membership.name ?? "Membership"} - ${plan.reason}`,
    }).catch(() => undefined);
    return { duplicate: false, handled: "subscription_failed" };
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    let membership = await membershipForSubscription(db, subscription.id);

    // When WE cancelled, the subscription id was already cleared, so the
    // lookup above misses and the audit row would say nothing about who it
    // was. startMembershipSubscription stamps the membership id into the
    // subscription metadata precisely so it stays identifiable.
    if (!membership) {
      const metaId = Number((subscription.metadata ?? {}).groomigo_membership_id || 0) || null;
      if (metaId) {
        const [row] = await db
          .select({
            id: memberships.id,
            tenantId: memberships.tenantId,
            clientId: memberships.clientId,
            name: memberships.name,
            failedPaymentCount: memberships.failedPaymentCount,
          })
          .from(memberships)
          .where(eq(memberships.id, metaId))
          .limit(1);
        membership = row ?? null;
      }
    }

    await db.insert(stripeEvents).values({
      stripeEventId: event.id, eventType: event.type,
      tenantId: membership?.tenantId ?? 1, clientId: membership?.clientId ?? null,
      membershipId: membership?.id ?? null, invoiceId: null,
    });

    if (membership) {
      await db.update(memberships)
        .set({
          stripeSubscriptionId: null,
          gatewaySubscriptionId: null,
          // Stripe can end a subscription on its own, after a card finally
          // gives up. Leaving the gateway as "stripe" with no subscription
          // tells the salon this membership still bills itself, and nothing
          // would ever charge it again.
          paymentGateway: "other",
        })
        .where(eq(memberships.id, membership.id));
    }
    return { duplicate: false, handled: "subscription_deleted" };
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const metadata = intent.metadata ?? {};
    const membershipId = Number(metadata.membership_id || metadata.groomigo_membership_id || 0) || null;
    await db.insert(stripeEvents).values({
      stripeEventId: event.id, eventType: event.type,
      tenantId: Number(metadata.tenant_id || 1),
      clientId: Number(metadata.client_id || metadata.groomigo_client_id || 0) || null,
      membershipId, invoiceId: Number(metadata.invoice_id || 0) || null,
    });
    if (membershipId) {
      const [membership] = await db.select({ failedPaymentCount: memberships.failedPaymentCount }).from(memberships).where(eq(memberships.id, membershipId)).limit(1);
      if (membership) {
        await db.update(memberships).set({
          failedPaymentCount: membership.failedPaymentCount + 1,
          lastFailedPaymentAt: new Date(),
          status: "pending_payment",
        }).where(eq(memberships.id, membershipId));
      }
    }
    return { duplicate: false, handled: "payment_intent_failed" };
  }

  // Anything else is recorded and ignored, so the dedupe table stays a
  // complete log of what Stripe has told us.
  await db.insert(stripeEvents).values({ stripeEventId: event.id, eventType: event.type, tenantId: 1 });
  return { duplicate: false, handled: "ignored" };
}
