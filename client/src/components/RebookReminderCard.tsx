import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildRebookReminderSms, REBOOK_REMINDER_WEEKS_BEFORE, REBOOK_REMINDER_MAX_PER_RUN,
} from "@shared/rebookReminder";

/**
 * The rebook nudge's switch, and the exact words it will send.
 *
 * Andy, 07/11/2026, from MoeGo's "Rebook reminder" screen. MoeGo lets
 * you edit the template; asked which he wanted, he chose fixed copy with
 * a preview — the same shape as every other automated text here, where
 * the wording lives in a tested shared/ builder that always carries the
 * right booking link and cannot have its opt-out broken by a typo.
 *
 * So this shows the real message rather than a text box. The preview is
 * built by the SAME function the job sends through, so it cannot drift
 * into advertising copy that does not match what goes out.
 */
export function RebookReminderCard() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: settings, isLoading } = trpc.onlineBooking.getSettings.useQuery({ tenantId: 1 });
  const update = trpc.onlineBooking.updateSettings.useMutation({
    onSuccess: () => { void utils.onlineBooking.getSettings.invalidate(); },
    onError: (e) => toast.error("Could not save", { description: e.message }),
  });

  if (isLoading) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  }
  if (!settings) return null;

  const enabled = Boolean(settings.rebookReminderEnabled);
  const weeksBefore = settings.rebookReminderWeeksBefore ?? REBOOK_REMINDER_WEEKS_BEFORE;

  // The real thing, from the real builder, with a worked example rather
  // than placeholder tokens — {petName} tells you nothing about how the
  // sentence actually reads.
  const preview = buildRebookReminderSms({
    salonName: "Barkin Beautiful",
    clientFirstName: "Scott",
    petNames: ["Effie", "Dusty"],
    weeksSinceLastVisit: weeksBefore,
    bookingUrl: settings.onlineBookingEnabled
      ? `${window.location.origin}/book`
      : null,
    salonPhone: null,
  });

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-primary" /> Rebook reminder
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Texts a client who is coming due for a groom and has nothing booked. One message per
          household, however many dogs they have.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="rebook-enabled" className="font-medium">
            {enabled ? "On" : "Off"}
          </Label>
          <Switch
            id="rebook-enabled"
            checked={enabled}
            disabled={!isAdmin || update.isPending}
            onCheckedChange={(next) => {
              update.mutate({ tenantId: 1, rebookReminderEnabled: next });
              toast.success(next ? "Rebook reminders on" : "Rebook reminders off");
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="rebook-weeks">When to send</Label>
          <Select
            value={String(weeksBefore)}
            disabled={!isAdmin || update.isPending}
            onValueChange={(v) => update.mutate({ tenantId: 1, rebookReminderWeeksBefore: Number(v) })}
          >
            <SelectTrigger id="rebook-weeks" className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w} week{w === 1 ? "" : "s"} before they are due
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>What goes out</Label>
          <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">{preview}</p>
          <p className="text-xs text-muted-foreground">
            {update.isPending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
            Example, with a two-dog household. The wording is fixed so the booking link and the
            opt-out cannot be lost; ask and it can be changed.
          </p>
        </div>

        {/* The facts somebody switching this on should know BEFORE they
            switch it on, not after a hundred texts have gone. */}
        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <li>&bull; Anyone with a booking already in the diary is never texted.</li>
          <li>&bull; A client who opted out of texts is never texted.</li>
          <li>&bull; Each household gets one message per groom cycle, not one per dog.</li>
          <li>
            &bull; At most {REBOOK_REMINDER_MAX_PER_RUN} go out per run, so switching this on
            cannot text the whole book in one morning.
          </li>
        </ul>

        {!isAdmin && (
          <p className="text-xs text-muted-foreground">An administrator has to change this.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default RebookReminderCard;
