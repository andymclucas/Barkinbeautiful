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
import { toastBookingConfirmation } from "@/lib/confirmationToast";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/DateTimeField";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getActiveTimeZone } from "@/lib/timezone";
import { rebookWeekOptions } from "@shared/rebook";

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

/** "14:30" as the salon says it out loud. */
function prettyTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  const suffix = h! < 12 ? "am" : "pm";
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "2027-01-13" as "Wed 13 Jan". */
function prettyDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00+10:00`).toLocaleDateString("en-AU", {
    timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short",
  });
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
  /**
   * An interval staff picked themselves, or null to follow the dog's
   * history. Null rather than the recommended number, so the chip row can
   * say which one IS the recommendation without that becoming an override
   * the moment the dialog opens.
   */
  const [weeksOverride, setWeeksOverride] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: suggestion, isFetching } = trpc.calendar.rebookSuggestion.useQuery(
    { appointmentId, ...(weeksOverride ? { weeksOverride } : {}) },
    { enabled: open },
  );

  /*
   * What is actually free on whatever day is in the box.
   *
   * Lauren, 05/11/2026, having just taught Megs to rebook: "it would be
   * handy to only show timeslots that are free for those dates. Like 10
   * weeks from now.. time slots - 9am, 12pm, 12:30 or no time slots on
   * that day. Shows other alternative dates around that 10 week mark."
   *
   * Keyed off the DATE only, so retyping the time does not refetch.
   */
  const targetDate = when.slice(0, 10);
  const { data: free, isFetching: loadingFree } = trpc.calendar.rebookFreeTimes.useQuery(
    {
      targetDate,
      durationMinutes: suggestion?.durationMinutes ?? 60,
      staffIds: suggestion?.staffId ? [suggestion.staffId] : [],
    },
    { enabled: open && targetDate.length === 10 && Boolean(suggestion) },
  );

  /** Put a chip's date and time into the box the dialog books from. */
  const pick = (date: string, time: string) => setWhen(`${date}T${time}`);

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

  /*
   * Picking an interval clears the date, which lets the effect above
   * refill it from the new suggestion. The alternative - adding weeks to
   * whatever is in the box - would skip the server's clash check and
   * cheerfully land the dog on top of another booking.
   */
  const chooseWeeks = (weeks: number) => {
    setWeeksOverride(weeks);
    setWhen("");
  };

  const rebook = trpc.calendar.rebook.useMutation({
    onSuccess: (r) => {
      toast.success(r.dogs > 1 ? `Rebooked ${r.dogs} dogs` : "Rebooked");
      // Whether the client was told, and if not why — see confirmationToast.
      toastBookingConfirmation(r.confirmationSms);
      setOpen(false);
      setWhen("");
      setWeeksOverride(null);
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

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setWhen(""); setWeeksOverride(null); } }}>
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

              {/*
                * Free times on the day in the box. The dialog used to
                * offer every half hour whether or not anyone was free,
                * so a time got picked at the counter and the clash
                * turned up afterwards with the client still standing
                * there.
                */}
              {suggestion && targetDate.length === 10 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Free that day
                  </p>
                  {loadingFree && !free ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking the diary…
                    </p>
                  ) : free && free.target.times.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {free.target.times.map((time) => {
                        const chosen = when === `${free.target.date}T${time}`;
                        return (
                          <button
                            key={time}
                            type="button"
                            onClick={() => pick(free.target.date, time)}
                            aria-pressed={chosen}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
                              chosen
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-transparent bg-muted hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                            }`}
                          >
                            {prettyTime(time)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {/* Why, not just "none" — "the salon is closed" and
                          "fully booked" lead to different next sentences
                          at the counter. */}
                      {free?.target.message || "No times free that day."}
                    </p>
                  )}

                  {/* Nearby days that do have room, so the answer to
                      "nothing on the 14th" is "the 13th or the 16th"
                      rather than another search. */}
                  {free && free.alternatives.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Or nearby:</p>
                      <div className="flex flex-wrap gap-1">
                        {free.alternatives.map((alt) => (
                          <button
                            key={alt.date}
                            type="button"
                            onClick={() => pick(alt.date, alt.times[0]!)}
                            title={`${alt.times.length} time${alt.times.length === 1 ? "" : "s"} free — first is ${prettyTime(alt.times[0]!)}`}
                            className="rounded-full border border-transparent bg-muted px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                          >
                            {prettyDate(alt.date)}
                            <span className="ml-1 font-normal text-muted-foreground">
                              {alt.times.length}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {suggestion && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Quick jump
                  </p>
                  {/*
                    * The quick jump, with the dog's own rhythm marked.
                    *
                    * Lauren, 03/11/2026: "look at their history and give a
                    * recommendation based on this but can do a manual
                    * override at any time." So the recommendation is a
                    * starting point that is always visible, never a lock —
                    * every chip is one click, and the date box underneath
                    * still takes anything at all.
                    */}
                  {/* The sidebar's own Quick jump, in a grid of sevens so
                      fourteen weeks is two tidy rows in a narrow dialog. */}
                  <div className="grid grid-cols-7 gap-1">
                    {rebookWeekOptions(suggestion.recommendedWeeks).map((weeks) => {
                      const chosen = suggestion.intervalWeeks === weeks;
                      const isRecommended = suggestion.recommendedWeeks === weeks;
                      return (
                        <button
                          key={weeks}
                          type="button"
                          disabled={isFetching}
                          onClick={() => chooseWeeks(weeks)}
                          aria-pressed={chosen}
                          aria-label={`${weeks} week${weeks === 1 ? "" : "s"}${isRecommended ? " (recommended)" : ""}`}
                          title={isRecommended
                            ? `${weeks} weeks — ${suggestion.recommendedReason}`
                            : `${weeks} week${weeks === 1 ? "" : "s"} from this visit`}
                          className={`relative rounded-md border py-1.5 text-[11px] font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                            chosen
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-transparent bg-muted text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                          }`}
                        >
                          {weeks}
                          {/* A dot, not a star in the label: the number has
                              to stay the thing you read at a glance. */}
                          {isRecommended && (
                            <span
                              aria-hidden
                              className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                                chosen ? "bg-primary-foreground" : "bg-primary"
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {/* Where the number came from, so a wrong one is
                        obviously wrong rather than mysteriously wrong. */}
                    {suggestion.intervalWeeks} weeks — {suggestion.reason}.
                    {/* The advice stays readable even while overridden,
                        which is the difference between an override and
                        simply losing it. */}
                    {suggestion.intervalSource === "manual" &&
                      ` The dot is ${suggestion.recommendedWeeks} weeks — ${suggestion.recommendedReason}.`}
                    {suggestion.shifted && " Moved off a clash in the groomer's day."}
                    {!suggestion.suggestedStart &&
                      " Nothing free near that date, so this is the target — check the diary."}
                  </p>
                </div>
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
