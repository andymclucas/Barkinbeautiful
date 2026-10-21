/**
 * What the client is told after booking online, in all three places.
 *
 * Three channels carry the same facts — the page, an email and a text —
 * and the price disclaimer has to be identical in each. Andy's
 * requirement on 21/10/2026 was that the estimate never appears without
 * it; three separate copies of a sentence is how that promise rots, so
 * there is one module and the channels differ only in length.
 *
 * The other thing these must get right: **an online booking is not
 * confirmed.** It lands at `status: "pending"` and a staff member
 * confirms it. `buildAppointmentConfirmationSms` already exists and says
 * "is confirmed" — sending that here would tell a stranger their slot is
 * held when it is not, and the salon would be honouring bookings it
 * never agreed to. Hence separate builders rather than reusing it.
 */

import { ESTIMATE_DISCLAIMER, ESTIMATE_DISCLAIMER_SHORT } from "./onlineBookingPrice";

export type OnlineBookingConfirmationInput = {
  clientFirstName: string;
  petName: string;
  /** "Tuesday 28 October", already formatted in Brisbane time. */
  date: string;
  /** "9:30am", already formatted in Brisbane time. */
  time: string;
  serviceLabel: string;
  /** The estimate as dollars, e.g. "95.00". Null when the catalogue had no row. */
  estimatePrice: string | null;
  salonName?: string;
  salonPhone?: string | null;
};

const DEFAULT_SALON = "Barkin' Beautiful";

/** "$95.00", or null when there is nothing honest to show. */
export function formatEstimate(price: string | null | undefined): string | null {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${n.toFixed(2)}`;
}

/**
 * The text message.
 *
 * Deliberately short — Twilio bills per 160 characters and this goes to
 * every online booking. It still carries the short disclaimer, because
 * a figure with no caveat is a quote.
 */
export function buildOnlineBookingRequestSms(input: OnlineBookingConfirmationInput): string {
  const salon = input.salonName ?? DEFAULT_SALON;
  const estimate = formatEstimate(input.estimatePrice);
  return [
    `Hi ${input.clientFirstName}, thanks for booking ${input.petName} in at ${salon}.`,
    `We have you down for ${input.date} at ${input.time} (${input.serviceLabel}).`,
    // "We'll confirm", not "confirmed". Nothing is held yet.
    "We'll be in touch to confirm.",
    estimate ? `Estimate ${estimate}. ${ESTIMATE_DISCLAIMER_SHORT}` : null,
  ].filter(Boolean).join(" ");
}

/** The subject line. Says "request", for the same reason the SMS does. */
export function buildOnlineBookingRequestEmailSubject(input: OnlineBookingConfirmationInput): string {
  return `We've got your booking request for ${input.petName}`;
}

/**
 * The email body, as plain text.
 *
 * Plain text rather than HTML: this is a short factual receipt, and the
 * one piece of styling that would matter — making the disclaimer hard to
 * miss — is better served by putting it on its own line than by a
 * stylesheet some clients will strip.
 */
export function buildOnlineBookingRequestEmailBody(input: OnlineBookingConfirmationInput): string {
  const salon = input.salonName ?? DEFAULT_SALON;
  const estimate = formatEstimate(input.estimatePrice);
  const lines = [
    `Hi ${input.clientFirstName},`,
    "",
    `Thanks for booking ${input.petName} in with ${salon}. Here's what we have:`,
    "",
    `  Dog:      ${input.petName}`,
    `  Service:  ${input.serviceLabel}`,
    `  When:     ${input.date} at ${input.time}`,
  ];
  if (estimate) lines.push(`  Estimate: ${estimate}`);
  lines.push(
    "",
    // The honest status, stated before anything else they might act on.
    "This is a request, not a confirmed booking yet — we'll check it against",
    "the diary and come back to you to confirm.",
  );
  if (estimate) {
    lines.push("", ESTIMATE_DISCLAIMER);
  }
  if (input.salonPhone) {
    lines.push("", `If anything above is wrong, call us on ${input.salonPhone}.`);
  }
  lines.push("", `— ${salon}`);
  return lines.join("\n");
}
