/**
 * The Stripe client for a salon's CLIENT money: cards on file, membership
 * subscriptions, off-session charges and invoice checkouts.
 *
 * Which account is decided by clientMoneyAccount (shared/stripeConnect.ts):
 * Barkin' Beautiful on the platform account, which is its own Stripe; any
 * other salon on its own connected account or not at all. Every call that
 * moves a client's money goes through here, so no path can quietly take one
 * salon's payment on another business's account.
 *
 * The client is built with `stripeAccount` in its config, so every request
 * made with it is on that salon's account — a call that forgot to pass the
 * option per request cannot exist.
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { clients, memberships, tenants } from "../drizzle/schema";
import { getDb } from "./db";
import { clientMoneyAccount, type ClientMoneyAccount } from "@shared/stripeConnect";
import { PLATFORM_HOME_TENANT_ID } from "@shared/salonAccess";

/** Set once Stripe is sending connected accounts' events to /api/stripe/connect-webhook. */
export function connectWebhookSecret(): string | null {
  return process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || null;
}

export async function clientMoneyAccountFor(tenantId: number): Promise<ClientMoneyAccount & { platformFeeBps: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [tenant] = await db.select({
    stripeAccountId: tenants.stripeAccountId,
    stripeChargesEnabled: tenants.stripeChargesEnabled,
    stripeDetailsSubmitted: tenants.stripeDetailsSubmitted,
    platformFeeBps: tenants.platformFeeBps,
  }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const decision = clientMoneyAccount({
    tenantId,
    homeTenantId: PLATFORM_HOME_TENANT_ID,
    tenant: tenant ?? null,
    connectEventsReceived: connectWebhookSecret() !== null,
  });
  return { ...decision, platformFeeBps: tenant?.platformFeeBps ?? null };
}

/** A Stripe client on this salon's own account, or a refusal saying what to set up. */
export async function requireClientStripe(tenantId: number): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Stripe is not configured. Open Settings → Payment to complete setup.");
  const account = await clientMoneyAccountFor(tenantId);
  if (account.kind === "refused") throw new Error(account.reason);
  return new Stripe(key, {
    typescript: true,
    ...(account.kind === "connected" ? { stripeAccount: account.accountId } : {}),
  });
}

/** The salon a client belongs to, for card calls that start from a client. */
export async function tenantIdOfClient(clientId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.select({ tenantId: clients.tenantId }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!row) throw new Error("Client not found");
  return row.tenantId;
}

/** The salon a Stripe subscription's membership belongs to. */
export async function tenantIdOfSubscription(subscriptionId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.select({ tenantId: memberships.tenantId }).from(memberships)
    .where(eq(memberships.stripeSubscriptionId, subscriptionId)).limit(1);
  return row?.tenantId ?? null;
}
