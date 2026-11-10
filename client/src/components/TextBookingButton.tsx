import { Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { getActiveTimeZone } from "@/lib/timezone";

/**
 * "Text booking details": send the client this booking now, by hand.
 *
 * Lauren, 11/11/2026: she rebooked a dog at 8:59 am, the automatic text
 * was held back until 9, and there was no way to send it afterwards.
 * Same words as the automatic confirmation (server/bookingConfirmation.ts).
 *
 * A second press on a booking already texted asks first, so a double tap
 * is a question rather than two texts on the client's phone.
 */
export function TextBookingButton({ appointmentId }: { appointmentId: number }) {
  const send = trpc.calendar.textBookingDetails.useMutation();

  const go = async (again: boolean) => {
    try {
      const r = await send.mutateAsync({ appointmentId, again });
      if (r.sent) {
        toast.success(`Booking texted to ${r.to}.`);
        return;
      }
      if (r.reason === "already_sent") {
        const when = r.alreadySentAt
          ? new Date(r.alreadySentAt).toLocaleString("en-AU", {
            timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
          })
          : "earlier";
        if (window.confirm(`This booking was already texted (${when}). Send it again?`)) await go(true);
        return;
      }
      toast.error(r.reason);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Button variant="outline" className="shrink-0 gap-1.5" disabled={send.isPending} onClick={() => void go(false)}>
      {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
      Text booking details
    </Button>
  );
}
