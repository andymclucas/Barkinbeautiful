/**
 * MoeGo's client tags, and which of them should stop somebody mid-booking.
 *
 * The salon tags 321 clients. Most are informational — VIP, Generous, "2
 * weeks client" — but a handful mean "do not take this booking": BANNED (28
 * clients), Refuse new bookings (31), DONT BOOK IN (19), MUST PRE-PAY (9),
 * Owes money. Those need to read differently from "VIP" or nobody will see
 * them in a row of grey chips.
 *
 * The blocking list is matched loosely on purpose. These are typed by hand
 * in MoeGo and the spelling wanders — "DOG AGRESSIVE" is the salon's own
 * spelling, with one G — so matching is on a normalised substring rather
 * than an exact set. Erring towards flagging is right here: a VIP shown in
 * red is a moment's confusion, a banned client booked in is a real problem.
 */

export type ClientTagTone = "blocking" | "caution" | "neutral";

const BLOCKING = [
  "banned", "dont book in", "don't book in", "refuse new booking",
  "no show on last visit", "owes money", "must pre-pay", "must prepay",
];

const CAUTION = [
  "agressive", "aggressive", "not dog friendly", "keep dogs separate",
  "lead chewer", "lead on in cage", "cancels alot", "complained about price",
  "high anxiety", "pita", "noisy",
];

const normalise = (tag: string) => tag.toLowerCase().replace(/\s+/g, " ").trim();

/** Split the stored string into individual tags, in their original order. */
export function parseClientTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const tag = part.trim();
    if (!tag || seen.has(normalise(tag))) continue;
    seen.add(normalise(tag));
    out.push(tag);
  }
  return out;
}

/** How loudly a tag should read. */
export function clientTagTone(tag: string): ClientTagTone {
  const n = normalise(tag);
  if (BLOCKING.some((b) => n.includes(b))) return "blocking";
  if (CAUTION.some((c) => n.includes(c))) return "caution";
  return "neutral";
}

/** The loudest tone across a client's tags, for a single summary flag. */
export function worstClientTagTone(raw: string | null | undefined): ClientTagTone | null {
  const tags = parseClientTags(raw);
  if (tags.length === 0) return null;
  const tones = tags.map(clientTagTone);
  if (tones.includes("blocking")) return "blocking";
  if (tones.includes("caution")) return "caution";
  return "neutral";
}
