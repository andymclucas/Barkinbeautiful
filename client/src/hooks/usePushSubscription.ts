import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { pushCapability, vapidKeyToBytes, type PushCapability } from "@shared/pushNotification";

/**
 * Registering this device for notifications that arrive with Groomigo shut.
 *
 * Separate from useStaffNotifications, which owns the in-page and
 * open-tab alerts. That one needs nothing but a permission grant; this
 * one needs a service worker, a subscription at Google/Apple/Mozilla and
 * a row on our server, and any of the three can fail on its own. Keeping
 * them apart means the existing alerts carry on working untouched on a
 * device where push cannot be set up at all.
 *
 * Everything here is best-effort and must never throw into the page: a
 * phone that cannot subscribe should still be able to use the salon
 * software.
 */

/** iPadOS reports itself as a Mac, but a Mac with a touchscreen is an iPad. */
function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * Whether this is the Home Screen app rather than a Safari tab — the
 * thing iOS requires before it will do Web Push at all.
 */
function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayMode = window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosStandalone || displayMode;
}

function currentPermission(): "granted" | "denied" | "default" {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return window.Notification.permission as "granted" | "denied" | "default";
}

export function usePushSubscription() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const { data: keyData } = trpc.pushSubscriptions.publicKey.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
  });
  const subscribeMutation = trpc.pushSubscriptions.subscribe.useMutation();
  const unsubscribeMutation = trpc.pushSubscriptions.unsubscribe.useMutation();
  const testMutation = trpc.pushSubscriptions.sendTest.useMutation();

  const hasServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const hasPushManager = typeof window !== "undefined" && "PushManager" in window;

  const capability: PushCapability = pushCapability({
    hasServiceWorker,
    hasPushManager,
    isIos: detectIos(),
    isStandalone: detectStandalone(),
    permission: currentPermission(),
    serverConfigured: keyData?.configured ?? true,
  });

  // Is this browser already subscribed? Asked once, so the switch shows
  // the truth on load rather than assuming off.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasServiceWorker || !hasPushManager) {
        if (!cancelled) setSubscribed(false);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(existing));
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasServiceWorker, hasPushManager]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setLastError(null);
    try {
      const publicKey = keyData?.publicKey;
      if (!publicKey) {
        setLastError("The server has no push keys configured.");
        return false;
      }

      // Must come from a real click. Safari rejects a permission request
      // that did not come from a gesture, which is why this lives behind
      // the switch rather than running at load.
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        setLastError("Notifications are not allowed for this site.");
        return false;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      // Without this the first subscribe on a fresh install can race the
      // worker becoming active and reject.
      await navigator.serviceWorker.ready;

      // Reuse an existing subscription rather than replacing it; a
      // needless unsubscribe/resubscribe cycles the endpoint and leaves
      // a dead row on the server until the next send prunes it.
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        // Required: we promise every push results in a visible
        // notification. Chrome shows its own "site updated in the
        // background" notice if we ever break that promise.
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToBytes(publicKey, window.atob) as BufferSource,
      });

      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        setLastError("This browser returned an incomplete subscription.");
        return false;
      }

      await subscribeMutation.mutateAsync({
        tenantId: 1,
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 255),
      });

      setSubscribed(true);
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Could not set up notifications on this device.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [keyData?.publicKey, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // Tell the server first: if the browser unsubscribes and the
        // round trip then fails, the row is orphaned and keeps being
        // sent to until a 410 prunes it.
        await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  }, [unsubscribeMutation]);

  /**
   * A real push, all the way through the push service, at this user's
   * own devices. Faking it in the page would test nothing: the part that
   * matters is precisely the part that runs when the page is gone.
   */
  const sendTest = useCallback(async () => {
    setLastError(null);
    try {
      return await testMutation.mutateAsync({ tenantId: 1 });
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Could not send the test.");
      return null;
    }
  }, [testMutation]);

  return { capability, subscribed, busy, lastError, subscribe, unsubscribe, sendTest };
}
