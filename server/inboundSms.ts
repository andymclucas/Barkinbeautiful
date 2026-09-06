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
