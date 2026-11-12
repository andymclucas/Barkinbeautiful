/**
 * The bulk client-portal invitation, with the service agreement first.
 *
 * Andy, 11/11/2026: "a mass email send that is getting people to set up
 * their portal and before they do, they need to sign the agreement as the
 * first page that it shows before they can access their portal".
 *
 * ## Where it is recorded
 *
 * In the existing email_campaigns / email_campaign_sends tables, so it
 * shows on the Email Campaigns page beside every other send, with no new
 * table. The campaign row's audience_filter is `{"type":"portal_invite"}`;
 * the generic campaign sender refuses that type, because its body is a
 * template with no per-client link and sending it would mail the wrong
 * thing to the whole list.
 *
 * ## Why it runs in the background
 *
 * Resend allows about two sends a second. Six hundred invitations is five
 * minutes, which is longer than a browser should hold a request open, so
 * the send writes every intended recipient as `pending` first and then
 * works through them on the server. The page polls for progress.
 *
 * ## At most once, never twice
 *
 * Each row is CLAIMED before it is sent, by stamping sent_at on a row
 * that is still pending with no stamp. A second runner — a double click,
 * a second instance — cannot claim the same row. If the server dies
 * between the claim and the result, the row is left pending WITH a stamp,
 * and a resume marks it failed as "interrupted" rather than sending it
 * again: one client possibly missing an email is recoverable from their
 * client page; two copies of a setup link, the first already dead, is
 * exactly the confusing email this is trying not to send.
 */
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { clients, emailCampaigns, emailCampaignSends, emailUnsubscribes, tenants } from "../drizzle/schema";
import { createClientPortalToken } from "@shared/clientPortalAccess";
import { portalLinkIssueEffect, type PortalAccountStatus } from "@shared/portalSetupLink";
import { escapeHtml } from "@shared/escapeHtml";
import {
  inviteGreeting,
  normaliseEmail,
  selectPortalInviteRecipients,
  type PortalInviteCandidate,
} from "@shared/portalInviteAudience";
import { getPortalBaseUrl } from "./appUrl";
import { loadPendingAgreements } from "./portalAgreements";

export const PORTAL_INVITE_AUDIENCE_TYPE = "portal_invite";

/**
 * Clients the salon has asked us not to contact yet, per tenant.
 *
 * Andy, 06/10/2026, on Toni Constantini (15) and Holly Lucas (258), the
 * first two real portal users: "Not moving ahead with Toni or Holly until
 * I confirm." Their links were made and deliberately not sent. A bulk
 * invitation must not send them for him. Remove an id here only when he
 * lifts the hold.
 */
const HELD_CLIENTS: Record<number, readonly number[]> = { 1: [15, 258] };

/** Resend's default limit is two requests a second; stay under it. */
const SEND_SPACING_MS = 600;

export function heldClientIds(tenantId: number): Set<number> {
  return new Set(HELD_CLIENTS[tenantId] ?? []);
}

/** Who the invitation would reach today, and why everybody else is not. */
export async function portalInviteAudience(db: any, tenantId: number) {
  const candidates: PortalInviteCandidate[] = await db.select({
    id: clients.id,
    firstName: clients.firstName,
    lastName: clients.lastName,
    email: clients.email,
    portalAccountStatus: clients.portalAccountStatus,
    portalLoginEmail: clients.portalLoginEmail,
    portalSetupExpiresAt: clients.portalSetupExpiresAt,
  })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.status, "active")));

  const unsubRows: { email: string }[] = await db.select({ email: emailUnsubscribes.email })
    .from(emailUnsubscribes)
    .where(eq(emailUnsubscribes.tenantId, tenantId));

  const loginRows: { id: number; email: string | null }[] = await db.select({ id: clients.id, email: clients.portalLoginEmail })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), isNotNull(clients.portalLoginEmail)));
  const portalLoginOwners = new Map<string, number>();
  for (const row of loginRows) {
    const email = normaliseEmail(row.email);
    if (email && !portalLoginOwners.has(email)) portalLoginOwners.set(email, row.id);
  }

  const result = selectPortalInviteRecipients({
    candidates,
    unsubscribedEmails: new Set(unsubRows.map((r) => normaliseEmail(r.email))),
    heldClientIds: heldClientIds(tenantId),
    portalLoginOwners,
  });
  return { ...result, activeClients: candidates.length };
}

export function portalInviteEmail(input: {
  firstName: string | null;
  salonName: string;
  salonPhone: string | null;
  setupUrl: string;
  expiresAt: Date;
  agreementTitles: string[];
}): { subject: string; html: string } {
  const salon = escapeHtml(input.salonName);
  const expires = input.expiresAt.toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane",
  });
  const agreementLine = input.agreementTitles.length > 0
    ? `<p>The first step is to read and sign our ${escapeHtml(input.agreementTitles.join(" and "))}. It takes a couple of minutes, and then you'll choose a password.</p>`
    : `<p>It takes a minute: you'll just choose a password.</p>`;
  const phoneLine = input.salonPhone
    ? ` or call us on ${escapeHtml(input.salonPhone)}`
    : "";
  return {
    subject: `Set up your ${input.salonName} client portal`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px">
  <p>${escapeHtml(inviteGreeting(input.firstName))}</p>
  <p>${salon} now has a client portal. You can see your upcoming appointments, follow your dog's groom on the day, and keep your details and payment card up to date.</p>
  ${agreementLine}
  <p style="margin:24px 0"><a href="${input.setupUrl}" style="background:#db2777;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;display:inline-block">Set up my portal</a></p>
  <p style="font-size:13px;color:#6b7280">This link is just for you and works until ${escapeHtml(expires)}.</p>
  <p style="font-size:13px;color:#6b7280">Any questions, reply to this email${phoneLine}.</p>
</div>`,
  };
}

/**
 * Give one client a fresh setup link, exactly as the client page's
 * "Send portal invite" does — the same status rules, so a campaign can
 * never do something to an account the button would not.
 *
 * Returns null when the client is no longer eligible: they set up a
 * portal, were switched off, or their address became somebody else's
 * login since the campaign started.
 */
async function issueSetupLinkForCampaign(db: any, clientId: number, tenantId: number, email: string) {
  const [client] = await db.select({
    id: clients.id,
    firstName: clients.firstName,
    status: clients.status,
    portalAccountStatus: clients.portalAccountStatus,
    portalLoginEmail: clients.portalLoginEmail,
    portalSetupExpiresAt: clients.portalSetupExpiresAt,
  })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  if (!client) return { skip: "Client no longer exists" as const };
  // Re-checked per row: a send of several hundred takes minutes, and the
  // preview's answers can go stale while it runs.
  if (client.status !== "active") return { skip: "Skipped: client is no longer active" as const };
  if (
    client.portalAccountStatus === "setup_pending" &&
    client.portalSetupExpiresAt && new Date(client.portalSetupExpiresAt).getTime() > Date.now()
  ) {
    return { skip: "Skipped: already holds a setup link that still works" as const };
  }
  const [unsubscribed] = await db.select({ id: emailUnsubscribes.id })
    .from(emailUnsubscribes)
    // Lower-cased on both sides: TiDB's default collation is case-sensitive.
    .where(and(eq(emailUnsubscribes.tenantId, tenantId), sql`LOWER(TRIM(${emailUnsubscribes.email})) = ${email}`))
    .limit(1);
  if (unsubscribed) return { skip: "Skipped: unsubscribed from salon emails" as const };
  if (client.portalAccountStatus === "active") return { skip: "Skipped: set up their portal before this reached them" as const };
  if (client.portalAccountStatus === "revoked") return { skip: "Skipped: portal access was turned off" as const };
  if (heldClientIds(tenantId).has(client.id)) return { skip: "Skipped: on hold" as const };

  const [taken] = await db.select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.portalLoginEmail, email), ne(clients.id, client.id)))
    .limit(1);
  if (taken) return { skip: "Skipped: this email is another client's portal login" as const };

  const setup = createClientPortalToken();
  const effect = portalLinkIssueEffect({
    currentStatus: client.portalAccountStatus as PortalAccountStatus,
    currentLoginEmail: client.portalLoginEmail,
    newLoginEmail: email,
  });
  const result = await db.update(clients).set({
    portalLoginEmail: email,
    portalAccountStatus: effect.status,
    ...(effect.keepPassword ? {} : { portalPasswordHash: null }),
    portalSetupTokenHash: setup.tokenHash,
    portalSetupExpiresAt: setup.expiresAt,
    ...(effect.bumpSessionVersion ? { portalSessionVersion: sql`${clients.portalSessionVersion} + 1` } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(clients.id, client.id),
    // Only if nothing changed underneath since the read above.
    inArray(clients.portalAccountStatus, ["not_enabled", "setup_pending"]),
  ));
  if (Number(result?.[0]?.affectedRows ?? 0) !== 1) {
    return { skip: "Skipped: the client's portal changed while sending" as const };
  }
  return { firstName: client.firstName as string | null, setup };
}

const running = new Set<number>();
/**
 * Tenants with a start in progress. Starting is several queries long —
 * the whole client list is read before the campaign row exists — and two
 * overlapping starts (a double click, two tabs) would each make a
 * campaign and email everybody twice. Render runs one instance, so an
 * in-process lock covers it; the "already sending" check covers the rest.
 */
const starting = new Set<number>();

export async function withPortalInviteStartLock<T>(tenantId: number, fn: () => Promise<T>): Promise<T> {
  if (starting.has(tenantId)) throw new Error("An invitation send is already being started.");
  starting.add(tenantId);
  try {
    return await fn();
  } finally {
    starting.delete(tenantId);
  }
}

export function isPortalInviteRunning(campaignId: number): boolean {
  return running.has(campaignId);
}

/** Start (or resume) working through a campaign. Returns false if already running here. */
export function runPortalInviteCampaign(
  db: any,
  campaignId: number,
  tenantId: number,
  sendEmail: (args: { to: string; subject: string; html: string; replyTo?: string | null }) => Promise<boolean | { ok: boolean; id: string | null }>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): boolean {
  if (running.has(campaignId)) return false;
  running.add(campaignId);
  void (async () => {
    try {
      await processCampaign(db, campaignId, tenantId, sendEmail, wait);
    } catch (error) {
      console.error(`[PortalInvite] campaign ${campaignId} stopped:`, error);
    } finally {
      running.delete(campaignId);
    }
  })();
  return true;
}

async function processCampaign(
  db: any,
  campaignId: number,
  tenantId: number,
  sendEmail: (args: { to: string; subject: string; html: string; replyTo?: string | null }) => Promise<boolean | { ok: boolean; id: string | null }>,
  wait: (ms: number) => Promise<void>,
) {
  // Rows claimed by a run that died: not known whether they went.
  await db.update(emailCampaignSends).set({
    status: "failed",
    errorMessage: "Interrupted — not known whether this email was sent. Check with the client before sending again.",
  }).where(and(
    eq(emailCampaignSends.campaignId, campaignId),
    eq(emailCampaignSends.status, "pending"),
    isNotNull(emailCampaignSends.sentAt),
  ));

  const [tenant] = await db.select({ name: tenants.name, phone: tenants.phone, email: tenants.email })
    .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const salonName = tenant?.name ?? "Barkin' Beautiful";
  const baseUrl = getPortalBaseUrl();

  for (;;) {
    const [row] = await db.select({ id: emailCampaignSends.id, clientId: emailCampaignSends.clientId, email: emailCampaignSends.email })
      .from(emailCampaignSends)
      .where(and(
        eq(emailCampaignSends.campaignId, campaignId),
        eq(emailCampaignSends.status, "pending"),
        isNull(emailCampaignSends.sentAt),
      ))
      .orderBy(asc(emailCampaignSends.id))
      .limit(1);
    if (!row) break;

    const claim = await db.update(emailCampaignSends).set({ sentAt: new Date() })
      .where(and(eq(emailCampaignSends.id, row.id), eq(emailCampaignSends.status, "pending"), isNull(emailCampaignSends.sentAt)));
    if (Number(claim?.[0]?.affectedRows ?? 0) !== 1) continue;

    let status: "sent" | "failed" = "failed";
    let errorMessage: string | null = null;
    let resendMessageId: string | null = null;
    try {
      const issued = await issueSetupLinkForCampaign(db, row.clientId, tenantId, row.email);
      if ("skip" in issued) {
        errorMessage = issued.skip ?? "Skipped";
      } else {
        const pending = await loadPendingAgreements(db, tenantId, row.clientId);
        const email = portalInviteEmail({
          firstName: issued.firstName,
          salonName,
          salonPhone: tenant?.phone ?? null,
          setupUrl: `${baseUrl}/portal/setup/${issued.setup.token}`,
          expiresAt: issued.setup.expiresAt,
          agreementTitles: pending.map((a) => a.title),
        });
        // The live sender returns Resend's id with the result; older or
        // test senders return a bare boolean.
        const sentResult = await sendEmail({ to: row.email, subject: email.subject, html: email.html, replyTo: tenant?.email ?? null });
        const ok = typeof sentResult === "boolean" ? sentResult : sentResult.ok;
        resendMessageId = typeof sentResult === "boolean" ? null : sentResult.id;
        if (ok) status = "sent";
        else errorMessage = "The email service refused it. The client's setup link was created; send it from their client page.";
      }
    } catch (error) {
      errorMessage = `Failed: ${(error as Error).message}`;
    }

    // resendMessageId lets Resend's opened/clicked events find this row.
    await db.update(emailCampaignSends).set({ status, errorMessage, ...(resendMessageId ? { resendMessageId } : {}) })
      .where(eq(emailCampaignSends.id, row.id));
    if (status === "sent") {
      await db.update(emailCampaigns).set({ totalSent: sql`COALESCE(${emailCampaigns.totalSent}, 0) + 1` })
        .where(eq(emailCampaigns.id, campaignId));
    }
    await wait(SEND_SPACING_MS);
  }

  await db.update(emailCampaigns).set({ status: "sent", sentAt: new Date() })
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.status, "sending")));
}

/** Progress for the page to poll. */
export async function portalInviteProgress(db: any, campaignId: number, tenantId: number) {
  const [campaign] = await db.select({
    id: emailCampaigns.id, status: emailCampaigns.status, totalRecipients: emailCampaigns.totalRecipients,
    createdAt: emailCampaigns.createdAt, sentAt: emailCampaigns.sentAt,
  })
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.tenantId, tenantId)))
    .limit(1);
  if (!campaign) return null;
  const counts: { status: string; n: number }[] = await db.select({ status: emailCampaignSends.status, n: sql<number>`COUNT(*)`.as("n") })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId))
    .groupBy(emailCampaignSends.status);
  const count = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
  const failures: { clientId: number; email: string; errorMessage: string | null }[] = await db.select({
    clientId: emailCampaignSends.clientId, email: emailCampaignSends.email, errorMessage: emailCampaignSends.errorMessage,
  })
    .from(emailCampaignSends)
    .where(and(eq(emailCampaignSends.campaignId, campaignId), eq(emailCampaignSends.status, "failed")))
    .limit(50);
  return {
    ...campaign,
    sent: count("sent"),
    failed: count("failed"),
    pending: count("pending"),
    running: running.has(campaignId),
    failures,
  };
}
