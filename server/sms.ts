import twilio from "twilio";
import { getAppBaseUrl } from "./appUrl";
import { checkSmsAllowance } from "./smsUsage";
import { fromNumberForTenant } from "./tenantByNumber";
import { isUsableSenderNumber, NO_SENDER_MESSAGE } from "@shared/senderNumber";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  _client = twilio(sid, token);
  return _client;
}

/**
 * Send a text, and count it against the salon's monthly allowance.
 *
 * `tenantId` is optional only because seven existing callers predate
 * metering; every one of them should pass it. Without it the message is
 * sent and NOT counted, which is the safe failure — a text that escapes
 * the meter costs the platform a few cents, while a text refused because
 * the meter could not identify the salon leaves a dog waiting with an
 * owner who was never told.
 */
export async function sendSms(
  to: string,
  body: string,
  options: { tenantId?: number } = {},
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getClient();
  // Each salon texts from its own number, so a client replying reaches the
  // business that messaged them. Falls back to the shared TWILIO_FROM_NUMBER
  // for a salon with no number of its own, which is every salon today.
  const from = options.tenantId !== undefined
    ? await fromNumberForTenant(options.tenantId)
    : process.env.TWILIO_FROM_NUMBER ?? null;
  if (!client) {
    console.warn("[SMS] Twilio not configured — skipping SMS to", to);
    return { success: false, error: "Twilio not configured" };
  }
  // Checked before Twilio sees it. On 06/10/2026 this was the string
  // "+61..." — a placeholder typed into the salon's number field — and
  // every message for a day and a half came back "Invalid From Number
  // (caller ID)". Twilio's rejection is accurate but arrives per message
  // and says nothing about where the bad value came from.
  if (!isUsableSenderNumber(from)) {
    console.error(`[SMS] refusing to send: sender "${from ?? "(none)"}" is not a usable number. ${NO_SENDER_MESSAGE}`);
    return { success: false, error: NO_SENDER_MESSAGE };
  }

  // The allowance check is soft by default — see checkSmsAllowance. It
  // refuses only a plan with no messaging at all, or a salon that has
  // asked to be stopped at its cap.
  if (options.tenantId !== undefined) {
    try {
      const allowance = await checkSmsAllowance(options.tenantId);
      if (!allowance.send) {
        console.warn(`[SMS] blocked for tenant ${options.tenantId}: ${allowance.reason}`);
        return { success: false, error: allowance.reason };
      }
      if (allowance.usage.state === "approaching") {
        console.warn(`[SMS] tenant ${options.tenantId} has used ${allowance.usage.sent} of ${allowance.usage.quota} texts this month`);
      } else if (allowance.usage.state === "exceeded") {
        console.warn(`[SMS] tenant ${options.tenantId} is OVER its allowance — ${allowance.usage.sent} of ${allowance.usage.quota}. Sending anyway; this is billable overage.`);
      }
    } catch (error) {
      // Metering must never be the reason a message fails to go.
      console.error("[SMS] allowance check failed, sending anyway:", error);
    }
  }
  // Normalise Australian mobile numbers
  let toNorm = to.replace(/\s/g, "");
  if (toNorm.startsWith("04")) toNorm = "+61" + toNorm.slice(1);
  if (!toNorm.startsWith("+")) toNorm = "+" + toNorm;
  try {
    // The gate stays on the raw env var on purpose: when VITE_APP_URL is not
    // configured we send NO statusCallback at all, so an unconfigured dev
    // machine never asks Twilio to POST delivery receipts at production.
    // When it IS configured, build the URL via getAppBaseUrl() so a trailing
    // slash can't produce "//api/twilio/status", which Express would not match
    // — silently breaking delivery-status tracking.
    const statusCallback = process.env.VITE_APP_URL ? `${getAppBaseUrl()}/api/twilio/status` : undefined;
    const msg = await client.messages.create({ from, to: toNorm, body, ...(statusCallback ? { statusCallback } : {}) });
    return { success: true, sid: msg.sid };
  } catch (err: any) {
    console.error("[SMS] Failed to send to", toNorm, err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ── Template builders ──────────────────────────────────────────────────────────

export function buildAppointmentReminderSms(opts: {
  clientFirstName: string;
  petName: string;
  date: string;
  time: string;
  groomer: string;
  salonName?: string;
  stage?: "4d" | "2d" | "morning";
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  if (opts.stage === "4d") {
    return `Hi ${opts.clientFirstName}! Just a heads up \u2014 ${opts.petName} has a grooming appointment coming up at ${salon} on ${opts.date} at ${opts.time} with ${opts.groomer}. See you soon! 🐾`;
  }
  if (opts.stage === "2d") {
    return `Hi ${opts.clientFirstName}! Reminder: ${opts.petName}'s grooming appointment at ${salon} is in 2 days, on ${opts.date} at ${opts.time} with ${opts.groomer}. 🐾`;
  }
  if (opts.stage === "morning") {
    return `Good morning ${opts.clientFirstName}! Just a reminder that ${opts.petName} has a grooming appointment today at ${opts.time} with ${opts.groomer} at ${salon}. See you soon! 🐾`;
  }
  return `Hi ${opts.clientFirstName}! Just a reminder that ${opts.petName} has a grooming appointment at ${salon} on ${opts.date} at ${opts.time} with ${opts.groomer}. See you then! 🐾`;
}

export function buildAppointmentConfirmationSms(opts: {
  clientFirstName: string;
  petName: string;
  date: string;
  time: string;
  salonName?: string;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  return `Hi ${opts.clientFirstName}! Your booking for ${opts.petName} at ${salon} on ${opts.date} at ${opts.time} is confirmed. We can't wait to see them! 🐾`;
}

export function buildPetTrackerSms(opts: {
  clientFirstName: string;
  petName: string;
  trackerUrl: string;
  salonName?: string;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  return `Hi ${opts.clientFirstName}! ${opts.petName} has checked in at ${salon}. Follow their grooming progress here: ${opts.trackerUrl}`;
}

export function buildReadyForPickupSms(opts: {
  clientFirstName: string;
  petName: string;
  salonName?: string;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  return `Hi ${opts.clientFirstName}! ${opts.petName} is all done and looking fabulous at ${salon}. Come pick them up whenever you're ready! 🐾✨`;
}

export function buildMembershipPaymentFailedSms(opts: {
  clientFirstName: string;
  petName: string;
  amount: string;
  salonName?: string;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  return `Hi ${opts.clientFirstName}, we had trouble processing your ${salon} membership payment of ${opts.amount} for ${opts.petName}. Please update your payment details to keep your membership active. Call us if you need help!`;
}

export function buildGroomingReportReadySms(opts: {
  clientFirstName: string;
  petName: string;
  salonName?: string;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  return `Hi ${opts.clientFirstName}! ${opts.petName}'s grooming report from ${salon} is ready. Ask your groomer for a copy or check your email. 🐾`;
}

export function buildCustomSms(opts: {
  clientFirstName: string;
  petName?: string;
  message: string;
}) {
  return opts.message
    .replace(/\{name\}/g, opts.clientFirstName)
    .replace(/\{pet\}/g, opts.petName ?? "your pet");
}
