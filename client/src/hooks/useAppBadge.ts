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
export function useAppBadge(unreadCount: number | undefined) {
  useEffect(() => {
    const nav = typeof navigator === "undefined" ? null : (navigator as BadgingNavigator);
    if (!nav?.setAppBadge || !nav.clearAppBadge) return;

    const count = badgeCountFor(unreadCount);
    // Both return promises that reject where the platform refuses — iOS
    // withholds badging until notification permission is granted — and an
    // unhandled rejection here would surface as an error for a decoration.
    const done = count === null ? nav.clearAppBadge() : nav.setAppBadge(count);
    void done?.catch(() => {});
  }, [unreadCount]);
}
