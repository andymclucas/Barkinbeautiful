/**
 * Sending a notification to a phone that has Groomigo closed.
 *
 * The browser's Notification API only fires from a page that is running,
 * so everything before this could do was pop an alert over a tab that was
 * already open. This is the other half: the push services at Google,
 * Apple and Mozilla hold the message and wake the device.
 *
 * Deliberately warns rather than throws when VAPID is unconfigured. A
 * missing key must not take the salon offline at boot, and a preview
 * environment with no keys should run normally and simply not push — the
 * same reasoning as getAppBaseUrl in appUrl.ts.
 */
import crypto from "node:crypto";
import webpush, { WebPushError } from "web-push";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { pushSubscriptions } from "../drizzle/schema";
import {
  type PushPayload, PUSH_TTL_SECONDS, PUSH_URGENCY, isDeadSubscription,
} from "../shared/pushNotification";

export type PushResult = {
  sent: number;
  /** Rows deleted because the push service said the endpoint is gone. */
  pruned: number;
  /** Transient failures. The rows are kept. */
  failed: number;
  /** Set when VAPID is not configured, so callers can say so usefully. */
  skipped?: "not_configured" | "no_subscriptions";
};

let configured: boolean | null = null;

/**
 * Configure VAPID once, on first use rather than at import.
 *
 * At import time this module is pulled in by the router barrel before
 * dotenv has necessarily run, and a key read then would be undefined
 * forever.
 */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  // A mailto: or https: subject is required by the spec — it is how a
  // push service contacts the sender about a misbehaving application.
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:info@barkinbeautiful.com.au";

  if (!publicKey || !privateKey) {
    console.error(
      "[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — staff will get no "
      + "notifications while Groomigo is closed. In-page alerts still work.",
    );
    configured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    console.log("[push] Web Push configured, subject", subject);
    configured = true;
  } catch (error) {
    // A malformed key is a configuration error, not a reason to crash.
    console.error(
      "[push] VAPID keys were rejected, push disabled:",
      error instanceof Error ? error.message : error,
    );
    // Say what ARRIVED, not just what was expected. web-push reports the
    // required length and nothing about the value it got, which turns a
    // bad paste into guesswork — a key pasted with its own name in front,
    // truncated by a double-click, or dropped into the wrong box all
    // produce the same sentence. Lengths only: a key must never be
    // logged, and the length is enough to identify every one of those.
    console.error(`[push] received ${describeKey("public", publicKey, 65)}, ${describeKey("private", privateKey, 32)}`);
    if (decodedBytes(publicKey) === 32 && decodedBytes(privateKey) === 65) {
      console.error("[push] those are the right lengths in the wrong boxes — the two values are swapped.");
    } else if (publicKey.includes("=") || privateKey.includes("=")) {
      console.error("[push] a value contains '=', which usually means the VAPID_... name was pasted along with it.");
    }
    configured = false;
  }
  return configured;
}

/** Decoded byte length, or -1 if the value is not valid base64url. */
function decodedBytes(key: string): number {
  try {
    return Buffer.from(key, "base64url").length;
  } catch {
    return -1;
  }
}

/**
 * A key's shape, for a log line. Never the key itself — these are
 * credentials, and a private key in a Render log is a private key on
 * every screen that log reaches.
 */
function describeKey(name: string, key: string, expectedBytes: number): string {
  const bytes = decodedBytes(key);
  const ok = bytes === expectedBytes;
  return `${name} ${key.length} chars / ${bytes} bytes${ok ? " (ok)" : ` (expected ${expectedBytes} bytes)`}`;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

/**
 * The public key the browser needs to subscribe.
 *
 * Served to the client at runtime rather than baked in with a VITE_
 * prefix, so rotating the keypair does not need a rebuild — and so the
 * private key has no path into the client bundle at all.
 */
export function getVapidPublicKey(): string | null {
  if (!ensureConfigured()) return null;
  return process.env.VAPID_PUBLIC_KEY?.trim() ?? null;
}

/** The uniqueness key for a subscription. See the 0080 migration. */
export function endpointHash(endpoint: string): string {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

type SubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function deliver(row: SubscriptionRow, payload: PushPayload, result: PushResult) {
  const db = await getDb();
  if (!db) return;

  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload),
      {
        // Expire a ringing-call push with the ring. A phone coming back
        // into signal otherwise gets "someone is calling" long after they
        // hung up, and somebody answers a dead line.
        TTL: PUSH_TTL_SECONDS[payload.kind],
        urgency: PUSH_URGENCY[payload.kind],
      },
    );
    result.sent += 1;
    await db.update(pushSubscriptions)
      .set({ lastSuccessAt: new Date(), failureCount: 0 })
      .where(eq(pushSubscriptions.id, row.id));
    return;
  } catch (error) {
    const status = error instanceof WebPushError ? error.statusCode : undefined;

    if (isDeadSubscription(status)) {
      // Gone for good: uninstalled, cleared, or expired. Keeping it means
      // retrying it forever and drowning out the real failures.
      result.pruned += 1;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
      return;
    }

    // Everything else is transient and the row is KEPT. Treating a 500 at
    // Google as "gone" would unsubscribe the whole salon over one bad
    // afternoon, silently.
    result.failed += 1;
    console.error(`[push] send failed (status ${status ?? "unknown"}) for subscription ${row.id}`);
    await db.update(pushSubscriptions)
      .set({ lastFailureAt: new Date(), failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(eq(pushSubscriptions.id, row.id));
  }
}

/**
 * Push to every device in the salon.
 *
 * Matches who already receives these events over SSE — /api/events
 * authenticates the request and then sends everything to everyone — so
 * this is no wider an audience than before, just reachable with the app
 * shut. A missed call or a ringing phone is salon-floor information.
 */
export async function sendPushToTenant(tenantId: number, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, pruned: 0, failed: 0 };
  if (!ensureConfigured()) return { ...result, skipped: "not_configured" };

  const db = await getDb();
  if (!db) return { ...result, skipped: "not_configured" };

  const rows = await db.select({
    id: pushSubscriptions.id,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
  }).from(pushSubscriptions).where(eq(pushSubscriptions.tenantId, tenantId));

  if (rows.length === 0) return { ...result, skipped: "no_subscriptions" };

  // In parallel, and never rejecting: one dead phone must not stop the
  // other five being told the phone is ringing.
  await Promise.all(rows.map((row) => deliver(row, payload, result)));
  return result;
}

/** Push to one person's own devices. Used by the "send a test" button. */
export async function sendPushToUser(tenantId: number, userId: number, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, pruned: 0, failed: 0 };
  if (!ensureConfigured()) return { ...result, skipped: "not_configured" };

  const db = await getDb();
  if (!db) return { ...result, skipped: "not_configured" };

  const rows = await db.select({
    id: pushSubscriptions.id,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
  }).from(pushSubscriptions).where(and(
    eq(pushSubscriptions.tenantId, tenantId),
    eq(pushSubscriptions.userId, userId),
  ));

  if (rows.length === 0) return { ...result, skipped: "no_subscriptions" };

  await Promise.all(rows.map((row) => deliver(row, payload, result)));
  return result;
}
