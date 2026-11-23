/**
 * Stripe events from salons' OWN connected accounts.
 *
 * A payment taken on a salon's connected account (server/clientStripe.ts)
 * raises its events on that account, and Stripe delivers those only to a
 * Connect webhook — never to /api/stripe/webhook. Without this endpoint a
 * client could be charged and the invoice never marked paid.
 *
 * The events are then handled by the same code as Barkin' Beautiful's, after
 * two checks that the event belongs to the salon whose account sent it: an
 * account we do not know is ignored, and an event naming a different salon
 * or another salon's client is refused rather than filed.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { clients, memberships } from "../drizzle/schema";
import { notifyOwner } from "./ownerNotification";
import { getDb } from "./db";
import { processStripeEvent } from "./stripePayments";
import { tenantIdForStripeAccount } from "./stripeConnectAccounts";
import { connectedEventProblem } from "@shared/stripeConnect";

export type ConnectedEventResult =
  | Awaited<ReturnType<typeof processStripeEvent>>
  | { ignored: true; reason: string };

export async function processConnectedStripeEvent(event: Stripe.Event): Promise<ConnectedEventResult> {
  const accountId = event.account ?? null;
  if (!accountId) return { ignored: true, reason: "not from a connected account" };
  const tenantId = await tenantIdForStripeAccount(accountId);
  if (tenantId === null) {
    console.warn(`[stripe] connect ${event.type} ${event.id} from unknown account ${accountId}`);
    return { ignored: true, reason: "unknown account" };
  }

  const metadata = ((event.data.object as { metadata?: Record<string, string> | null }).metadata) ?? {};
  const clientId = Number(metadata.client_id || metadata.groomigo_client_id || 0) || null;
  const membershipId = Number(metadata.membership_id || metadata.groomigo_membership_id || 0) || null;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  let clientTenantId: number | null = null;
  if (clientId) {
    const [row] = await db.select({ tenantId: clients.tenantId }).from(clients).where(eq(clients.id, clientId)).limit(1);
    clientTenantId = row?.tenantId ?? null;
  }
  let membershipTenantId: number | null = null;
  if (membershipId) {
    const [row] = await db.select({ tenantId: memberships.tenantId }).from(memberships).where(eq(memberships.id, membershipId)).limit(1);
    membershipTenantId = row?.tenantId ?? null;
  }
  const problem = connectedEventProblem({
    accountTenantId: tenantId,
    metadataTenantId: metadata.tenant_id ? Number(metadata.tenant_id) : null,
    clientId,
    clientTenantId,
    namesARecord: Boolean(metadata.invoice_id || membershipId),
    membershipId,
    membershipTenantId,
  });
  if (problem) {
    // Answered 200 so Stripe stops resending something that will never
    // pass, so a person has to be told: a client may have paid.
    console.error(`[stripe] connect ${event.type} ${event.id} from salon ${tenantId} refused: ${problem}`);
    await notifyOwner({
      title: "A payment from a salon's own Stripe account was not recorded",
      content: `Stripe sent ${event.type} (${event.id}) from salon ${tenantId}'s connected account, and it was refused: ${problem}.\n\nNothing was written to any salon. If a client has paid and does not show as paid, check this event in that salon's Stripe.`,
    }).catch(() => {});
    return { ignored: true, reason: problem };
  }
  return processStripeEvent(event);
}
