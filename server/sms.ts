import twilio from "twilio";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  _client = twilio(sid, token);
  return _client;
}

export async function sendSms(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getClient();
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!client || !from) {
    console.warn("[SMS] Twilio not configured — skipping SMS to", to);
    return { success: false, error: "Twilio not configured" };
  }
  // Normalise Australian mobile numbers
  let toNorm = to.replace(/\s/g, "");
  if (toNorm.startsWith("04")) toNorm = "+61" + toNorm.slice(1);
  if (!toNorm.startsWith("+")) toNorm = "+" + toNorm;
  try {
    const statusCallback = process.env.VITE_APP_URL ? `${process.env.VITE_APP_URL}/api/twilio/status` : undefined;
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
