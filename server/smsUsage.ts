/**
 * Counting a salon's outbound texts for the month.
 *
 * Derived from sms_logs rather than kept as a counter, deliberately — the
 * same reasoning as the sidebar badge. A stored counter drifts the first
 * time a send fails halfway, or a row is deleted, or two processes
 * increment at once, and nobody notices until the number on an invoice
 * cannot be reconciled with the messages behind it.
 *
 * The month boundary is Brisbane's, not UTC's. See smsBillingPeriod.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { smsLogs, tenants } from "../drizzle/schema";
import {
  describeSmsUsage, smsQuotaFor, maySendSms, type SmsUsage, type SendDecision,
} from "../shared/smsMetering";
import { tenantHasFeature } from "../shared/planEntitlements";

/** First instant of the current Brisbane month, as a UTC Date. */
export function brisbaneMonthBounds(when: Date = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit",
  }).formatToParts(when);
  const year = Number(parts.find(p => p.type === "year")!.value);
  const month = Number(parts.find(p => p.type === "month")!.value);
  // Brisbane is UTC+10 year round — no daylight saving — so midnight
  // local is 14:00 UTC the previous day.
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - 10 * 3600_000);
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0) - 10 * 3600_000);
  return { start, end };
}

export async function countOutboundThisMonth(tenantId: number, when: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { start, end } = brisbaneMonthBounds(when);
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(smsLogs).where(and(
    eq(smsLogs.tenantId, tenantId),
    eq(smsLogs.direction, "outbound"),
    gte(smsLogs.sentAt, start),
    lt(smsLogs.sentAt, end),
  ));
  return Number(row?.n ?? 0);
}

type TenantRow = { subscriptionPlan: string | null; subscriptionStatus: string | null; billingExempt: boolean | null };

async function loadTenant(tenantId: number): Promise<TenantRow | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({
    subscriptionPlan: tenants.subscriptionPlan,
    subscriptionStatus: tenants.subscriptionStatus,
    billingExempt: tenants.billingExempt,
  }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return (row as TenantRow) ?? null;
}

/** What this salon has sent this month, and how it sits against its allowance. */
export async function getSmsUsage(tenantId: number, when: Date = new Date()): Promise<SmsUsage> {
  const tenant = await loadTenant(tenantId);
  const sent = await countOutboundThisMonth(tenantId, when);
  // A tenant we cannot read is not metered. Failing closed here would mean
  // a database hiccup silently stops a salon texting its clients.
  if (!tenant) return describeSmsUsage(sent, null);
  return describeSmsUsage(sent, smsQuotaFor(tenant));
}

/**
 * Should this message go?
 *
 * Soft by default: over the allowance still sends, and the overage is
 * billed. A hard cap would mean the platform choosing to stop a salon
 * telling a client their dog is ready — which is worse than a line on an
 * invoice. Anything unreadable also sends, for the same reason.
 */
export async function checkSmsAllowance(tenantId: number, when: Date = new Date()): Promise<SendDecision & { usage: SmsUsage }> {
  const tenant = await loadTenant(tenantId);
  const usage = await getSmsUsage(tenantId, when);
  if (!tenant) return { send: true, usage };

  const decision = maySendSms({
    usage,
    hasMessagingFeature: tenantHasFeature(tenant, "messaging"),
  });
  return { ...decision, usage };
}
