import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  chooseDelivery, canAskForPermission, notificationBody,
  type NotificationDelivery,
} from "@shared/notificationDelivery";

const STORAGE_KEY = "gsos.notifications.enabled";
/**
 * Every component calling this hook gets its own useState, so the switch
 * in Settings and the bell in the header would otherwise disagree until
 * a reload. `storage` only fires in OTHER tabs, never the one that made
 * the change, so it cannot cover this on its own.
 */
const CHANGED_EVENT = "gsos:notifications-changed";

/** `"Notification" in window` is false in a plain Safari tab on iOS. */
function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function currentPermission(): "granted" | "denied" | "default" {
  if (!supported()) return "default";
  return window.Notification.permission as "granted" | "denied" | "default";
}

function readEnabled(): boolean {
  // Private windows and blocked site data throw on access rather than
  // returning null, and a thrown read here would take the whole header
  // down with it.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Desktop popups for staff, and something visible on a phone.
 *
 * Off until someone turns it on. Browsers require the permission prompt
 * to come from a real click — Safari refuses outright otherwise — so
 * there is no way to do this quietly at load, and no reason to want to.
 *
 * What a phone gets depends on the phone. Android Chrome behaves like
 * the desktop. iOS Safari has no Notification constructor at all in an
 * ordinary tab; only a site added to the Home Screen gets them, and only
 * from iOS 16.4. So the fallback is the page itself, which is the honest
 * answer rather than a switch that silently does nothing.
 */
export function useStaffNotifications() {
  const [enabled, setEnabledState] = useState(readEnabled);
  const [permission, setPermission] = useState(currentPermission);
  const isSupported = supported();

  // Keep every instance in step: `storage` for other tabs, our own event
  // for other components in this one.
  useEffect(() => {
    const resync = () => {
      setEnabledState(readEnabled());
      setPermission(currentPermission());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) resync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED_EVENT, resync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED_EVENT, resync);
    };
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    if (next && canAskForPermission({ supported: isSupported, permission: currentPermission() })) {
      try {
        const result = await window.Notification.requestPermission();
        setPermission(result as "granted" | "denied" | "default");
      } catch {
        // Safari rejects when not called from a gesture. The switch still
        // goes on — the in-app fallback works regardless.
        setPermission(currentPermission());
      }
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Not persisting is survivable; the switch still holds for this tab.
    }
    setEnabledState(next);
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }, [isSupported]);

  const notify = useCallback((input: { title: string; body: string; url?: string; tag?: string }): NotificationDelivery => {
    const delivery: NotificationDelivery = chooseDelivery({
      supported: isSupported,
      permission: currentPermission(),
      enabled: readEnabled(),
      documentHidden: typeof document !== "undefined" && document.hidden,
    });
    if (delivery === "none") return "none";

    const body = notificationBody(input.body);

    if (delivery === "os") {
      try {
        const notification = new window.Notification(input.title, {
          body,
          icon: "/groomigo_logo.png",
          // Same tag replaces rather than stacks, so twenty messages from
          // one thread are one notification, not twenty.
          tag: input.tag,
        });
        notification.onclick = () => {
          window.focus();
          if (input.url) window.location.assign(input.url);
          notification.close();
        };
        return "os";
      } catch {
        // Some browsers throw where a service worker is expected instead.
        // Fall through to the page rather than losing the ping.
      }
    }

    toast(input.title, {
      description: body,
      action: input.url ? { label: "Open", onClick: () => window.location.assign(input.url!) } : undefined,
    });
    return "in_app";
  }, [isSupported]);

  /**
   * Fire one on purpose, to check it works on this device.
   *
   * After a delay, because a real notification only pops when the tab is
   * in the background — that is the whole design — so a test fired while
   * you are looking at the page would show a toast and prove nothing
   * about the thing you are testing. The delay is the window to switch
   * away. Whatever happens then is exactly what a real message does.
   */
  const sendTest = useCallback((afterMs = 5000, onResult?: (delivery: NotificationDelivery) => void) => {
    window.setTimeout(() => {
      const delivery = notify({
        title: "Groomigo test notification",
        // Neutral on purpose: the follow-up says whether this arrived
        // as a desktop alert or only in the page, and the two must not
        // contradict each other on screen.
        body: "This is what a new message or missed call will look like.",
        url: "/settings",
        tag: "gsos-test",
      });
      // Saying "it works" after falling back to a toast would be a lie
      // on exactly the device most likely to need the truth: a phone.
      onResult?.(delivery);
    }, afterMs);
  }, [notify]);

  return {
    supported: isSupported,
    permission,
    enabled,
    setEnabled,
    canAsk: canAskForPermission({ supported: isSupported, permission }),
    /** True where the only possible ping is inside the page. */
    inAppOnly: !isSupported || permission !== "granted",
    notify,
    sendTest,
  };
}
