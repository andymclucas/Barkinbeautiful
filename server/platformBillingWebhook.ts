/**
 * The webhook half of a salon paying Groomigo.
 *
 * processStripeEvent asks this first about every event. It answers null
 * for anything it cannot PROVE is a salon's own subscription to Groomigo,
 * and the event then carries on to the client-payment handlers untouched.
 * The rules for "prove" are pure functions in shared/platformBilling.ts.
 *
 * ## Why a completed Checkout is handled here at all
 *
 * Until 17/11/2026 it was not. A platform `checkout.session.completed`
 * fell to the generic checkout handler, which reads `metadata.tenant_id`,
 * found none, and filed the event under tenant 1 — Barkin' Beautiful, the
 * one salon that never pays — without storing the subscription id. The
 * first `invoice.paid` then matched nothing, because nothing had stored
 * the id it is matched on, and was filed under tenant 1 as well. Whether
 * the salon was ever unlocked depended on a
 * `customer.subscription.updated` happening to arrive.
 *
 * Now the completed Checkout links the salon itself, and so does a first
 * invoice that beats it here: Stripe does not promise an order.
 *
 * ## Do the work, THEN record the event
 *
 * The client handlers record the event id first. Here it is last, on
 * purpose. Everything this file writes is derived from Stripe's current
 * view of the subscription, so doing it twice is harmless — but an event
 * recorded BEFORE a write that then fails is answered "duplicate" on
 * Stripe's retry and never repaired, and the thing left unrepaired would
 * be a salon that has paid and is still locked out.
 *
 * ## Refused is not "somebody else's"
 *
 * An event that carries our marker but fails a check is handled by
 * nobody. Handing it on would file it under tenant 1 by the client
 * handlers' default. It is logged, the owner is told, and it is not
 * recorded, so replaying it from Stripe after the cause is fixed works.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { stripeEvents, tenants } from "../drizzle/schema";
import { requireStripeClient } from "./stripeClient";
import { isDuplicateEntryError } from "./dbErrors";
import { notifyOwner } from "./ownerNotification";
import { syncPlatformSubscription, tenantIdForPlatformSubscription } from "./platformBilling";
import {
  classifyPlatformCheckout, platformLinkProblem, platformTenantIdFromMetadata,
  type SalonSubscriptionStatus,
} from "@shared/platformBilling";
import { subscriptionIdOf, subscriptionMetadataOf } from "@shared/stripeInvoiceSubscription";

export type PlatformEventResult =
  | { platformSubscription: SalonSubscriptionStatus }
  | { platformSubscription: "second_subscription" }
  | { ignored: true; platformRefused: string };

/** Everything this handler touches, so it can be run without Stripe or a database. */
export type PlatformWebhookStore = {
  loadTenant(tenantId: number): Promise<{
    platformStripeCustomerId: string | null;
    platformStripeSubscriptionId: string | null;
  } | null>;
  tenantIdForSubscription(subscriptionId: string | null): Promise<number | null>;
  /** On the PLATFORM account: no { stripeAccount }, ever. */
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  sync(tenantId: number, subscription: Stripe.Subscription): Promise<{ status: SalonSubscriptionStatus }>;
  recordEvent(event: { id: string; type: string }, tenantId: number): Promise<void>;
  alert(title: string, content: string): Promise<void>;
};

const realStore: PlatformWebhookStore = {
  async loadTenant(tenantId) {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const [row] = await db.select({
      platformStripeCustomerId: tenants.platformStripeCustomerId,
      platformStripeSubscriptionId: tenants.platformStripeSubscriptionId,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return row ?? null;
  },
  tenantIdForSubscription: (subscriptionId) => tenantIdForPlatformSubscription(subscriptionId),
  retrieveSubscription: (subscriptionId) => requireStripeClient().subscriptions.retrieve(subscriptionId),
  sync: (tenantId, subscription) => syncPlatformSubscription(tenantId, subscription),
  async recordEvent(event, tenantId) {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    try {
      await db.insert(stripeEvents).values({ stripeEventId: event.id, eventType: event.type, tenantId });
    } catch (error) {
      // Two deliveries of one event racing each other. Both did the same
      // idempotent work; the loser of the insert has nothing left to do.
      if (!isDuplicateEntryError(error)) throw error;
    }
  },
  async alert(title, content) {
    await notifyOwner({ title, content }).catch(() => {});
  },
};

const idOf = (ref: string | { id?: string | null } | null | undefined): string | null =>
  !ref ? null : typeof ref === "string" ? ref : (ref.id ?? null);

async function refuse(
  store: PlatformWebhookStore, event: Stripe.Event, reason: string,
): Promise<PlatformEventResult> {
  console.error(`[stripe] platform ${event.type} ${event.id} refused: ${reason}`);
  await store.alert(
    "A salon's Groomigo subscription payment could not be matched to a salon",
    `Stripe sent ${event.type} (${event.id}) marked as a salon paying for Groomigo, but it was ` +
    `not applied: ${reason}.\n\nNothing was recorded against any salon. If a salon has paid and ` +
    `is still locked out, this is why — check the event in Stripe, and it can be resent from ` +
    `there once the cause is fixed.`,
  );
  return { ignored: true, platformRefused: reason };
}

/**
 * Point a salon at its subscription and copy Stripe's state onto it.
 *
 * Shared by the completed Checkout and by a first invoice that arrives
 * before it. The subscription is re-read from Stripe rather than trusted
 * from the event, so a delayed or replayed event writes what is true now.
 */
async function linkAndSync(
  store: PlatformWebhookStore,
  event: Stripe.Event,
  claim: { tenantId: number; subscriptionId: string; customerId: string | null },
): Promise<PlatformEventResult> {
  const tenant = await store.loadTenant(claim.tenantId);
  if (!tenant) return refuse(store, event, `salon ${claim.tenantId} does not exist`);

  const subscription = await store.retrieveSubscription(claim.subscriptionId);
  const check = platformLinkProblem({
    ...claim,
    tenant,
    subscriptionMetadata: subscription.metadata as Record<string, string>,
  });
  if (check.problem === "refuse") return refuse(store, event, check.reason);
  if (check.problem === "second_subscription") {
    console.error(`[stripe] platform ${event.type} ${event.id}: ${check.reason}`);
    await store.alert(
      "A salon has two Groomigo subscriptions",
      `${check.reason}.\n\nThe salon's account still follows the first one. The second is very ` +
      `likely charging them twice.`,
    );
    await store.recordEvent(event, claim.tenantId);
    return { platformSubscription: "second_subscription" };
  }

  const { status } = await store.sync(claim.tenantId, subscription);
  await store.recordEvent(event, claim.tenantId);
  console.log(`[stripe] ${event.type}: tenant ${claim.tenantId} linked to ${claim.subscriptionId}, now ${status}`);
  return { platformSubscription: status };
}

/**
 * Handle the event if it is a salon's subscription to Groomigo.
 *
 * Returns null — and has written nothing — when it is not, so the caller
 * carries on to the client-payment handlers.
 */
export async function handlePlatformStripeEvent(
  event: Stripe.Event,
  store: PlatformWebhookStore = realStore,
): Promise<PlatformEventResult | null> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const decision = classifyPlatformCheckout({
      mode: session.mode,
      metadata: session.metadata as Record<string, string> | null,
      subscription: session.subscription,
      customer: session.customer,
    });
    if (decision.kind === "not_platform") return null;
    if (decision.kind === "refused") return refuse(store, event, decision.reason);
    return linkAndSync(store, event, decision);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const byId = await store.tenantIdForSubscription(subscription.id);
    if (byId !== null) {
      // The id is sitting in tenants because we put it there: proof enough.
      //
      // Re-read rather than trusted from the event. Stripe does not
      // deliver in order, and this now writes the PLAN as well as the
      // status: an older "updated" arriving after a newer one would put a
      // salon back on the plan it just upgraded from, or back to active
      // after a failed payment. A subscription that can no longer be
      // read at all has ended, and for a "deleted" the event says so.
      let current = subscription;
      try {
        current = await store.retrieveSubscription(subscription.id);
      } catch (error) {
        if (event.type !== "customer.subscription.deleted") throw error;
      }
      const { status } = await store.sync(byId, current);
      await store.recordEvent(event, byId);
      console.log(`[stripe] platform subscription for tenant ${byId} is now ${status}`);
      return { platformSubscription: status };
    }
    const byMarker = platformTenantIdFromMetadata(subscription.metadata as Record<string, string>);
    if (byMarker === null) return null; // A membership's subscription. Not ours.
    /*
     * Marked for a salon that is not following it yet — or is following a
     * different one. Linked through the same checks as a Checkout, so a
     * late "deleted" for an OLD subscription cannot cancel a salon that
     * has since started a new one.
     */
    return linkAndSync(store, event, {
      tenantId: byMarker, subscriptionId: subscription.id, customerId: idOf(subscription.customer),
    });
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = subscriptionIdOf(invoice);
    /*
     * Matched on the subscription id against our OWN column first. Stripe
     * does not reliably copy subscription metadata onto every invoice,
     * and an id that is sitting in tenants is proof enough.
     */
    const byId = await store.tenantIdForSubscription(subscriptionId);
    if (byId !== null && subscriptionId) {
      /*
       * Re-read the subscription rather than inferring a status from the
       * invoice. A failed invoice does not necessarily mean past_due —
       * Stripe may still be retrying, and it is Stripe's own view of the
       * subscription that decides, not ours.
       */
      const subscription = await store.retrieveSubscription(subscriptionId);
      const { status } = await store.sync(byId, subscription);
      await store.recordEvent(event, byId);
      console.log(`[stripe] ${event.type} for tenant ${byId}; subscription now ${status}`);
      return { platformSubscription: status };
    }
    /*
     * The FIRST invoice can arrive before the completed Checkout, when no
     * id is stored yet. Where Stripe copied the subscription's metadata
     * onto the invoice the marker identifies it, and it is linked through
     * the same checks. Where it did not, this cannot tell and says so by
     * returning null — the Checkout event links the salon instead.
     */
    const byMarker = platformTenantIdFromMetadata(subscriptionMetadataOf(invoice));
    if (byMarker === null) return null; // A membership invoice, or unknowable. Not claimed.
    if (!subscriptionId) return refuse(store, event, "invoice carries the platform marker but names no subscription");
    return linkAndSync(store, event, {
      tenantId: byMarker, subscriptionId, customerId: idOf(invoice.customer as string | { id?: string } | null),
    });
  }

  return null;
}
