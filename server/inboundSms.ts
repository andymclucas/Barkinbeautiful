export type InboundReplyIntent = "confirm" | "cancel" | "unknown";

/**
 * Only exact, unambiguous keywords are actioned automatically. Free-form replies
 * remain in the message history for a staff member to review.
 */
export function classifyInboundReply(body: string): InboundReplyIntent {
  const normalised = body.trim().replace(/[.!?,]/g, "").toUpperCase();
  if (["Y", "YES", "CONFIRM", "CONFIRMED"].includes(normalised)) return "confirm";
  if (["N", "NO", "CANCEL", "CANCELLED"].includes(normalised)) return "cancel";
  return "unknown";
}

/**
 * Did this reply ask us to stop texting?
 *
 * Twilio blocks STOP at carrier level, but the app never learns of it —
 * those sends just come back as unexplained failures, and the client
 * stays in every future audience. Recognising it here is what lets us
 * exclude them, which is also the Spam Act obligation.
 *
 * The keywords are the standard set carriers honour. Deliberately exact:
 * "stop sending me the 7am one" is a conversation, not an opt-out, and
 * should reach a human.
 */
const OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL ALL", "END", "QUIT", "OPTOUT", "OPT OUT"];

export function isSmsOptOutReply(body: string | null | undefined): boolean {
  const normalised = (body ?? "").trim().replace(/[.!?,]/g, "").toUpperCase();
  return OPT_OUT_KEYWORDS.includes(normalised);
}

/** "START"/"UNSTOP" puts them back on. Carriers honour these too. */
const OPT_IN_KEYWORDS = ["START", "UNSTOP", "YES PLEASE", "SUBSCRIBE", "OPTIN", "OPT IN"];

export function isSmsOptInReply(body: string | null | undefined): boolean {
  const normalised = (body ?? "").trim().replace(/[.!?,]/g, "").toUpperCase();
  return OPT_IN_KEYWORDS.includes(normalised);
}

export function normaliseAustralianMobile(phone: string): string {
  const compact = phone.replace(/[\s()-]/g, "");
  if (compact.startsWith("04")) return `+61${compact.slice(1)}`;
  if (compact.startsWith("61")) return `+${compact}`;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

export function phoneMatchesInboundNumber(storedPhone: string | null, inboundPhone: string): boolean {
  if (!storedPhone) return false;
  return normaliseAustralianMobile(storedPhone) === normaliseAustralianMobile(inboundPhone);
}
