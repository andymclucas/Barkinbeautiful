import { useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Texting a client the dates they are booked in for.
 *
 * Lauren, 06/11/2026, after setting a year of bookings for Bronwyn
 * Waegh: "I want to send her a list of all her dates in a sms too if
 * possible." Nobody reads thirteen dates back down the phone, and the
 * client has nothing to put in a calendar.
 *
 * ## The exact words, and the cost, before it goes
 *
 * This is the longest text the salon sends, and the one where the
 * segment count is not obvious — thirteen dates is two segments in
 * GSM-7 and four if a single emoji creeps in. So the dialog shows the
 * body verbatim and says what it costs, rather than a button that fires
 * something unseen at a real client's phone.
 *
 * The body comes from the server, built from the client's own bookings,
 * and is NOT editable here on purpose: that is what lets a receptionist
 * send it. A staff member typing their own words to a client is
 * owner-only surface and stays in the Messages composer. See the note on
 * sms.sendUpcomingDates.
 */
export function TextUpcomingDatesButton({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false);

  const preview = trpc.sms.upcomingDatesPreview.useQuery(
    { clientId },
    // Only asked for when somebody opens the dialog: it is a query per
    // client and the button sits on a page that already runs plenty.
    { enabled: open },
  );

  const send = trpc.sms.sendUpcomingDates.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.success
          ? `Sent — ${r.datesShown.length} date${r.datesShown.length === 1 ? "" : "s"}.`
          : "Twilio would not take it. The message is in the thread marked failed.",
        { duration: 8000 },
      );
      setOpen(false);
    },
    onError: (e) => toast.error(e.message, { duration: 10000 }),
  });

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <MessageSquare className="mr-1 h-3.5 w-3.5" />
        Text dates
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!send.isPending) setOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Text their dates</DialogTitle>
            <DialogDescription>
              This is exactly what will be sent. Nothing goes until you press Send.
            </DialogDescription>
          </DialogHeader>

          {preview.isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Working out the dates…
            </p>
          )}
          {preview.error && (
            <p className="text-sm font-medium text-destructive">{preview.error.message}</p>
          )}
          {preview.data && (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">
                {preview.data.body}
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.data.cost.segments} segment{preview.data.cost.segments === 1 ? "" : "s"}
                {" · "}{preview.data.cost.encoding}
                {" · "}{preview.data.datesShown.length} date
                {preview.data.datesShown.length === 1 ? "" : "s"}
                {preview.data.datesOmitted > 0 && ` · ${preview.data.datesOmitted} further date${preview.data.datesOmitted === 1 ? "" : "s"} not named`}
              </p>
              {!preview.data.phone && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  There is no mobile number on this client, so this cannot be sent.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={send.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!preview.data?.phone || send.isPending}
              onClick={() => send.mutate({ clientId })}
            >
              {send.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
