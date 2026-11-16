/**
 * Reading a campaign's saved audience, whichever shape it arrives in.
 *
 * `email_campaigns.audience_filter` is declared as text holding JSON, and
 * every reader did `JSON.parse(campaign.audienceFilter)`. On 16/11/2026 the
 * live database was found to hand the column back ALREADY PARSED, as an
 * object. `JSON.parse` of an object throws, each reader swallowed that, and
 * each fell back to "all_active":
 *
 *   - the edit dialog showed "All Active Clients" for every saved campaign,
 *     and Save Changes wrote that back over the real audience;
 *   - the send confirmation would have named and counted the wrong people;
 *   - the send itself called `.includes` on the object and threw.
 *
 * So the first campaign saved for 32 people read as one for 684. One reader,
 * used by all of them, that takes a string or an object and says plainly
 * when it cannot tell — because for a send, "cannot tell" must stop the
 * send, not quietly widen it to everybody.
 */

export const DEFAULT_AUDIENCE_TYPE = "all_active";

export type AudienceRead =
  /** Nothing saved: the campaign was created without choosing one. */
  | { ok: true; type: string; source: "default" }
  | { ok: true; type: string; source: "saved" }
  /** Something is saved but it is not an audience we can read. */
  | { ok: false; reason: string };

export function readAudienceFilter(raw: unknown): AudienceRead {
  if (raw === null || raw === undefined) {
    return { ok: true, type: DEFAULT_AUDIENCE_TYPE, source: "default" };
  }

  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return { ok: true, type: DEFAULT_AUDIENCE_TYPE, source: "default" };
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "The saved audience is not valid JSON" };
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "The saved audience is not an object" };
  }
  const type = (value as { type?: unknown }).type;
  if (type === undefined || type === null) {
    // `{}` is what an untouched form saves: no choice made.
    return { ok: true, type: DEFAULT_AUDIENCE_TYPE, source: "default" };
  }
  if (typeof type !== "string" || type.trim() === "") {
    return { ok: false, reason: "The saved audience has no usable type" };
  }
  return { ok: true, type, source: "saved" };
}

/**
 * For SCREENS: the type to show. An unreadable audience shows as the default
 * rather than crashing the page; the send is where it is refused.
 */
export function audienceTypeForDisplay(raw: unknown): string {
  const read = readAudienceFilter(raw);
  return read.ok ? read.type : DEFAULT_AUDIENCE_TYPE;
}

/** True when the saved audience is exactly this type. Never throws. */
export function audienceFilterIs(raw: unknown, type: string): boolean {
  const read = readAudienceFilter(raw);
  return read.ok && read.source === "saved" && read.type === type;
}

/** The audiences campaigns.send knows how to select. */
export const SENDABLE_AUDIENCE_TYPES = [
  "all_active",
  "membership_holders",
  "inactive_8w",
  "inactive_12w",
  "all_clients",
  "portal_no_card",
] as const;

export type SendableAudienceType = (typeof SENDABLE_AUDIENCE_TYPES)[number];

/**
 * For the SEND: the audience type, or an error message. An unreadable or
 * unknown audience is refused. Before this, an unknown type fell through to
 * the last `else`, which is every client the salon has ever had.
 */
export function audienceTypeForSend(
  raw: unknown,
): { ok: true; type: SendableAudienceType } | { ok: false; message: string } {
  const read = readAudienceFilter(raw);
  if (!read.ok) {
    return { ok: false, message: `${read.reason}. Open the campaign, choose the audience again and save before sending.` };
  }
  if (!(SENDABLE_AUDIENCE_TYPES as readonly string[]).includes(read.type)) {
    return { ok: false, message: `This campaign's audience ("${read.type}") is not one that can be sent from here.` };
  }
  return { ok: true, type: read.type as SendableAudienceType };
}
