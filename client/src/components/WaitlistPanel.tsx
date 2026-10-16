import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Check, Clock3, Dog, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { describeWindow } from "@shared/waitlist";

/**
 * The staff side of the waitlist.
 *
 * Three things in one place, because they are one job: a booking gets
 * cancelled, you see who was waiting for a slot like it, you text them,
 * and shortly afterwards you decide who gets it.
 *
 * Claims come first. A client has tapped "yes please" and is waiting on
 * an answer — that is the only part of this with somebody on the other
 * end of it.
 */

const brisbane = (value: string | number | Date, withTime = true) =>
  new Date(value).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Australia/Brisbane",
  });

function OfferSlot({ onOffered }: { onOffered: () => void }) {
  const [slot, setSlot] = useState({ date: "", time: "09:30", durationMinutes: "90", staffId: "" });
  const [picked, setPicked] = useState<number[]>([]);

  const groomers = trpc.staff.listOperational.useQuery({});
  const ready = Boolean(slot.date && slot.time);
  // A naive datetime is read as Brisbane by the server, the same as
  // every other booking field in this app.
  const scheduledStart = ready ? `${slot.date}T${slot.time}` : "";

  const matches = trpc.waitlist.matchesForSlot.useQuery(
    {
      scheduledStart: new Date(`${scheduledStart}:00+10:00`),
      staffId: slot.staffId ? Number(slot.staffId) : null,
    },
    { enabled: ready },
  );

  const offer = trpc.waitlist.offer.useMutation({
    onSuccess: (result) => {
      const failed = result.results.filter((r: any) => !r.smsSent);
      if (failed.length === 0) toast.success(`Offered to ${result.offered} on the waitlist`);
      else toast.error(`${result.offered - failed.length} texted, ${failed.length} failed to send`);
      setPicked([]);
      onOffered();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="rounded-lg border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />A slot has come free
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Date</Label>
          <Input className="mt-1 h-8" type="date" value={slot.date}
            onChange={(e) => { setSlot((s) => ({ ...s, date: e.target.value })); setPicked([]); }} />
        </div>
        <div>
          <Label className="text-xs">Time</Label>
          <Input className="mt-1 h-8" type="time" step="900" value={slot.time}
            onChange={(e) => { setSlot((s) => ({ ...s, time: e.target.value })); setPicked([]); }} />
        </div>
        <div>
          <Label className="text-xs">Minutes</Label>
          <Input className="mt-1 h-8" type="number" min="15" step="15" value={slot.durationMinutes}
            onChange={(e) => setSlot((s) => ({ ...s, durationMinutes: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Groomer</Label>
          <Select value={slot.staffId} onValueChange={(v) => { setSlot((s) => ({ ...s, staffId: v })); setPicked([]); }}>
            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              {groomers.data?.map((g: any) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!ready ? (
        <p className="mt-3 text-sm text-muted-foreground">Enter the date and time to see who's waiting for it.</p>
      ) : matches.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking the waitlist…</p>
      ) : !matches.data?.length ? (
        <p className="mt-3 text-sm text-muted-foreground">Nobody on the waitlist wants that time.</p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {matches.data.map((m: any) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-violet-600"
                  checked={picked.includes(m.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                />
                <span className="font-medium">{m.clientName}</span>
                <span className="text-muted-foreground">· {m.petName}</span>
                {/* The groomer they asked for, when it is this one. The
                    list is already ranked to put these first. */}
                {m.exactGroomer && <Badge variant="secondary">their groomer</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  waiting since {brisbane(m.createdAt, false)}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={picked.length === 0 || offer.isPending}
              onClick={() => offer.mutate({
                entryIds: picked,
                staffId: slot.staffId ? Number(slot.staffId) : null,
                scheduledStart: new Date(`${scheduledStart}:00+10:00`),
                durationMinutes: Math.max(15, Number(slot.durationMinutes) || 90),
              })}
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              {offer.isPending ? "Texting…" : `Text ${picked.length || "no"}${picked.length === 1 ? " client" : " clients"}`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPicked(matches.data.map((m: any) => m.id))}>
              Select all {matches.data.length}
            </Button>
            <span className="text-xs text-muted-foreground">
              They're told it's first come — whoever asks still needs confirming.
            </span>
          </div>
        </>
      )}
    </div>
  );
}


/** Today and sixty days out, as YYYY-MM-DD in Brisbane. */
function defaultWindow() {
  const key = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000)
      .toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  return { earliestDate: key(0), latestDate: key(60) };
}

/**
 * Putting a client on the list.
 *
 * One search box over clients AND dogs, because the salon thinks in
 * dogs — "Leo's owner" is how the person on the phone is identified,
 * and searchClients already returns a row per pet so picking one picks
 * both at once.
 */
function AddToWaitlist({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<any>(null);
  const [form, setForm] = useState({ ...defaultWindow(), timeOfDay: "any", staffId: "", note: "" });

  const results = trpc.memberships.searchClients.useQuery({ search }, { enabled: search.trim().length >= 2 });
  const groomers = trpc.staff.listOperational.useQuery({});

  const join = trpc.waitlist.join.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.petName} added to the waitlist`);
      setOpen(false); setChosen(null); setSearch("");
      setForm({ ...defaultWindow(), timeOfDay: "any", staffId: "", note: "" });
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-3.5 w-3.5" />Add someone to the waitlist
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Add to the waitlist</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close"
          onClick={() => { setOpen(false); setChosen(null); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!chosen ? (
        <>
          <Input className="mt-2 h-8" value={search} placeholder="Search a client or dog…"
            onChange={(e) => setSearch(e.target.value)} />
          {search.trim().length >= 2 && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {!results.data?.length ? (
                <p className="text-sm text-muted-foreground">No matches.</p>
              ) : results.data.map((r: any) => (
                <button key={`${r.clientId}-${r.petId}`} type="button"
                  className="flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => setChosen(r)}>
                  <span className="font-medium">{r.firstName} {r.lastName}</span>
                  <span className="text-muted-foreground">· {r.petName}</span>
                  {r.petBreed && <span className="text-xs text-muted-foreground">({r.petBreed})</span>}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm">
            <span className="font-medium">{chosen.firstName} {chosen.lastName}</span>
            <span className="text-muted-foreground"> · {chosen.petName}</span>
            <Button variant="link" size="sm" className="h-auto p-0 pl-2 text-xs"
              onClick={() => setChosen(null)}>change</Button>
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">From</Label>
              <Input className="mt-1 h-8" type="date" value={form.earliestDate}
                onChange={(e) => setForm((f) => ({ ...f, earliestDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Until</Label>
              <Input className="mt-1 h-8" type="date" value={form.latestDate}
                onChange={(e) => setForm((f) => ({ ...f, latestDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Time of day</Label>
              <Select value={form.timeOfDay} onValueChange={(v) => setForm((f) => ({ ...f, timeOfDay: v }))}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="morning">Mornings</SelectItem>
                  <SelectItem value="afternoon">Afternoons</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Groomer</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="No preference" /></SelectTrigger>
                <SelectContent>
                  {groomers.data?.map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input className="mt-3 h-8" value={form.note} maxLength={500}
            placeholder="Anything else they said — e.g. not Tuesdays, needs a late pickup"
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          <Button size="sm" className="mt-3" disabled={join.isPending}
            onClick={() => join.mutate({
              clientId: chosen.clientId, petId: chosen.petId,
              earliestDate: form.earliestDate, latestDate: form.latestDate,
              timeOfDay: form.timeOfDay as any,
              preferredStaffId: form.staffId ? Number(form.staffId) : undefined,
              note: form.note.trim() || undefined,
            })}>
            {join.isPending ? "Adding\u2026" : "Add to waitlist"}
          </Button>
        </>
      )}
    </div>
  );
}

export function WaitlistPanel() {
  const utils = trpc.useUtils();
  const claims = trpc.waitlist.listClaims.useQuery({});
  const entries = trpc.waitlist.listEntries.useQuery({ status: "active" });

  const refreshAll = () => {
    utils.waitlist.listClaims.invalidate();
    utils.waitlist.listEntries.invalidate();
    utils.waitlist.matchesForSlot.invalidate();
  };

  const approve = trpc.waitlist.approveClaim.useMutation({
    onSuccess: (r) => {
      toast.success(r.toldOthers > 0
        ? `Booked. ${r.toldOthers} other${r.toldOthers === 1 ? "" : "s"} told it's gone.`
        : "Booked.");
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });
  const decline = trpc.waitlist.declineClaim.useMutation({
    onSuccess: () => { toast.success("Declined"); refreshAll(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.waitlist.remove.useMutation({
    onSuccess: () => { toast.success("Removed from the waitlist"); refreshAll(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          Waitlist
          {(claims.data?.length ?? 0) > 0 && <Badge>{claims.data!.length} waiting on you</Badge>}
          {(entries.data?.length ?? 0) > 0 && (
            <Badge variant="secondary">{entries.data!.length} on the list</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Claims first: somebody has tapped and is waiting on an answer. */}
        {(claims.data?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Asked for a spot</h3>
            {claims.data!.map((c: any) => (
              <div key={c.offerId} className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/40">
                <Dog className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{c.clientName}</span>
                <span className="text-muted-foreground">· {c.petName}</span>
                <span className="text-muted-foreground">· {brisbane(c.scheduledStart)}</span>
                {c.staffName && <Badge variant="secondary">{c.staffName}</Badge>}
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" className="h-7 text-xs" disabled={approve.isPending}
                    onClick={() => approve.mutate({ offerId: c.offerId })}>
                    <Check className="mr-1 h-3.5 w-3.5" />Give them the spot
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={decline.isPending}
                    onClick={() => decline.mutate({ offerId: c.offerId })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <OfferSlot onOffered={refreshAll} />

        <AddToWaitlist onAdded={refreshAll} />

        <div>
          <h3 className="text-sm font-semibold">On the waitlist</h3>
          {!entries.data?.length ? (
            <p className="mt-2 text-sm text-muted-foreground">Nobody waiting at the moment.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {entries.data.map((e: any) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium">{e.clientName}</span>
                  <span className="text-muted-foreground">· {e.petName}</span>
                  <Badge variant="outline">{describeWindow(e)}</Badge>
                  {e.preferredStaffName && <Badge variant="secondary">{e.preferredStaffName}</Badge>}
                  {e.note && <span className="text-xs italic text-muted-foreground">"{e.note}"</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    since {brisbane(e.createdAt, false)}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${e.clientName}`}
                    disabled={remove.isPending} onClick={() => remove.mutate({ entryId: e.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
