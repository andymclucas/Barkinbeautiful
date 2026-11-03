/**
 * "Same again in six weeks", from the booking already on screen.
 *
 * Lauren, 03/11/2026: "a rebook button.. to schedule from today's
 * booking and make one jumping ahead in time. Instead of manually
 * going in and asking the clients again their name.. to bring up their
 * file."
 *
 * The client is at the counter having just collected the dog. The
 * booking in front of staff already knows the dogs, the groomer, the
 * service and the length — so the button proposes a date and the only
 * decision left is yes, or a different day.
 *
 * It shows the date BEFORE booking anything, and says where the
 * interval came from. A button that silently picks a date is one staff
 * stop trusting the first time it picks a wrong one.
 */
import { useEffect, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/DateTimeField";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getActiveTimeZone } from "@/lib/timezone";

/** An ISO instant as the value a datetime-local input wants, in salon time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getActiveTimeZone(),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Brisbane is UTC+10 with no DST, so the offset is a constant. */
function fromLocalInput(local: string): string {
  return new Date(`${local}:00+10:00`).toISOString();
}

export function RebookButton({ appointmentId, onRebooked }: {
  appointmentId: number;
  onRebooked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const utils = trpc.useUtils();

  const { data: suggestion, isFetching } = trpc.calendar.rebookSuggestion.useQuery(
    { appointmentId },
    { enabled: open },
  );

  /*
   * Fill the box the first time a suggestion arrives, then leave
   * whatever the staff member has typed alone.
   *
   * An effect, not useQuery's onSuccess — TanStack Query v5 removed
   * that callback, so the version written first silently never ran and
   * the date box opened empty. It compiled only because the options
   * object was cast `as any`, which is precisely what hid it.
   */
  useEffect(() => {
    if (!suggestion) return;
    setWhen((prev) => prev || toLocalInput(suggestion.suggestedStart ?? suggestion.targetStart));
  }, [suggestion]);

  const rebook = trpc.calendar.rebook.useMutation({
    onSuccess: (r) => {
      toast.success(r.dogs > 1 ? `Rebooked ${r.dogs} dogs` : "Rebooked");
      setOpen(false);
      setWhen("");
      utils.calendar.invalidate();
      onRebooked?.();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-3.5 w-3.5" /> Rebook
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setWhen(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Book the next visit</DialogTitle>
            <DialogDescription>
              Same dogs, same groomer, same service — just a new day.
            </DialogDescription>
          </DialogHeader>

          {isFetching && !suggestion ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Working out when…
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" htmlFor="rebook-when">Date and time</label>
                <DateTimeField
                  id="rebook-when"
                  aria-label="Rebook"
                  className="h-9"
                  value={when}
                  onChange={setWhen}
                />
              </div>

              {suggestion && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {/* Where the number came from, so a wrong one is
                      obviously wrong rather than mysteriously wrong. */}
                  {suggestion.intervalWeeks} weeks — {suggestion.reason}.
                  {suggestion.shifted && " Moved off a clash in the groomer's day."}
                  {!suggestion.suggestedStart &&
                    " Nothing free near that date, so this is the target — check the diary."}
                </p>
              )}

              {suggestion && suggestion.dogs.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  Books all {suggestion.dogs.length} dogs on this visit:{" "}
                  {suggestion.dogs.map((d) => d.petName).filter(Boolean).join(", ")}.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={rebook.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!when || rebook.isPending}
              onClick={() => rebook.mutate({ appointmentId, start: fromLocalInput(when) })}
            >
              {rebook.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Book it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default RebookButton;
