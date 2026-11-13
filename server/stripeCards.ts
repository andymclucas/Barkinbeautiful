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
import { and, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { clients, memberships } from "../drizzle/schema";
import { getDb } from "./db";
import { requireStripeClient } from "./stripeClient";
import { getPortalBaseUrl } from "./appUrl";
import { cardLinkUrl } from "./cardLinkToken";
import { toStripeCents, stripeRecurring } from "@shared/stripeBilling";
import { resolveChargePlan } from "@shared/membershipBillingCycle";
import { planFamilyBilling } from "@shared/familyBilling";
import { resolvePauseResumesAt, validatePausePlan, type PausePlan } from "@shared/membershipPause";
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
  // The CLIENT returns to this after saving a card, so it is a client
  // page and belongs on the client host.
  const base = getPortalBaseUrl();
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
 * The link to GIVE a client — short, and good for a month.
 *
 * `createCardSetupLink` above makes a Stripe Checkout session and hands
 * back its URL. That is the right thing when the client is on the page
 * and about to be redirected. It is the wrong thing to put in a text or
 * an email, for two reasons measured on 10/11/2026:
 *
 * It is enormous. The one in Lauren's thread was 299 characters before
 * it ran off the screen, taking her message to four SMS segments —
 * four times the cost, on a campaign aimed at ten thousand clients.
 *
 * And it dies. Stripe expires a Checkout session after 24 hours, so a
 * link texted on Friday fails on Saturday with Stripe's own error page.
 *
 * This hands back a signed stand-in that makes the Stripe session when
 * the client clicks. About 65 characters, always fresh. See
 * server/cardLinkToken.ts and the /card/:token route.
 */
export function clientCardLink(clientId: number): string {
  return cardLinkUrl(getPortalBaseUrl(), clientId);
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

  /* The emailed link is a link for a CLIENT, so it is the short one
     that outlives a Stripe session. See clientCardLink. */
  const link = { url: clientCardLink(clientId) };
  const { subject, html } = buildCardLinkEmail({
    firstName: client.firstName,
    url: link.url,
    replacingExistingCard: Boolean(client.existingPaymentMethodId),
    // So the short link on our own client host passes the email's check.
    ownBaseUrl: getPortalBaseUrl(),
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
/**
 * A SetupIntent for entering a card inside Groomigo, rather than on
 * Stripe's hosted page.
 *
 * Andy, 03/11/2026: "add a card to the client's file securely without
 * authenticating... would be a huge job to try and add 12,000 cards
 * with text messages."
 *
 * The hosted page already sent nothing — it opens in a tab — but it is
 * still a tab, and a client standing at the counter should not need
 * one. This returns a client secret that Stripe's own card fields
 * confirm directly from the browser, so the number goes from the iPad
 * to Stripe and never touches this server. That is what keeps the
 * business on SAQ A; a plain <input> for a card number would end it.
 *
 * `usage: "off_session"` because the whole point is charging it later
 * without the client present.
 */
export async function createCardSetupIntent(clientId: number) {
  const stripe = requireStripeClient();
  const customerId = await ensureStripeCustomer(clientId);
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: { groomigo_client_id: String(clientId), payment_kind: "card_on_file" },
  });
  if (!intent.client_secret) throw new Error("Stripe did not return a client secret");
  return { clientSecret: intent.client_secret, setupIntentId: intent.id, customerId };
}

/**
 * Save the card a SetupIntent just collected.
 *
 * Called by the browser the moment Stripe confirms, rather than left to
 * the `setup_intent.succeeded` webhook. Two reasons: the staff member
 * is standing there and needs to see it worked, and a webhook that
 * arrives late or not at all would leave a card that Stripe holds and
 * Groomigo does not know about.
 *
 * The customer on the intent is checked against the client being saved
 * against, so a tampered setupIntentId cannot attach somebody else's
 * card to this record.
 */
export async function saveCardFromSetupIntent(clientId: number, setupIntentId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeClient();
  const intent = await stripe.setupIntents.retrieve(setupIntentId);
  if (intent.status !== "succeeded") {
    throw new Error(`That card was not confirmed (${intent.status})`);
  }
  const [client] = await db
    .select({ stripeCustomerId: clients.stripeCustomerId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const intentCustomer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
  if (!intentCustomer || (client?.stripeCustomerId && client.stripeCustomerId !== intentCustomer)) {
    throw new Error("That card belongs to a different client");
  }
  const paymentMethodId = typeof intent.payment_method === "string"
    ? intent.payment_method
    : intent.payment_method?.id;
  if (!paymentMethodId) throw new Error("Stripe returned no payment method");
  return attachPaymentMethodToClient(clientId, paymentMethodId);
}

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
  /**
   * Stripe returns the ORIGINAL intent for a repeated key instead of
   * making a second one, which is what stops a double-clicked button
   * charging a client twice. Optional because membership billing is
   * driven by a scheduler that cannot double-fire the same cycle;
   * anything a human presses should pass one.
   */
  idempotencyKey?: string;
}): Promise<OffSessionChargeResult> {
  const stripe = requireStripeClient();
  const amount = toStripeCents(input.amountDollars);
  if (amount <= 0) {
    return { ok: false, paymentIntentId: null, declineCode: null, message: "Nothing to charge" };
  }
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: "aud",
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        off_session: true,
        confirm: true,
        description: input.description,
        metadata: input.metadata ?? {},
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
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
/**
 * @param firstChargeOn  ISO date (yyyy-mm-dd, Brisbane) to take the first
 *   payment. Omitted means charge now. Used when a client has to be told
 *   how the new billing works before any money leaves their account —
 *   the salon sets it up today and it starts on the agreed day, instead of
 *   somebody having to remember to click the button that morning.
 */
/** Whether a just-created Stripe subscription means the membership is live. */
export function membershipLiveOnStart(subscriptionStatus: string | null | undefined): boolean {
  return subscriptionStatus === "active" || subscriptionStatus === "trialing";
}

export async function startMembershipSubscription(membershipId: number, firstChargeOn?: string | null) {
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
      billingCycle: memberships.billingCycle,
      status: memberships.status,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  // Same tenant guard the client-portal procedures use: the tRPC context
  // carries no tenantId, so fail closed rather than trusting an id.
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");

  /**
   * Never start billing a membership that is not meant to be billed.
   *
   * This used to have no status check at all, which was survivable
   * only because the button was hidden on anything already on Stripe.
   * Now that hand-billed memberships can be paused, a paused row still
   * shows "Set Weekly Billing", and one click would start a
   * subscription and charge at once — a client who had just been told
   * their billing was on hold.
   */
  /*
   * Pending with no subscription is "Added — not billing yet"
   * (shared/membershipBillingState.ts): the state Add membership and an
   * approved online sign-up both create on purpose, and starting billing is
   * exactly how it is meant to leave. Refusing it — once memberships really
   * started pending on 12/11/2026 — stopped every new membership being
   * billed. Pending WITH a subscription is a failed payment, and is still
   * refused below by the existing-subscription return.
   */
  const addedNotBilling = membership.status === "pending_payment" && !membership.stripeSubscriptionId;
  if (membership.status !== "active" && !addedNotBilling) {
    throw new Error(
      membership.status === "paused"
        ? "This membership is paused — resume it before starting billing"
        : `This membership is ${membership.status}, so billing cannot be started`,
    );
  }

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

  // Cadence and amount come from ONE decision, never two. Resolving them
  // separately is what let a monthly membership bill the weekly rate on a
  // weekly cadence — see resolveChargePlan.
  const plan = resolveChargePlan(membership);
  if (!plan.ok) throw new Error(plan.error);
  const { cycle, amountCents: amount } = plan;

  const productId = await ensureMembershipProduct(stripe, membership.tenantId ?? 1);
  // trial_end rather than billing_cycle_anchor: "take nothing until this
  // day, then charge and start the weekly cycle from it" is exactly the
  // behaviour wanted, and it cannot accidentally prorate a part-week.
  const trialEnd = firstChargeStamp(firstChargeOn);

  const subscription = await stripe.subscriptions.create({
    customer: client.stripeCustomerId,
    default_payment_method: client.paymentMethodId,
    collection_method: "charge_automatically",
    ...(trialEnd ? { trial_end: trialEnd } : {}),
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
      nextBillingDate: subscriptionPeriodEnd(subscription),
      // Live once Stripe has accepted it: trialing (first charge on a later
      // day) or active (charged now). "incomplete" means the first charge
      // failed, so it stays pending and reads "Payment failed".
      ...(addedNotBilling && membershipLiveOnStart(subscription.status) ? { status: "active" as const } : {}),
    })
    .where(eq(memberships.id, membership.id));

  return { subscriptionId: subscription.id, alreadyExisted: false };
}

/**
 * Put several of one client's memberships onto ONE Stripe payment, or add
 * memberships to a payment that is already running.
 *
 * One subscription, one line per membership (shared/familyBilling.ts).
 * Each line carries its membership id, which is how a single dog is
 * later taken off the payment without touching the others.
 *
 * A membership added to a running payment is charged from the NEXT
 * invoice, with no part-week: `proration_behavior: "none"`. A surprise
 * part-charge on the day somebody ticks a box is exactly what a client
 * rings about.
 */
export async function startFamilySubscription(membershipIds: number[], firstChargeOn?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const stripe = requireStripeClient();
  const ids = Array.from(new Set(membershipIds));
  const rows = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      clientId: memberships.clientId,
      name: memberships.name,
      pricePerCycle: memberships.pricePerCycle,
      billingCycleWeeks: memberships.billingCycleWeeks,
      billingCycle: memberships.billingCycle,
      status: memberships.status,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(inArray(memberships.id, ids));
  // Same tenant guard as startMembershipSubscription: fail closed.
  if (rows.length !== ids.length || rows.some((r) => (r.tenantId ?? 1) !== 1)) throw new Error("Membership not found");

  const charge = new Map(rows.map((r) => [r.id, resolveChargePlan(r)] as const));
  const unbillable = rows.find((r) => !charge.get(r.id)!.ok);
  if (unbillable) {
    const plan = charge.get(unbillable.id)!;
    throw new Error(plan.ok ? "This membership cannot be billed" : plan.error);
  }
  const plan = planFamilyBilling(rows.map((r) => {
    const c = charge.get(r.id)!;
    return {
      id: r.id, clientId: r.clientId, tenantId: r.tenantId, status: r.status,
      stripeSubscriptionId: r.stripeSubscriptionId,
      cycle: c.ok ? c.cycle : null,
      amountCents: c.ok ? c.amountCents : 0,
    };
  }));
  if (!plan.ok) throw new Error(plan.error);

  const [first] = rows;
  const [client] = await db
    .select({ stripeCustomerId: clients.stripeCustomerId, paymentMethodId: clients.stripeDefaultPaymentMethodId })
    .from(clients)
    .where(eq(clients.id, first.clientId!))
    .limit(1);
  if (!client?.stripeCustomerId || !client.paymentMethodId) {
    throw new Error("This client has no card on file yet. Send them a card link first.");
  }

  const productId = await ensureMembershipProduct(stripe, first.tenantId ?? 1);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const lineFor = (id: number) => {
    const row = byId.get(id)!;
    const c = charge.get(id)!;
    if (!c.ok) throw new Error(c.error);
    return {
      metadata: {
        groomigo_membership_id: String(id),
        groomigo_membership_name: row.name ?? "Grooming membership",
      },
      price_data: {
        currency: "aud",
        unit_amount: c.amountCents,
        recurring: stripeRecurring(c.cycle),
        product: productId,
      },
    };
  };
  const addedIds = plan.toAdd.map((c) => c.id).sort((a, b) => a - b);

  let subscriptionId = plan.existingSubscriptionId;
  let liveOnStart = true;
  let nextBilling: Date | null = null;

  if (subscriptionId) {
    // Joining a running payment. One line each, charged from the next invoice.
    for (const id of addedIds) {
      await stripe.subscriptionItems.create({
        subscription: subscriptionId,
        ...lineFor(id),
        proration_behavior: "none",
      }, { idempotencyKey: `groomigo-family-item-${subscriptionId}-${id}` });
    }
    const [sibling] = await db.select({ nextBillingDate: memberships.nextBillingDate })
      .from(memberships).where(eq(memberships.stripeSubscriptionId, subscriptionId)).limit(1);
    nextBilling = sibling?.nextBillingDate ?? null;
  } else {
    const trialEnd = firstChargeStamp(firstChargeOn);
    const subscription = await stripe.subscriptions.create({
      customer: client.stripeCustomerId,
      default_payment_method: client.paymentMethodId,
      collection_method: "charge_automatically",
      ...(trialEnd ? { trial_end: trialEnd } : {}),
      items: addedIds.map(lineFor),
      metadata: {
        // The first id keeps the single-membership readers working (the
        // subscription.deleted fallback reads it); the list is the truth.
        groomigo_membership_id: String(addedIds[0]),
        groomigo_membership_ids: addedIds.join(","),
        groomigo_client_id: String(first.clientId),
        tenant_id: String(first.tenantId ?? 1),
        payment_kind: "membership_subscription",
      },
      payment_behavior: "allow_incomplete",
    }, {
      // Two admins clicking at once, or a retry after a failed DB write,
      // must not create a second live payment that bills for ever.
      idempotencyKey: `groomigo-family-sub-${addedIds.join("-")}`,
    });
    subscriptionId = subscription.id;
    liveOnStart = membershipLiveOnStart(subscription.status);
    nextBilling = subscriptionPeriodEnd(subscription);
  }

  for (const id of addedIds) {
    const row = byId.get(id)!;
    const addedNotBilling = row.status === "pending_payment" && !row.stripeSubscriptionId;
    await db.update(memberships).set({
      stripeSubscriptionId: subscriptionId,
      gatewaySubscriptionId: subscriptionId,
      paymentGateway: "stripe",
      nextBillingDate: nextBilling,
      ...(addedNotBilling && liveOnStart ? { status: "active" as const } : {}),
    }).where(eq(memberships.id, id));
  }

  return {
    subscriptionId,
    joinedExisting: Boolean(plan.existingSubscriptionId),
    memberships: plan.toAdd.length + plan.alreadyOn.length,
    totalCents: plan.totalCents,
  };
}

/** The other memberships paid for by the same Stripe subscription. */
async function membershipsSharingSubscription(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, subscriptionId: string, exceptId: number) {
  return db.select({ id: memberships.id }).from(memberships)
    .where(and(eq(memberships.stripeSubscriptionId, subscriptionId), ne(memberships.id, exceptId)));
}

/**
 * A Brisbane calendar date turned into the Unix second Stripe wants.
 *
 * Billing starts at 9am Brisbane on that day, not midnight: a charge that
 * lands while the client is asleep and fails is discovered hours later,
 * and a decline during salon hours can actually be dealt with.
 *
 * A date in the past is ignored rather than rejected — Stripe would refuse
 * it, and "start now" is the sensible reading of a day that has been and
 * gone.
 */
function firstChargeStamp(isoDate: string | null | undefined): number | undefined {
  const value = (isoDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const when = new Date(`${value}T09:00:00+10:00`);
  if (Number.isNaN(when.getTime())) return undefined;
  const seconds = Math.floor(when.getTime() / 1000);
  return seconds > Math.floor(Date.now() / 1000) ? seconds : undefined;
}

/**
 * When the subscription next bills.
 *
 * current_period_end sat on the subscription in older API versions and
 * moved onto the subscription items in newer ones; this account is on
 * 2026-08-26. Read both shapes rather than silently returning null and
 * leaving the Next Billing column blank for every Stripe membership.
 */
function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const direct = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const fromItem = subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const seconds = direct ?? fromItem?.current_period_end;
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
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
  /*
   * On a shared payment (shared/familyBilling.ts) stopping ONE dog must
   * not stop the others. Take just this membership's line off, with no
   * part-week credit, and leave the subscription running. If the line
   * cannot be found, refuse: cancelling the whole payment on a guess
   * would silently stop charging for the other dogs.
   */
  const sharing = await membershipsSharingSubscription(db, membership.stripeSubscriptionId, membership.id);
  if (sharing.length > 0) {
    const items = await stripe.subscriptionItems.list({ subscription: membership.stripeSubscriptionId, limit: 100 });
    const line = items.data.find((item) => item.metadata?.groomigo_membership_id === String(membership.id));
    if (!line) {
      throw new Error("This membership shares a payment with another, and its line could not be found on Stripe. Nothing was changed. Check the subscription in Stripe.");
    }
    await stripe.subscriptionItems.del(line.id, { proration_behavior: "none" });
    await db
      .update(memberships)
      .set({ stripeSubscriptionId: null, gatewaySubscriptionId: null, paymentGateway: "other" })
      .where(eq(memberships.id, membership.id));
    return { cancelled: true, leftRunningFor: sharing.length };
  }
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
  return { cancelled: true, leftRunningFor: 0 };
}

/**
 * Stop charging a membership without tearing down its subscription.
 *
 * For a client who is away or between dogs: Stripe keeps the
 * subscription and the saved card, but issues nothing while paused.
 * "void" rather than "keep_as_draft" so no invoice quietly accrues and
 * lands as a lump sum the day they come back.
 *
 * The restart is decided up front — after N billing cycles, on a date,
 * or not until somebody says so — because the version of this that
 * paused indefinitely relied on a human remembering, and the salon has
 * ~153 of these.
 *
 * Where a resume date is known it is handed to Stripe as well, so
 * Stripe restarts collection on its own. The scheduled sweep still
 * runs: Stripe resuming does NOT update this row, and a membership
 * that Stripe is charging while Groomigo shows "paused" is worse than
 * either state on its own.
 *
 * Works for a membership with no Stripe subscription at all. Most of
 * the book is still being migrated from MoeGo and is billed by hand —
 * refusing to pause those would make the feature useless for exactly
 * the clients most likely to need it.
 *
 * NOTE: membership status "paused" is also what the failed-payment
 * escalation sets. `pauseMode` marks which of the two this is, and the
 * sweep also refuses any row with a failure count or booking
 * suspension — that second check is the one that protects the money
 * path. See shared/membershipPause.ts.
 */
export async function pauseMembershipSubscription(
  membershipId: number,
  plan: PausePlan = { mode: "manual" },
  now: Date = new Date(),
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const validation = validatePausePlan(plan, now);
  if (!validation.ok) throw new Error(validation.reason);

  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      status: memberships.status,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
      billingCycle: memberships.billingCycle,
      billingCycleWeeks: memberships.billingCycleWeeks,
      nextBillingDate: memberships.nextBillingDate,
      failedPaymentCount: memberships.failedPaymentCount,
      bookingSuspended: memberships.bookingSuspended,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");
  // Both closed states, matching the four other membership mutations
  // that already treat "expired" as finished. Nothing writes "expired"
  // for memberships today, so this is consistency rather than a fix.
  // Pausing an already-paused membership is allowed on purpose: it is
  // how staff change their mind about when it restarts.
  if (membership.status === "cancelled") throw new Error("This membership has been cancelled");
  if (membership.status === "expired") throw new Error("This membership has expired");

  /**
   * A membership behind on payments is not a candidate for a holiday.
   * Pausing one would clear the debt from view — it stops looking like
   * a failure and starts looking like an arrangement — while the money
   * is still owed.
   */
  if ((membership.failedPaymentCount ?? 0) > 0) {
    throw new Error("Sort the failed payment out before pausing this membership");
  }

  /**
   * A membership already on a booking hold cannot be paused either.
   *
   * It would be a one-way door: `isDeliberatePause` refuses any row
   * with a booking suspension, so the sweep would never lift it — while
   * Stripe, which knows nothing about holds, would restart collection
   * at `resumes_at` regardless. The client gets billed by a membership
   * Groomigo still shows as suspended.
   */
  if (membership.bookingSuspended) {
    throw new Error("This membership is on hold — lift the hold before pausing it");
  }

  const resumesAt = resolvePauseResumesAt(plan, {
    nextBillingDate: membership.nextBillingDate ?? null,
    billingCycle: (membership.billingCycle ?? "weekly") as "weekly" | "monthly",
    billingCycleWeeks: membership.billingCycleWeeks ?? 1,
    now,
  });

  if (membership.stripeSubscriptionId) {
    const stripe = requireStripeClient();
    await stripe.subscriptions.update(membership.stripeSubscriptionId, {
      pause_collection: {
        behavior: "void",
        // Stripe wants whole seconds. Omitted entirely for a manual
        // pause: a `resumes_at` of null is how Stripe is told there
        // isn't one.
        ...(resumesAt ? { resumes_at: Math.floor(resumesAt.getTime() / 1000) } : {}),
      },
    });
  }

  await db
    .update(memberships)
    .set({
      status: "paused",
      pauseMode: plan.mode,
      pauseResumesAt: resumesAt,
      pausedAt: now,
    })
    /*
     * Stripe pauses the PAYMENT, so on a shared payment every membership
     * on it has stopped being charged (shared/familyBilling.ts). Mark
     * the active ones paused too, or Groomigo would show a dog as
     * billing while nothing is being taken for it.
     */
    .where(membership.stripeSubscriptionId
      ? or(
          eq(memberships.id, membership.id),
          and(eq(memberships.stripeSubscriptionId, membership.stripeSubscriptionId), eq(memberships.status, "active")),
        )
      : eq(memberships.id, membership.id));

  return { paused: true, resumesAt, onStripe: Boolean(membership.stripeSubscriptionId) };
}

/** Start charging a paused membership again from its next cycle. */
export async function resumeMembershipSubscription(membershipId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      status: memberships.status,
      stripeSubscriptionId: memberships.stripeSubscriptionId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!membership || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");

  /**
   * Only a paused membership can be resumed.
   *
   * This guard replaces one that used to exist by accident. Refusing
   * every membership without a Stripe subscription also refused every
   * CANCELLED one, because cancelling clears the subscription id —
   * so when that throw was removed to let hand-billed memberships
   * resume, the protection went with it. An admin clicking Resume on a
   * stale list could then reactivate a cancelled membership, leaving it
   * counted by every `status = "active"` revenue report.
   */
  if (membership.status !== "paused") {
    // On a shared payment, resuming one membership resumes them all. The
    // sweep then reaches the next one and finds it already active: that
    // is the job done, not a membership somebody changed underneath it.
    if (membership.status === "active" && membership.stripeSubscriptionId
      && (await membershipsSharingSubscription(db, membership.stripeSubscriptionId, membership.id)).length > 0) {
      return { resumed: true, onStripe: true };
    }
    throw new Error(`This membership is ${membership.status}, not paused`);
  }

  /**
   * A membership with no subscription is resumable too.
   *
   * Pause accepts hand-billed memberships — most of the book is still
   * one while it migrates off MoeGo — so refusing to resume them left
   * a manual pause that nothing could lift: the sweep never touches
   * manual mode, and this threw. The row simply goes back to active;
   * there is no collection to restart.
   */
  if (membership.stripeSubscriptionId) {
    const stripe = requireStripeClient();
    await stripe.subscriptions.update(membership.stripeSubscriptionId, { pause_collection: null });
  }

  // The schedule is cleared along with the status. Leaving a stale
  // restart date behind would have the card show "paused until 3 Nov"
  // on a membership that is being charged again.
  // Conditional on the status it was read under. My previous commit
  // message claimed the resume writes re-assert their conditions; only
  // the sweep's branch actually did. This is the other half.
  const [updated] = await db
    .update(memberships)
    .set({ status: "active", pauseMode: null, pauseResumesAt: null, pausedAt: null })
    /*
     * The other memberships on a shared payment come back with it. Only
     * the ones paused DELIBERATELY (pauseMode set): a row paused by a
     * failed payment has no pauseMode and must not be waved back to
     * active here.
     */
    .where(and(
      eq(memberships.status, "paused"),
      membership.stripeSubscriptionId
        ? or(
            eq(memberships.id, membership.id),
            and(eq(memberships.stripeSubscriptionId, membership.stripeSubscriptionId), isNotNull(memberships.pauseMode)),
          )
        : eq(memberships.id, membership.id),
    ));
  if ((updated as unknown as { affectedRows?: number }).affectedRows === 0) {
    throw new Error("This membership changed while it was being resumed — check it and try again");
  }
  return { resumed: true, onStripe: Boolean(membership.stripeSubscriptionId) };
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
