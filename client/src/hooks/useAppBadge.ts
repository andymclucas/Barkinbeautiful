import { useEffect } from "react";
import { badgeCountFor } from "@shared/notificationDelivery";

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * The number on the Home Screen icon.
 *
 * The Badging API only exists in an installed app — a Home Screen icon
 * on iOS, or "Add to Dock" on a Mac. In an ordinary tab the methods are
 * simply absent, so this does nothing and says nothing: there is no
 * icon to badge, and a warning about it would be noise on every page
 * load for everyone who has not installed it.
 *
 * Deliberately not tied to the alerts switch. That switch is about being
 * interrupted; a badge interrupts nobody, it just answers "is there
 * anything waiting" from the Home Screen. Someone who turned popups off
 * to stop being pinged mid-groom still wants to see a 3 on the icon.
 */
function badging(): BadgingNavigator | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as BadgingNavigator;
  // typeof, not truthiness: tsc rightly points out that a declared
  // optional method reads as always defined once narrowed, and the whole
  // question here is whether the browser actually shipped it.
  const has = typeof nav.setAppBadge === "function" && typeof nav.clearAppBadge === "function";
  return has ? nav : null;
}

function apply(count: number | null) {
  const nav = badging();
  if (!nav) return;
  // Both reject where the platform refuses — iOS withholds badging until
  // notification permission is granted — and an unhandled rejection here
  // would surface as an error for a decoration.
  const done = count === null ? nav.clearAppBadge!() : nav.setAppBadge!(count);
  void done?.catch(() => {});
}

/**
 * The real count, remembered so a test badge can put it back.
 *
 * Module scope rather than state: the test is fired from Settings and
 * the count is held by the bell, which are different components, and a
 * test that could not restore the truth would leave a made-up number on
 * the icon until the next message arrived.
 */
let lastRealCount: number | null = null;
let restoreTimer: number | undefined;

export function useAppBadge(unreadCount: number | undefined) {
  useEffect(() => {
    lastRealCount = badgeCountFor(unreadCount);
    // A real change wins over a test in progress, rather than the test's
    // restore later stamping a stale number back on.
    if (restoreTimer !== undefined) {
      window.clearTimeout(restoreTimer);
      restoreTimer = undefined;
    }
    apply(lastRealCount);
  }, [unreadCount]);
}

/** Whether this device can show a badge at all. */
export function badgingSupported(): boolean {
  return badging() !== null;
}

/**
 * Put a number on the icon for a few seconds so it can be seen working,
 * then put the truth back.
 *
 * It restores rather than clearing, because clearing would wipe a
 * genuine unread count that happened to be there when the test ran.
 */
export function flashTestBadge(seconds = 20): boolean {
  if (!badging()) return false;
  apply(1);
  if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => {
    restoreTimer = undefined;
    apply(lastRealCount);
  }, seconds * 1000);
  return true;
}
