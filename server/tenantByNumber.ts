/**
 * Which salon a Twilio webhook is about.
 *
 * A webhook has no signed-in user and no hostname — it is Twilio's
 * server calling ours. The only thing identifying the salon is the number
 * that was texted or called, which Twilio sends as `To`.
 *
 * Until this existed every inbound webhook assumed tenant 1. A second
 * salon's client texting their own salon would have had their reply
 * matched against Barkin' Beautiful's client list and filed under the
 * wrong business.
 *
 * Cached like the hostname lookup, for the same reason: it runs on every
 * inbound message and call, and changes only when a salon's number does.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { normaliseAustralianMobile } from "./inboundSms";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { tenantId: number | null; at: number }>();

/**
 * The salon that owns this number, or null if none claims it.
 *
 * Null is NOT tenant 1. Callers decide what an unrecognised number means;
 * silently filing a stranger's message under the first salon is the bug
 * this removes.
 */
export async function tenantIdForCalledNumber(rawTo: string | null | undefined): Promise<number | null> {
  if (!rawTo) return null;
  const number = normaliseAustralianMobile(String(rawTo));
  if (!number) return null;

  const hit = cache.get(number);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tenantId;

  let tenantId: number | null = null;
  try {
    const db = await getDb();
    if (db) {
      // Stored numbers should already be E.164, but a hand-entered one
      // might not be, so compare on the normalised form of both.
      const rows = await db.select({ id: tenants.id, number: tenants.twilioNumber }).from(tenants);
      const match = rows.find(r => r.number && normaliseAustralianMobile(r.number) === number);
      tenantId = match?.id ?? null;
    }
  } catch (error) {
    // A lookup failure must not drop an inbound message. The caller falls
    // back to its existing behaviour.
    console.error("[twilio] tenant lookup failed for called number", error);
    return null;
  }

  cache.set(number, { tenantId, at: Date.now() });
  return tenantId;
}

/** The number a salon should text FROM, falling back to the shared one. */
export async function fromNumberForTenant(tenantId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (db) {
      const [row] = await db.select({ number: tenants.twilioNumber }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1);
      if (row?.number) return row.number;
    }
  } catch (error) {
    console.error("[twilio] from-number lookup failed for tenant", tenantId, error);
  }
  return process.env.TWILIO_FROM_NUMBER ?? null;
}

export function forgetNumberTenant(rawTo?: string | null) {
  if (rawTo) cache.delete(normaliseAustralianMobile(String(rawTo)));
  else cache.clear();
}

/** Resolve, or fall back to the only salon that could have been meant. */
export async function tenantIdForWebhook(rawTo: string | null | undefined): Promise<number> {
  const resolved = await tenantIdForCalledNumber(rawTo);
  if (resolved !== null) return resolved;
  // Unrecognised. Logged rather than silent, because once there is more
  // than one salon this is a message about to be filed under the wrong
  // business and somebody needs to see it.
  console.warn(`[twilio] inbound on an unrecognised number (${rawTo ?? "none sent"}) — falling back to tenant 1`);
  return 1;
}
