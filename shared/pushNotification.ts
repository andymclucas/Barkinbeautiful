/**
 * What to push to a staff member's phone, and how urgently.
 *
 * Distinct from `notificationDelivery`, which decides what an OPEN page
 * does. This decides what a CLOSED one gets. The two overlap on purpose:
 * when Groomigo is open in a background tab, a message produces both an
 * in-page popup and a push. They are given the **same tag**, so the
 * operating system replaces rather than stacks and you see one
 * notification instead of two.
 *
 * Pure so the rules can be tested without a push service, a browser or a
 * database. Getting them wrong is either silence on a phone in a pocket
 * or a notification storm, and neither shows up in a type check.
 */

import { notificationBody } from "./notificationDelivery";

export type PushEventInput = {
  type?: string;
  id?: number;
  clientId?: number | null;
  clientName?: string | null;
  fromNumber?: string;
  body?: string;
  transcriptText?: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url: string;
  /** Same tag replaces rather than stacks. */
  tag: string;
  /** Which event produced this, for the service worker's own logging. */
  kind: "call-ringing" | "missed-call" | "new-message";
  /**
   * Re-alert for a notification that replaces one with the same tag.
   * A second message in a thread you have not looked at should buzz
   * again; silently rewriting the text of a notification already sitting
   * on the lock screen is indistinguishable from nothing happening.
   */
  renotify: boolean;
  /** Keep it on screen until dismissed. Only a live call earns this. */
  requireInteraction: boolean;
};

/**
 * How long the push service should keep trying, in seconds.
 *
 * This is the one that matters most for calls. A phone that was out of
 * signal gets its backlog delivered the moment it reconnects, so without
 * a TTL "Simone is calling" can arrive twenty minutes after Simone gave
 * up — and someone picks up a dead line. A ringing push is worthless
 * once the phone has stopped ringing, so it is told to expire with it.
 *
 * A missed call or a message has no such expiry: it is still true an
 * hour later, and that is exactly when you want it.
 */
export const PUSH_TTL_SECONDS: Record<PushPayload["kind"], number> = {
  "call-ringing": 45,
  "missed-call": 60 * 60 * 24,
  "new-message": 60 * 60 * 24,
};

/**
 * Push urgency, which is what persuades a dozing phone to wake up.
 *
 * Only a live call justifies `high`: it costs battery and the push
 * services ration it. Everything else is `normal`, which still arrives
 * promptly on a phone that is awake.
 */
export const PUSH_URGENCY: Record<PushPayload["kind"], "high" | "normal"> = {
  "call-ringing": "high",
  "missed-call": "normal",
  "new-message": "normal",
};

/** Who is on the other end, in the order we would rather say it. */
function describeCaller(event: PushEventInput): string {
  return event.clientName?.trim() || event.fromNumber || "Unknown number";
}

/**
 * Where tapping the notification should land.
 *
 * A known client goes to their record for a call — that is where their
 * pets and their history are, which is what you want in your hand while
 * the phone is still ringing. An unknown number goes to Messages, where
 * it can be answered or looked up.
 */
function messagesUrl(event: PushEventInput): string {
  if (event.clientId) return `/messages?clientId=${event.clientId}`;
  if (event.fromNumber) return `/messages?toNumber=${encodeURIComponent(event.fromNumber)}`;
  return "/messages";
}

export function pushForEvent(event: PushEventInput): PushPayload | null {
  const who = describeCaller(event);
  // Deliberately the same shape as notificationDelivery's tags, so an
  // open tab's popup and this push collapse into one notification.
  const callTag = `call:${event.fromNumber ?? who}`;

  if (event.type === "call-ringing") {
    return {
      title: `${who} is calling`,
      // No number for a known client: their name is the useful part and
      // a notification body is truncated hard.
      body: event.clientName?.trim() ? (event.fromNumber ?? "Incoming call") : "Incoming call",
      url: event.clientId ? `/clients/${event.clientId}` : messagesUrl(event),
      // Shared with missed-call on purpose: if nobody answers, "Missed
      // call from Simone" REPLACES "Simone is calling" rather than
      // leaving both on the lock screen saying different things.
      tag: callTag,
      kind: "call-ringing",
      // One ring, one buzz. A re-alert here would mean the phone going
      // off again for the same call.
      renotify: false,
      // A call is happening now and is the one thing worth holding the
      // screen for.
      requireInteraction: true,
    };
  }

  if (event.type === "missed-call") {
    const transcript = event.transcriptText?.trim();
    return {
      title: `Missed call from ${who}`,
      body: transcript ? notificationBody(transcript) : "No voicemail left.",
      url: event.clientId ? `/clients/${event.clientId}` : messagesUrl(event),
      tag: callTag,
      kind: "missed-call",
      // This replaces the ringing notification, and the replacement is
      // real news: they hung up. Worth a second buzz.
      renotify: true,
      requireInteraction: false,
    };
  }

  if (event.type === "new-message") {
    return {
      title: `Message from ${who}`,
      body: notificationBody(event.body ?? ""),
      url: messagesUrl(event),
      tag: `sms:${event.fromNumber ?? who}`,
      kind: "new-message",
      renotify: true,
      requireInteraction: false,
    };
  }

  // call-ended, and anything added later, push nothing. Ending a call is
  // not news to someone whose phone is in their pocket, and a push per
  // call leg would double the traffic for no one's benefit.
  return null;
}

/**
 * Whether a failed send means that subscription is dead for good.
 *
 * 404 and 410 are the push service saying this endpoint no longer
 * exists — the app was uninstalled, the browser data cleared, or the
 * subscription expired. Those must be deleted or every future send
 * retries them forever and the failures drown out the real ones.
 *
 * Everything else — a timeout, a 429, a 500 at Apple or Google — is
 * transient and the row must be KEPT, or one bad afternoon at a push
 * service unsubscribes the whole salon.
 */
export function isDeadSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Turn the base64url VAPID public key into the bytes `pushManager.subscribe`
 * wants.
 *
 * Fiddly and worth testing: the key is base64**url** (`-` and `_` rather
 * than `+` and `/`) and arrives unpadded, while atob needs standard
 * base64 with padding. Get it wrong and subscribe() either throws
 * "InvalidCharacterError" or, worse, succeeds against a key the server
 * cannot sign for — which looks exactly like a phone that just never
 * gets notifications.
 */
export function vapidKeyToBytes(base64Url: string, decode: (s: string) => string): Uint8Array {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");
  const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = decode(standard);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushCapability =
  /** Everything is in place; this device can be subscribed. */
  | { usable: true }
  /** An iPhone or iPad in an ordinary Safari tab. Fixable by the user. */
  | { usable: false; reason: "ios_needs_install" }
  /** No service worker or no PushManager. Nothing the user can do. */
  | { usable: false; reason: "unsupported" }
  /** The browser has blocked notifications for this site. */
  | { usable: false; reason: "permission_denied" }
  /** The server has no VAPID keys, so there is nothing to subscribe to. */
  | { usable: false; reason: "server_not_configured" };

/**
 * Whether this device can receive a push with the app closed.
 *
 * The iOS rule is the one that catches people and the reason this is a
 * function rather than a boolean. Safari on iPhone exposes no PushManager
 * at all in an ordinary tab: Web Push works only for a site added to the
 * Home Screen and opened from there, and only from iOS 16.4. Telling
 * someone "unsupported" when the real answer is "add it to your Home
 * Screen" is the difference between a fixable problem and a dead end.
 */
export function pushCapability(c: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  isIos: boolean;
  isStandalone: boolean;
  permission: "granted" | "denied" | "default";
  serverConfigured: boolean;
}): PushCapability {
  // Checked before support, because on iOS the missing PushManager IS the
  // "not installed" symptom and the honest advice is to install it.
  if (c.isIos && !c.isStandalone) return { usable: false, reason: "ios_needs_install" };
  if (!c.hasServiceWorker || !c.hasPushManager) return { usable: false, reason: "unsupported" };
  if (c.permission === "denied") return { usable: false, reason: "permission_denied" };
  // Last: a device that cannot push at all should hear that before it
  // hears about our configuration.
  if (!c.serverConfigured) return { usable: false, reason: "server_not_configured" };
  return { usable: true };
}
