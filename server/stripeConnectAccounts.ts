/**
 * Creating and tracking a salon's Express account.
 *
 * Express means Stripe hosts the onboarding. We create an account, hand
 * the salon a one-time link, and Stripe asks them for bank details and
 * identity. We never see their keys, never hold their money, and never
 * handle their KYC.
 *
 * Everything here writes the salon's own tenant row and nothing else. A
 * salon with no account, or one part way through, keeps taking payments
 * exactly as it does today — see chargesOnConnectedAccount.
 */
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { requireStripeClient } from "./stripeClient";
import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { getAppBaseUrl } from "./appUrl";
import { connectState, type ConnectState } from "../shared/stripeConnect";

export type ConnectStatus = {
  state: ConnectState;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** What Stripe is still waiting for, in its own words. */
  requirementsDue: string[];
  platformFeeBps: number | null;
};

async function tenantRow(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!row) throw new Error("Salon not found");
  return { db, row };
}

export async function getConnectStatus(tenantId: number): Promise<ConnectStatus> {
  const { row } = await tenantRow(tenantId);
  let requirementsDue: string[] = [];
  try {
    requirementsDue = row.stripeRequirementsDue ? JSON.parse(row.stripeRequirementsDue) : [];
  } catch {
    // A malformed cache is not worth failing the page over.
    requirementsDue = [];
  }
  return {
    state: connectState(row),
    accountId: row.stripeAccountId ?? null,
    chargesEnabled: Boolean(row.stripeChargesEnabled),
    payoutsEnabled: Boolean(row.stripePayoutsEnabled),
    detailsSubmitted: Boolean(row.stripeDetailsSubmitted),
    requirementsDue,
    platformFeeBps: row.platformFeeBps ?? null,
  };
}

/**
 * Write back what Stripe says about an account.
 *
 * Stripe is the authority on whether a salon can take money; we only
 * cache it so a page load does not need an API call. Called from the
 * account.updated webhook and whenever the salon opens the screen.
 */
export async function syncAccountStatus(tenantId: number, account: Stripe.Account) {
  const { db } = await tenantRow(tenantId);
  const due = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ];
  await db.update(tenants).set({
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeRequirementsDue: JSON.stringify(Array.from(new Set(due))),
    // Stamped the first time Stripe says they can actually take money,
    // which is the moment that matters commercially.
    ...(account.charges_enabled ? { stripeConnectedAt: new Date() } : {}),
  }).where(eq(tenants.id, tenantId));
}

/** Create the Express account if there is not one already. */
export async function ensureConnectedAccount(tenantId: number): Promise<string> {
  const { db, row } = await tenantRow(tenantId);
  if (row.stripeAccountId) return row.stripeAccountId;

  const stripe = requireStripeClient();
  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    email: row.email ?? undefined,
    business_type: "company",
    business_profile: {
      name: row.name,
      // Grooming services. Stripe asks for this and guessing badly can
      // land an account in review.
      mcc: "0742",
      url: row.customDomain ? `https://${row.customDomain}` : undefined,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { groomigo_tenant_id: String(tenantId), groomigo_slug: row.slug },
  });

  await db.update(tenants).set({ stripeAccountId: account.id }).where(eq(tenants.id, tenantId));
  await syncAccountStatus(tenantId, account);
  return account.id;
}

/**
 * A one-time link into Stripe's hosted onboarding.
 *
 * Deliberately short-lived and single-use — that is Stripe's design, not
 * ours — so it is created fresh each time rather than stored.
 */
export async function createOnboardingLink(tenantId: number): Promise<string> {
  const accountId = await ensureConnectedAccount(tenantId);
  const stripe = requireStripeClient();
  const base = getAppBaseUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    // Stripe sends them here if the link expired before they finished.
    refresh_url: `${base}/settings?stripe_connect=refresh`,
    return_url: `${base}/settings?stripe_connect=return`,
    type: "account_onboarding",
  });
  return link.url;
}

/** A link into the salon's own Express dashboard, to see payouts. */
export async function createDashboardLink(tenantId: number): Promise<string> {
  const { row } = await tenantRow(tenantId);
  if (!row.stripeAccountId) throw new Error("This salon has not connected Stripe yet");
  const stripe = requireStripeClient();
  const link = await stripe.accounts.createLoginLink(row.stripeAccountId);
  return link.url;
}

/** Ask Stripe directly and cache the answer. */
export async function refreshFromStripe(tenantId: number): Promise<ConnectStatus> {
  const { row } = await tenantRow(tenantId);
  if (row.stripeAccountId) {
    const stripe = requireStripeClient();
    const account = await stripe.accounts.retrieve(row.stripeAccountId);
    await syncAccountStatus(tenantId, account);
  }
  return getConnectStatus(tenantId);
}

/** Find the salon an account.updated webhook is about. */
export async function tenantIdForStripeAccount(accountId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ id: tenants.id }).from(tenants)
    .where(eq(tenants.stripeAccountId, accountId)).limit(1);
  return row?.id ?? null;
}
