/**
 * How many texts a salon has sent this month, and what happens at the cap.
 *
 * SMS is the one cost that scales with somebody else's behaviour. At
 * Twilio's Australian rate a busy salon running every automated message
 * on every appointment sends over two thousand a month, which is more
 * than a hundred dollars of outbound cost on one subscription. Ten of
 * those and the platform is losing money quietly.
 *
 * MoeGo answers this by bundling a fixed allowance — 200 texts on their
 * entry plan, 900 on the next — and that is the model here.
 *
 * The month is a BRISBANE month. Billing periods that quietly roll over
 * at 10am local time because the server counted in UTC are the kind of
 * thing nobody notices until a salon disputes an invoice.
 */

import type { Feature } from "./planEntitlements";

/**
 * Monthly allowance by plan. Starter has no messaging at all, so its
 * allowance is zero and the feature gate refuses before this is reached.
 *
 * Deliberately easy to change: these are a commercial decision, not a
 * technical one, and whoever sets the price should be able to set these
 * without reading the rest of the file.
 */
export const SMS_QUOTA_BY_PLAN: Record<string, number> = {
  trial: 250,
  starter: 0,
  professional: 1000,
  enterprise: 2500,
};

/** Warn the salon before they hit it, not after. */
export const SMS_WARN_AT_PERCENT = 80;

export type SmsMeterState = "ok" | "approaching" | "exceeded" | "unlimited";

export type SmsUsage = {
  /** Outbound messages sent in the current Brisbane month. */
  sent: number;
  /** Null when the salon is not metered at all. */
  quota: number | null;
  remaining: number | null;
  percentUsed: number | null;
  state: SmsMeterState;
  /** What the month has cost beyond the allowance. */
  overage: SmsOverage;
};

export type SmsOverage = {
  /** Messages sent beyond the allowance. Zero when inside it. */
  messages: number;
  /** Dollars per extra message, or null when none has been set. */
  rate: number | null;
  /**
   * What those messages come to. NULL — not zero — when there is no rate,
   * because "we have not priced this yet" and "this is free" are
   * different things and a salon should never be shown the second when we
   * mean the first.
   */
  amount: number | null;
};

/**
 * The calendar month a message counts against, in Brisbane.
 *
 * A message sent at 9am on the 1st in Brisbane is 11pm on the last day of
 * the previous month in UTC. Counting in UTC would put it on the wrong
 * invoice, and the salon would be right to argue.
 */
export function smsBillingPeriod(when: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit",
  }).formatToParts(when);
  const year = parts.find(p => p.type === "year")!.value;
  const month = parts.find(p => p.type === "month")!.value;
  return `${year}-${month}`;
}

export type MeteredTenant = {
  subscriptionPlan?: string | null;
  billingExempt?: boolean | null;
};

/**
 * The allowance for this salon, or null for "not metered".
 *
 * An exempt salon is never metered. Barkin' Beautiful is not a customer
 * — counting their texts towards a quota they are not paying for would
 * be meaningless, and capping them would be worse.
 */
export function smsQuotaFor(tenant: MeteredTenant): number | null {
  if (tenant.billingExempt) return null;
  const plan = tenant.subscriptionPlan;
  if (typeof plan !== "string" || !(plan in SMS_QUOTA_BY_PLAN)) {
    // An unrecognised plan is not metered rather than metered at zero. A
    // typo in a column must never be why a salon cannot tell a client
    // their dog is ready.
    return null;
  }
  return SMS_QUOTA_BY_PLAN[plan];
}

/**
 * What a month beyond the allowance costs.
 *
 * Rounded to whole cents at the end rather than per message: at a rate
 * like 5.15c, rounding each of four hundred messages separately drifts
 * away from the figure anyone checking the arithmetic would get.
 */
export function calculateOverage(sent: number, quota: number | null, rate: number | null | undefined): SmsOverage {
  const over = quota === null ? 0 : Math.max(0, Math.floor(sent) - quota);
  const usableRate = typeof rate === "number" && Number.isFinite(rate) && rate >= 0 ? rate : null;
  return {
    messages: over,
    rate: usableRate,
    amount: usableRate === null ? null : Math.round(over * usableRate * 100) / 100,
  };
}

export function describeSmsUsage(sent: number, quota: number | null, overageRate?: number | null): SmsUsage {
  const used = Math.max(0, Math.floor(sent));
  if (quota === null) {
    return {
      sent: used, quota: null, remaining: null, percentUsed: null, state: "unlimited",
      overage: calculateOverage(used, null, overageRate),
    };
  }
  // The displayed figure rounds; the threshold must not. 799 of 1000 is
  // 79.9%, which rounds to 80 and would raise the warning a message early
  // — every month, on every salon, slightly wrong.
  const exactPercent = quota === 0 ? 100 : (used / quota) * 100;
  const percentUsed = Math.round(exactPercent);
  const state: SmsMeterState = used >= quota
    ? "exceeded"
    : exactPercent >= SMS_WARN_AT_PERCENT ? "approaching" : "ok";
  return {
    sent: used, quota, remaining: Math.max(0, quota - used), percentUsed, state,
    overage: calculateOverage(used, quota, overageRate),
  };
}

export type SendDecision = { send: true } | { send: false; reason: string };

/**
 * Whether to let this message go.
 *
 * The default is SOFT and that is deliberate. A hard cap means a salon
 * cannot tell a client their dog is ready to collect, which is a worse
 * experience than a line on an invoice — and it would be the platform
 * choosing to break a service the salon has already paid for that month.
 * Overage is billed; the message goes.
 *
 * `hardStop` exists for a salon that asks to be protected from its own
 * spending, and must be opted into rather than inherited.
 */
export function maySendSms(input: {
  usage: SmsUsage;
  hasMessagingFeature: boolean;
  hardStop?: boolean;
}): SendDecision {
  if (!input.hasMessagingFeature) {
    return { send: false, reason: "Client messaging is not included in this plan" };
  }
  if (input.usage.state === "unlimited") return { send: true };
  if (input.usage.state === "exceeded" && input.hardStop) {
    return {
      send: false,
      reason: `This month's ${input.usage.quota} message allowance has been used, and sending beyond it is switched off for this salon`,
    };
  }
  return { send: true };
}

/** The feature a metered message needs. Kept here so callers cannot drift. */
export const SMS_FEATURE: Feature = "messaging";
