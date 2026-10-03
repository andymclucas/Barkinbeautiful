import { useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";
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
      </CardContent>
    </Card>
  );
}
