import { Bell, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";

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
  const { supported, permission, enabled, setEnabled, canAsk } = useStaffNotifications();

  const isIos = typeof navigator !== "undefined"
    && /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS reports as a Mac, but a Mac with a touch screen is an iPad.
    || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          Desktop notifications
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
