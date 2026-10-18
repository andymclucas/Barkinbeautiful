import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Where a client puts themselves on the waitlist.
 *
 * "Let me know if anything comes up" is said to the salon constantly and
 * until now lived in somebody's memory. This is that sentence, written
 * down, by the person saying it.
 *
 * Nothing here holds a slot or takes a payment. It records a wish, and
 * the salon still chooses who to offer a cancellation to — which is why
 * the page can be open to anyone without being a booking page.
 */

/** Today, and sixty days out, as Brisbane calendar dates. */
function defaultWindow() {
  const key = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000)
      .toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  return { earliestDate: key(0), latestDate: key(60) };
}

export default function WaitlistJoin() {
  const options = trpc.waitlist.publicOptions.useQuery({}, { retry: false });
  const [form, setForm] = useState({
    firstName: "", lastName: "", phone: "", email: "",
    petName: "", breed: "", preferredStaffId: "", timeOfDay: "any",
    note: "", ...defaultWindow(),
  });
  const [done, setDone] = useState<{ alreadyOn: boolean; petName: string } | null>(null);

  const join = trpc.waitlist.publicJoin.useMutation({
    onSuccess: (result) => setDone({ alreadyOn: result.alreadyOn, petName: result.petName }),
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const ready = useMemo(
    () => Boolean(form.firstName.trim() && form.lastName.trim() && form.phone.trim() && form.petName.trim()
      && form.earliestDate && form.latestDate),
    [form],
  );

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#5b21b688,_transparent_40%),linear-gradient(135deg,#1e1b3a,#0f172a_55%,#241f4d)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">{children}</div>
    </main>
  );

  if (done) {
    return shell(
      <div className="rounded-3xl bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto w-fit rounded-2xl bg-emerald-400/20 p-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
        </div>
        <h1 className="mt-4 text-xl font-bold">
          {done.alreadyOn ? `${done.petName} is already on the list` : `${done.petName} is on the waitlist`}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          We'll text you if something comes up that suits. You don't need to do anything else —
          and you're welcome to keep your existing booking in the meantime.
        </p>
      </div>,
    );
  }

  // Gated on DATA, not on the absence of an error: between a failed
  // request and its retry a query reports neither, and keying the form
  // off that window shows it to a salon that has this switched off.
  if (!options.data) {
    return shell(
      options.error ? (
        <div className="rounded-3xl bg-card p-8 text-center shadow-2xl">
          <ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
          <h1 className="mt-3 font-semibold">The online waitlist isn't open</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {options.error.data?.code === "FORBIDDEN"
              ? options.error.message
              : "Please give us a call and we'll add you."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-card p-8 text-center text-muted-foreground shadow-2xl">Loading…</div>
      ),
    );
  }

  return shell(
    <>
      <header className="mb-6 text-white">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Clock3 className="h-7 w-7" />Join the waitlist
        </h1>
        <p className="mt-2 text-sm leading-6 text-violet-100">
          Tell us when you'd like to come in and we'll text you the moment something frees up.
          This doesn't book anything or change a booking you already have.
        </p>
      </header>

      <section className="space-y-6 rounded-3xl bg-card p-5 shadow-2xl sm:p-8">
        <div>
          <h2 className="text-lg font-bold">Your dog</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Dog's name</Label>
              <Input className="mt-1.5" value={form.petName} onChange={(e) => set({ petName: e.target.value })} />
            </div>
            <div>
              <Label>Breed <span className="text-muted-foreground">(optional)</span></Label>
              <Input className="mt-1.5" value={form.breed} onChange={(e) => set({ breed: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="border-t pt-5">
          <h2 className="text-lg font-bold">When suits</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>From</Label>
              <Input className="mt-1.5" type="date" value={form.earliestDate}
                onChange={(e) => set({ earliestDate: e.target.value })} />
            </div>
            <div>
              <Label>Until</Label>
              <Input className="mt-1.5" type="date" value={form.latestDate}
                onChange={(e) => set({ latestDate: e.target.value })} />
            </div>
            <div>
              <Label>Time of day</Label>
              <Select value={form.timeOfDay} onValueChange={(v) => set({ timeOfDay: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  <SelectItem value="morning">Mornings</SelectItem>
                  <SelectItem value="afternoon">Afternoons</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Groomer <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={form.preferredStaffId} onValueChange={(v) => set({ preferredStaffId: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="No preference" /></SelectTrigger>
                <SelectContent>
                  {options.data.groomers.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* A preference, not a filter — said out loud so nobody thinks
              naming a groomer means they will hear about nothing else. */}
          <p className="mt-2 text-xs text-muted-foreground">
            If you name a groomer we'll try them first, but we may still offer you another if a spot comes up sooner.
          </p>
        </div>

        <div className="border-t pt-5">
          <h2 className="text-lg font-bold">Your details</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>First name</Label>
              <Input className="mt-1.5" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input className="mt-1.5" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input className="mt-1.5" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div>
              <Label>Email <span className="text-muted-foreground">(optional)</span></Label>
              <Input className="mt-1.5" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <Label>Anything else? <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea className="mt-1.5" rows={2} value={form.note} maxLength={500}
              placeholder="e.g. not Tuesdays, or I can come at short notice"
              onChange={(e) => set({ note: e.target.value })} />
          </div>
        </div>

        {join.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            {join.error.message}
          </p>
        )}

        <div className="border-t pt-5">
          <Button
            className="w-full bg-violet-700 hover:bg-violet-800"
            disabled={!ready || join.isPending}
            onClick={() => join.mutate({
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              phone: form.phone.trim(),
              email: form.email.trim() || undefined,
              petName: form.petName.trim(),
              breed: form.breed.trim() || undefined,
              preferredStaffId: form.preferredStaffId ? Number(form.preferredStaffId) : undefined,
              earliestDate: form.earliestDate,
              latestDate: form.latestDate,
              timeOfDay: form.timeOfDay as any,
              note: form.note.trim() || undefined,
            })}
          >
            {join.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : "Add me to the waitlist"}
          </Button>
          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
            Nothing is booked and nothing is charged. We'll only text you if a spot comes up that fits.
          </p>
        </div>
      </section>
    </>,
  );
}
