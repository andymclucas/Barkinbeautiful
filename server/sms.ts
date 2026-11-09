import { REPLY_PROMPT } from "@shared/replyPrompt";
import { automatedSmsAllowed, automatedSmsPermitted, describeBlockedSms, type AutomatedSmsType } from "@shared/automatedSms";
import { describePets } from "@shared/pickupGroup";
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
  /**
   * Every caller says which kind of message this is.
   *
   * Andy, 28/10/2026: "No automated text messages to go to clients
   * other than when dogs are fully groomed and ready to be picked
   * up." Plus the missed-call auto-reply, which he asked to keep on
   * the same day. Enforced HERE rather than at each send site, because
   * there are a dozen of those and the next one has not been written
   * yet.
   *
   * `trigger: "staff"` is a person choosing to text a client, which
   * this rule does not touch. `trigger: "automated"` must name its
   * type, and is sent only if shared/automatedSms.ts allows it.
   *
   * Required, not optional. An optional flag is one a new caller
   * forgets, and forgetting here means texting a real client.
   */
  options: { tenantId?: number } & (
    | { trigger: "staff" }
    | { trigger: "automated"; type: AutomatedSmsType }
  ),
): Promise<{ success: boolean; sid?: string; error?: string; blocked?: true }> {
  if (options.trigger === "automated" && !automatedSmsAllowed(options.type)) {
    // Logged rather than thrown: a blocked message must not break the
    // check-in, the cron run or the booking that triggered it. Callers
    // already handle an unsuccessful send, so they need no new branch.
    //
    // `blocked` distinguishes "never attempted" from "Twilio refused it",
    // because the four callers that mirror a send into sms_logs must NOT
    // write a row for this one. That table IS the Messages thread, so a
    // failed row for a message nobody tried to send would put a phantom
    // text in a conversation staff read all day, and would read as
    // though Twilio were broken. The confirmation path alone reached it
    // four times in two days.
    console.info(`[sms] not sent — ${describeBlockedSms(options.type)}`);
    return { success: false, blocked: true, error: "blocked_by_policy" };
  }

  /**
   * Automation is additionally gated on the environment, so a developer
   * running against the production database cannot text the salon's
   * clients. Four of the six automated paths already checked this for
   * themselves; the missed-call auto-reply and the waitlist "it's gone"
   * text did NOT, and between them they sent 118 real messages in the
   * last 30 days. Checking it here covers all six and any future one.
   *
   * Production has it set, so this changes nothing live. Staff-sent
   * messages are not gated: somebody pressing send has decided.
   */
  if (options.trigger === "automated" && !automatedSmsPermitted(options.type, process.env)) {
    console.info(`[sms] not sent — SMS_AUTOMATION_ENABLED is not "true", so no automated ${options.type} goes out`);
    return { success: false, blocked: true, error: "automation_disabled" };
  }

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

/**
 * One booking, one text, however many dogs are on it.
 *
 * `petNames`, not `petName`: this looped over appointment ROWS and
 * Groomigo stores one per dog, so a client with three dogs booked at
 * 12:30 got three texts each naming one of them. Andy's rule for the
 * pickup message covers this exactly — "Do not ever send 2 or 3" — and
 * the pickup text and the booking confirmation both already obeyed it.
 * This was the last of the three that did not.
 *
 * ## It no longer names the groomer
 *
 * Lauren, 09/11/2026, reading these texts in Messages: "Can we also
 * please remove the groomers name - thanks."
 *
 * The name on a booking is who is PENCILLED in, and the floor moves —
 * a dog gets handed to whoever is free, somebody is off sick, a bather
 * takes the brush-out. A client told "with Charlie Purcell" who is seen
 * by Megan has been told something that turned out not to be true, and
 * the salon gains nothing by saying it. The MoeGo imports make it worse
 * again: they carry full names the client has never heard — "Akilah
 * McDonell-Taylor" — where the salon says Akilah.
 *
 * `buildBookingConfirmationSms` and `buildRescheduleSms` dropped it in
 * the same change, so the whole family of appointment texts reads the
 * same way.
 */
export function buildAppointmentReminderSms(opts: {
  clientFirstName: string;
  petNames: readonly string[];
  date: string;
  time: string;
  salonName?: string;
  /**
   * "day_before" is the LAST reminder, and there is no morning-of one.
   *
   * Andy, 09/11/2026: "last reminder text for all appts (regardless of
   * time) is sent at 9am the day before. Nothing gets sent on the day
   * of."
   *
   * The morning-of stage went at 06:30 and stopped making sense the
   * moment every automated text moved to nine — a dog booked at 7:30 is
   * on the table by then, and the salon's biggest single slot is 9:00,
   * which a 9am text would have reached with no notice at all.
   */
  stage?: "4d" | "2d" | "day_before";
  /**
   * True once this client has already replied Y about this booking.
   *
   * Andy, 09/11/2026: "once the client responds with Y, then just a
   * reminder only goes out. Does not need another confirmation." So the
   * Y/N prompt comes off and the text becomes what it says it is.
   *
   * N is dropped with it, deliberately. Leaving "Reply N to cancel" on
   * its own would be a half-question that nothing in the thread sets
   * up, and a client who needs to cancel after confirming rings the
   * salon — which is the conversation that should happen anyway, since
   * by then the slot is being held for them.
   */
  alreadyConfirmed?: boolean;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  // Same helper the pickup text and the confirmation use, so a client
  // who gets both reads their dogs named the same way in each.
  const { subject, verb } = describePets(opts.petNames);
  // Always "'s". A trailing apostrophe is for a plural noun ending in s,
  // not a list of names: "Albert and Eddy's", never "Albert and Eddy'".
  const possessive = `${subject}'s`;
  /* Built as a SUFFIX rather than interpolating REPLY_PROMPT directly,
     so dropping it takes its leading space with it. Interpolating ""
     leaves "12:30 pm. " — a trailing space on a real text message. */
  const ask = opts.alreadyConfirmed ? "" : ` ${REPLY_PROMPT}`;
  if (opts.stage === "4d") {
    return `Hi ${opts.clientFirstName}! ${subject} ${verb === "are" ? "have" : "has"} a grooming appointment at ${salon} on ${opts.date} at ${opts.time}.${ask}`;
  }
  if (opts.stage === "2d") {
    return `Hi ${opts.clientFirstName}! ${possessive} grooming appointment at ${salon} is in 2 days, ${opts.date} at ${opts.time}.${ask}`;
  }
  if (opts.stage === "day_before") {
    /* "Good morning" because it goes at nine, "tomorrow" because that
       is now the only day a last reminder is ever sent. The date is
       left out deliberately: "tomorrow at 7:30 am" is what somebody
       acts on, and repeating the date beside it reads as a second
       appointment. */
    return `Good morning ${opts.clientFirstName}! ${subject} ${verb === "are" ? "have" : "has"} a grooming appointment tomorrow at ${opts.time} at ${salon}.${ask}`;
  }
  return `Hi ${opts.clientFirstName}! ${subject} ${verb === "are" ? "have" : "has"} a grooming appointment at ${salon} on ${opts.date} at ${opts.time}.${ask}`;
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

/**
 * The ready-for-pickup text.
 *
 * Takes every dog being collected, not one. Lauren, 13/10/2026: "it's a
 * double dog family so best to have both dogs names and just text once."
 * The verb agrees — "Coco and Bella ARE all done" — because "is" there
 * reads as a machine wrote it, and this goes to a paying customer.
 */
export function buildReadyForPickupSms(opts: {
  clientFirstName: string;
  /** One name, or every dog on the booking. */
  petNames: string[];
  salonName?: string;
}) {
  const salon = opts.salonName ?? "Barkin' Beautiful";
  const { subject, verb } = describePets(opts.petNames);
  return `Hi ${opts.clientFirstName}! ${subject} ${verb} all done and looking fabulous at ${salon}. Come pick them up whenever you're ready! 🐾✨`;
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
