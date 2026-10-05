import { useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Send, Smartphone, PhoneIncoming } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { flashTestBadge, badgingSupported } from "@/hooks/useAppBadge";

/**
 * The switch, and an honest account of what it can do on this device.
 *
 * Permission has to be asked for from a real click — Safari refuses a
 * request that did not come from a gesture — so there is no quiet way to
 * turn this on at load, and the switch is the gesture.
 *
 * The iPhone caveat is stated rather than buried. iOS has no Notification
 * constructor in an ordinary Safari tab at all; only a site added to the
 * Home Screen gets them. Saying nothing would leave someone wondering why
 * their phone is silent while their desktop pops.
 *
 * There are two switches here and they are genuinely different things,
 * which is why they are not merged into one. The first covers alerts
 * while Groomigo is OPEN — including an operating system popup when it is
 * in a background tab. The second is Web Push: a service worker and a
 * subscription at Google or Apple, which is the only way anything arrives
 * once the app is closed. A device can do the first and not the second,
 * and the commonest case — an iPhone in a Safari tab — is exactly that.
 */
export function StaffNotificationSetting() {
  const { supported, permission, enabled, setEnabled, canAsk, sendTest } = useStaffNotifications();
  const [testing, setTesting] = useState(false);

  const canBadge = badgingSupported();

  const runTest = () => {
    setTesting(true);
    // The badge goes on straight away rather than after the delay: it is
    // not an interruption, and the point is that it is already sitting
    // there when you look at the Home Screen icon. It puts the real
    // unread count back on its own after twenty seconds.
    const badged = flashTestBadge(20);
    // Five seconds to switch away. A notification only pops when the tab
    // is in the background, so testing it while staring at the page
    // would prove nothing about the case you care about.
    toast("Switch to another window or app now", {
      description: badged
        ? "The alert fires in 5 seconds, and a 1 is on the app icon now — it clears itself after twenty."
        : "The alert fires in 5 seconds.",
    });
    sendTest(5000, (delivery) => {
      setTesting(false);
      if (delivery === "os") return; // they just saw it; saying so again is noise
      toast.warning("That appeared in the page, not as a desktop alert", {
        description:
          "This device cannot show them outside the browser — on an iPhone, add Groomigo to the Home Screen "
          + "and open it from there. Otherwise check the site is allowed to send notifications.",
        duration: 10000,
      });
    });
  };

  const isIos = typeof navigator !== "undefined"
    && /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS reports as a Mac, but a Mac with a touch screen is an iPad.
    || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const push = usePushSubscription();
  const [pushTesting, setPushTesting] = useState(false);

  const togglePush = async (next: boolean) => {
    if (next) {
      const ok = await push.subscribe();
      if (ok) {
        toast.success("This device will now be notified when Groomigo is closed");
      } else {
        toast.error("Could not turn that on", { description: push.lastError ?? undefined });
      }
      return;
    }
    await push.unsubscribe();
    toast("This device will no longer be notified when Groomigo is closed");
  };

  const runPushTest = async () => {
    setPushTesting(true);
    const result = await push.sendTest();
    setPushTesting(false);
    if (!result) {
      toast.error("Could not send the test", { description: push.lastError ?? undefined });
      return;
    }
    if (result.skipped === "not_configured") {
      toast.error("Push is not configured on the server", {
        description: "The VAPID keys are missing, so nothing can be sent to any device.",
      });
      return;
    }
    if (result.skipped === "no_subscriptions" || result.sent === 0) {
      toast.warning("No devices to send to", {
        description: "Turn the switch above on for this device first.",
      });
      return;
    }
    // Close the app or lock the phone: the point is what happens when it
    // is NOT on screen, and a notification that arrives over the page you
    // are already reading proves nothing about that.
    toast.success(`Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}`, {
      description: "Lock your phone or switch apps — it should arrive within a few seconds.",
      duration: 8000,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          Alerts on this device
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="staff-notifications" className="text-sm font-normal">
            Ping me when a message or missed call comes in
          </Label>
          <Switch id="staff-notifications" checked={enabled} onCheckedChange={(next) => void setEnabled(next)} />
        </div>

        <p className="text-xs text-muted-foreground">
          This setting is per browser, so turning it on here does not turn it on for the salon screen or
          for anyone else.
        </p>

        {enabled && permission === "denied" && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            This browser has blocked notifications, and asking again does nothing — the browser answers
            straight away without showing anything. Allow them for this site in your browser settings, then
            reload. Until you do, alerts appear in the page instead.
          </p>
        )}

        {enabled && canAsk && (
          <Button size="sm" variant="outline" onClick={() => void setEnabled(true)}>
            Ask for permission again
          </Button>
        )}

        {enabled && (
          <div className="space-y-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={testing} onClick={runTest}>
              <Send className="h-3.5 w-3.5" />
              {testing ? "Firing in 5 seconds…" : "Send a test notification"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Switch to another window or app once you press it. Alerts only pop when Groomigo is in the
              background &mdash; if it is the window you are looking at, the alert appears in the page
              instead, which is deliberate.
              {canBadge
                ? " It also puts a 1 on the app icon so you can see the unread count working; that clears itself after twenty seconds."
                : " This device cannot show a count on an app icon, so only the alert is tested."}
            </p>
          </div>
        )}

        {enabled && isIos && (
          <p className="flex gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              On an iPhone or iPad, Safari only shows notifications for a site added to the Home Screen.
              In an ordinary tab there is nothing to switch on, so alerts appear in the page while it is
              open. Share &rarr; Add to Home Screen, open it from there, and turn this on again.
            </span>
          </p>
        )}

        {enabled && !supported && !isIos && (
          <p className="text-xs text-muted-foreground">
            This browser has no notification support, so alerts appear in the page while it is open.
          </p>
        )}

        {/* Web Push. Everything above needs Groomigo to be open; this is the
            only part that works when it is closed, and it is a separate
            switch because a device can do one and not the other. */}
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="staff-push" className="flex items-center gap-1.5 text-sm font-normal">
                <PhoneIncoming className="h-3.5 w-3.5 text-muted-foreground" />
                Also notify me when Groomigo is closed
              </Label>
              <p className="text-xs text-muted-foreground">
                Incoming calls and missed calls, on this device, with the app shut.
              </p>
            </div>
            <Switch
              id="staff-push"
              checked={push.subscribed === true}
              disabled={!push.capability.usable || push.busy || push.subscribed === null}
              onCheckedChange={(next) => void togglePush(next)}
            />
          </div>

          {push.capability.usable && push.subscribed === true && (
            <div className="space-y-1.5">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={pushTesting} onClick={() => void runPushTest()}>
                <Send className="h-3.5 w-3.5" />
                {pushTesting ? "Sending…" : "Send a test to my devices"}
              </Button>
              <p className="text-xs text-muted-foreground">
                This goes the whole way through Apple or Google rather than being faked in the page, so
                it tests the part that matters. Lock your phone once you press it.
              </p>
            </div>
          )}

          {!push.capability.usable && push.capability.reason === "ios_needs_install" && (
            <p className="flex gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                On an iPhone or iPad this only works once Groomigo is on your Home Screen &mdash; Apple does
                not allow it in an ordinary Safari tab, and there is no way around that. Tap Share
                &rarr; <strong>Add to Home Screen</strong>, open Groomigo from the new icon, and this switch
                will be available. You need iOS 16.4 or later.
              </span>
            </p>
          )}

          {!push.capability.usable && push.capability.reason === "permission_denied" && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
              This browser has blocked notifications for Groomigo, so nothing can be delivered to it.
              Allow them for this site in your browser settings, then reload.
            </p>
          )}

          {!push.capability.usable && push.capability.reason === "unsupported" && (
            <p className="text-xs text-muted-foreground">
              This browser cannot receive notifications while Groomigo is closed.
            </p>
          )}

          {!push.capability.usable && push.capability.reason === "server_not_configured" && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
              Groomigo has no push keys configured, so no device can be notified while the app is closed.
              This one is on the server, not your phone &mdash; VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY need
              to be set.
            </p>
          )}

          {push.lastError && (
            <p className="text-xs text-destructive">{push.lastError}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
