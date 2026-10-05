/* Groomigo service worker — notifications only.
 *
 * This file exists for one reason: it is the only code that still runs
 * when Groomigo is closed. The app's own notification path fires from an
 * open page over an SSE connection, so with the browser shut, the phone
 * locked or the tab discarded there was nothing alive to tell anyone the
 * salon line was ringing.
 *
 * It deliberately does NOT cache anything or serve anything offline.
 * Adding a fetch handler to a live application is a separate job with its
 * own ways to go wrong — a stale shell, a bundle served after a deploy
 * that no longer matches index.html — and none of that is needed to
 * deliver a notification. If offline support is ever wanted, it belongs
 * in its own change with its own testing.
 *
 * Plain JavaScript with no imports on purpose: this is served as a static
 * file from the public directory and is not part of the Vite bundle, so
 * it cannot reach anything in shared/. The decisions all live on the
 * server in shared/pushNotification.ts; this just renders what arrives.
 *
 * It is served with no-store (see serveStatic in server/_core/vite.ts).
 * Were it cached with the immutable header the bundles use, the browser
 * would keep running whichever version it first saw — for a year — and
 * no fix here could ever reach a device.
 */

const FALLBACK = {
  title: "Groomigo",
  body: "Something needs your attention.",
  url: "/messages",
  tag: "gsos-generic",
};

// Take over as soon as a new version is installed, instead of waiting for
// every tab to close. A notification bug must be fixable the same day.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = FALLBACK;
  try {
    // Chrome's DevTools can send a push with no data at all, and a throw
    // in here would show the browser's own "site updated in the
    // background" notice instead of ours.
    if (event.data) payload = { ...FALLBACK, ...event.data.json() };
  } catch (error) {
    // Keep the fallback rather than showing nothing: a push arrived, so
    // something happened, and silence would be the wrong answer.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      // Same tag replaces rather than stacks, and is shared with the
      // in-page alert so one event cannot produce two notifications.
      tag: payload.tag,
      renotify: Boolean(payload.renotify),
      requireInteraction: Boolean(payload.requireInteraction),
      // A phone in a pocket is the whole point of this feature.
      vibrate: payload.kind === "call-ringing" ? [200, 100, 200, 100, 200] : [200],
      timestamp: Date.now(),
      data: { url: payload.url || FALLBACK.url, kind: payload.kind },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || FALLBACK.url, self.location.origin);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Reuse a window that is already open rather than stacking up a new
    // tab per notification. Someone who has missed four calls should not
    // come back to four Groomigo windows.
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue;
      await client.focus();
      if ("navigate" in client) {
        try {
          await client.navigate(target.href);
        } catch (error) {
          // Safari rejects navigate() in some states. A focused window on
          // the wrong page still beats no window at all.
        }
      }
      return;
    }

    await self.clients.openWindow(target.href);
  })());
});
