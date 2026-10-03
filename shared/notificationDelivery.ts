/**
 * How to ping a staff member about something that just happened.
 *
 * There are two ways and they are not interchangeable. An operating
 * system popup is right when the salon screen is on another tab or
 * minimised; it is an interruption, and firing one over the page someone
 * is already reading is just noise with a dismiss button. In-app is right
 * when they are looking at us.
 *
 * Written as a pure function because the rules are fiddly, the inputs
 * come from four different browser APIs, and getting it wrong is either
 * silence or a popup storm — neither of which shows up in a type check.
 */

export type NotificationDelivery = "os" | "in_app" | "none";

export type DeliveryConditions = {
  /** `"Notification" in window`. False in a plain Safari tab on iOS. */
  supported: boolean;
  /** The browser's own answer: granted, denied or default. */
  permission: "granted" | "denied" | "default";
  /** The staff member's own switch, off by default. */
  enabled: boolean;
  /** document.hidden — another tab, another window, or minimised. */
  documentHidden: boolean;
};

export function chooseDelivery(c: DeliveryConditions): NotificationDelivery {
  // Switched off means switched off, including the in-app toast. Someone
  // who turned this off does not want a quieter version of it.
  if (!c.enabled) return "none";

  // An OS popup is only for when they are looking somewhere else.
  const wantsOsPopup = c.documentHidden;
  if (wantsOsPopup && c.supported && c.permission === "granted") return "os";

  // Everything else lands in the page. That covers the tab being in
  // front, permission not given, and iOS Safari — where the Notification
  // constructor does not exist at all unless the site has been added to
  // the Home Screen, so there is nothing to fall back to but the page
  // itself.
  return "in_app";
}

/**
 * Whether it is worth asking for permission.
 *
 * Asking again after a refusal cannot succeed — the browser answers
 * "denied" without showing anything — so the UI should say how to undo it
 * in browser settings rather than offer a button that does nothing.
 */
export function canAskForPermission(c: Pick<DeliveryConditions, "supported" | "permission">): boolean {
  return c.supported && c.permission === "default";
}

/** Short enough for a notification body, which browsers truncate hard. */
export function notificationBody(text: string, limit = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

export type StaffNotification = {
  title: string;
  body: string;
  /** Where clicking it should land. */
  url: string;
  /** Same tag replaces rather than stacks. */
  tag: string;
};

type AppEvent = {
  type?: string;
  id?: number;
  clientId?: number | null;
  clientName?: string | null;
  fromNumber?: string;
  body?: string;
  transcriptText?: string | null;
};

/**
 * What to say about an event that just came down the wire.
 *
 * Returns null for events that should not interrupt anyone. A ringing
 * call is the obvious one: it already has its own alert with a chime,
 * and by the time an operating system popup has drawn itself someone has
 * usually picked up — so it would mostly be a notification about a call
 * that is already over.
 *
 * The tag is per conversation, not per message. Twenty texts from one
 * client while the salon screen is locked should leave one notification
 * saying the latest, not twenty to dismiss.
 */
export function notificationForEvent(event: AppEvent): StaffNotification | null {
  const who = event.clientName?.trim() || event.fromNumber || "Unknown number";
  const target = event.clientId
    ? `/messages?clientId=${event.clientId}`
    : event.fromNumber
      ? `/messages?toNumber=${encodeURIComponent(event.fromNumber)}`
      : "/messages";

  if (event.type === "new-message") {
    return {
      title: `Message from ${who}`,
      body: notificationBody(event.body ?? ""),
      url: target,
      tag: `sms:${event.fromNumber ?? who}`,
    };
  }

  if (event.type === "missed-call") {
    const transcript = event.transcriptText?.trim();
    return {
      title: `Missed call from ${who}`,
      // No voicemail is itself worth saying; an empty body renders as a
      // notification with a title and a blank line under it.
      body: transcript ? notificationBody(transcript) : "No voicemail left.",
      url: event.clientId ? `/clients/${event.clientId}` : target,
      tag: `call:${event.fromNumber ?? who}`,
    };
  }

  return null;
}

/**
 * What number to put on the Home Screen icon.
 *
 * Returns null to mean "clear it" rather than zero, because the Badging
 * API draws a dot for setAppBadge(0) on some platforms instead of
 * removing the badge — so passing the count straight through leaves a
 * mark on the icon when there is nothing to see.
 *
 * Anything unreadable clears rather than throws. A badge is decoration;
 * it must never be the reason a page falls over.
 */
export const MAX_BADGE_COUNT = 99;

export function badgeCountFor(unread: unknown): number | null {
  const n = typeof unread === "number" ? unread : Number(unread);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), MAX_BADGE_COUNT);
}
