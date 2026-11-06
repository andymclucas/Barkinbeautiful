import { useState } from "react";
import { CalendarSearch, Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAestDate } from "@shared/auditTimestamp";
import { parseBrisbaneLocalDateTime } from "@shared/localDateTime";

/**
 * "When's your next available booking?"
 *
 * Lauren, 06/11/2026: "what's your idea for if someone rang up and asks
 * when's your next available booking... cause I have no fucking idea
 * off the top of my head unless I go through manually and check."
 *
 * ## Why it is not inside the New Appointment dialog
 *
 * The slot search already existed — as a button inside that dialog,
 * which fills in the date field. To use it on the phone you have to
 * start a booking, pick a client and pick a dog, all before seeing a
 * date, with somebody waiting. This is the same search reachable in one
 * press from the diary, answering the question without committing to
 * anything.
 *
 * ## Why it names a dog instead of asking for a duration
 *
 * MoeGo's version asks you to guess the length on a slider. Type a
 * dog's name here and the length comes from her weight band and the
 * service she actually has — and the search runs twice, once for her
 * usual groomer and once for everybody, because "next with Charlotte"
 * and "next with anyone" are different answers and the caller usually
 * wants both.
 *
 * The chips are the fallback for a dog the salon has never seen, which
 * is most phone calls.
 */
const DURATION_CHIPS = [30, 60, 90, 120] as const;

function readableSlot(date: string, time: string): string {
  const when = parseBrisbaneLocalDateTime(`${date}T${time}`);
  const day = formatAestDate(when, { weekday: "long", day: "numeric", month: "long" });
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  // "half nine" is how it gets said out loud; the digits are what gets
  // written down. Keep the digits.
  const clock = minute === 0 ? `${twelve}${suffix}` : `${twelve}.${String(minute).padStart(2, "0")}${suffix}`;
  return `${day}, ${clock}`;
}

export function NextAvailablePanel({ onPick }: {
  /** Fills the New Appointment dialog, so the answer can become a booking. */
  onPick?: (date: string, time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [petQuery, setPetQuery] = useState("");
  const [pet, setPet] = useState<{ id: number; name: string } | null>(null);
  const [duration, setDuration] = useState<number>(60);

  /* family.searchPets already matches on the dog's name OR the owner's,
     which is how a caller identifies themselves — "it's Bella" or "it's
     Mrs Gerard". No second search worth writing. */
  const petResults = trpc.family.searchPets.useQuery(
    { query: petQuery },
    { enabled: open && !pet && petQuery.trim().length >= 2 },
  );

  const result = trpc.calendar.availability.useQuery(
    { petId: pet?.id, durationMinutes: pet ? undefined : duration },
    // Reads up to 60 days of diary, so only when the panel is open.
    { enabled: open },
  );

  const reset = () => { setPet(null); setPetQuery(""); setDuration(60); };

  return (
    <>
      <Button
        variant="outline" size="sm" className="h-9 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <CalendarSearch className="h-4 w-4" />
        Next available
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Next available</DialogTitle>
            <DialogDescription>
              For the phone. Nothing is booked until you pick one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="next-avail-pet">Whose dog? (optional)</Label>
              {pet ? (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium">{pet.name}</span>
                  <span className="text-xs text-muted-foreground">
                    length and usual groomer taken from their record
                  </span>
                  <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={reset}>
                    Clear
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="next-avail-pet"
                    value={petQuery}
                    onChange={(e) => setPetQuery(e.target.value)}
                    placeholder="Start typing a dog's name"
                  />
                  {(petResults.data ?? []).length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border">
                      {(petResults.data ?? []).slice(0, 8).map((p: any) => (
                        <button
                          key={p.id} type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10"
                          onClick={() => { setPet({ id: p.id, name: p.name ?? "That dog" }); setPetQuery(""); }}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[p.clientFirstName, p.clientLastName].filter(Boolean).join(" ")}
                            {p.breed ? ` · ${p.breed}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Chips rather than MoeGo's slider: four real groom lengths
                beat a continuous control nobody can land precisely. */}
            {!pet && (
              <div className="space-y-1.5">
                <Label>How long?</Label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_CHIPS.map((minutes) => (
                    <button
                      key={minutes} type="button"
                      onClick={() => setDuration(minutes)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        duration === minutes
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {minutes === 60 ? "1 hour" : minutes > 60 ? `${minutes / 60} hours` : `${minutes} min`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {result.isFetching && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Looking through the diary…
              </p>
            )}
            {result.error && (
              <p className="text-sm font-medium text-destructive">{result.error.message}</p>
            )}

            {result.data && !result.isFetching && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Looking for {result.data.durationMinutes} minutes
                  {result.data.durationSource === "pet" && result.data.petName
                    ? ` — ${result.data.petName}'s usual length`
                    : ""}
                  .
                </p>

                {result.data.withUsual && result.data.withUsual.slots.length > 0 && (
                  <SlotList
                    title={`With ${result.data.withUsual.staffName ?? "their usual groomer"}`}
                    slots={result.data.withUsual.slots}
                    onPick={(d, t) => { onPick?.(d, t); setOpen(false); }}
                  />
                )}

                <SlotList
                  title={result.data.withUsual ? "With anyone" : "Next free"}
                  slots={result.data.anyone.slots}
                  onPick={(d, t) => { onPick?.(d, t); setOpen(false); }}
                  emptyMessage={result.data.anyone.message}
                />

                {/* "The 20th" means something different when the days
                    before it were full than when the salon was shut. */}
                {result.data.anyone.summary.searched > 0 && (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Looked at {result.data.anyone.summary.searched} days from{" "}
                    {formatAestDate(parseBrisbaneLocalDateTime(`${result.data.fromDate}T09:00`), { day: "numeric", month: "short" })}
                    {result.data.anyone.summary.full > 0 && ` · ${result.data.anyone.summary.full} fully booked`}
                    {result.data.anyone.summary.closed > 0 && ` · ${result.data.anyone.summary.closed} closed`}
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SlotList({ title, slots, onPick, emptyMessage }: {
  title: string;
  slots: ReadonlyArray<{ date: string; time: string; daysAhead: number }>;
  onPick: (date: string, time: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage || "Nothing free."}</p>
      ) : (
        <ul className="space-y-1">
          {slots.map((slot) => (
            <li key={`${slot.date}-${slot.time}`}>
              <button
                type="button"
                onClick={() => onPick(slot.date, slot.time)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                {/* Phrased the way it gets said out loud, because that is
                    what this screen is for. */}
                <span className="font-medium">{readableSlot(slot.date, slot.time)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {slot.daysAhead === 0 ? "today" : `in ${slot.daysAhead} day${slot.daysAhead === 1 ? "" : "s"}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
