import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, CreditCard, PawPrint, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MAX_SIGNUP_DOGS } from "@shared/membershipSignup";

/**
 * Joining a membership without ringing the salon.
 *
 * The page is one scrolling form rather than a wizard. A membership is a
 * weekly charge and a year of appointments, and a client agreeing to that
 * should be able to see the whole commitment at once instead of meeting
 * the price on step four.
 *
 * It says twice, in the two places it matters, that nothing is charged
 * until the salon approves: next to the card button and on the summary.
 * The sign-up takes a card so billing can start the moment somebody says
 * yes, and a client who does not know that reads the form as a purchase.
 */

type DogForm = { key: string; name: string; breed: string; weightKg: string; packageId: string };

const emptyDog = (): DogForm => ({
  key: Math.random().toString(36).slice(2),
  name: "", breed: "", weightKg: "", packageId: "",
});

/**
 * One dog's membership choices.
 *
 * Its own component because the package list depends on the weight, which
 * means a query per dog — and a query inside a loop in the parent breaks
 * the rules of hooks the moment a dog is removed from the middle.
 */
function DogRow({
  dog, index, canRemove, onChange, onRemove,
}: {
  dog: DogForm;
  index: number;
  canRemove: boolean;
  onChange: (next: Partial<DogForm>) => void;
  onRemove: () => void;
}) {
  const weight = Number(dog.weightKg);
  const weightUsable = Number.isFinite(weight) && weight > 0;
  const packages = trpc.membershipSignup.packagesForWeight.useQuery(
    { weightKg: weight },
    { enabled: weightUsable },
  );

  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <PawPrint className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          {dog.name.trim() || `Dog ${index + 1}`}
        </h3>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove dog ${index + 1}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Name</Label>
          <Input className="mt-1.5" value={dog.name} placeholder="Rosie"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div>
          <Label>Breed <span className="text-muted-foreground">(optional)</span></Label>
          <Input className="mt-1.5" value={dog.breed} placeholder="Cavoodle"
            onChange={(e) => onChange({ breed: e.target.value })} />
        </div>
        <div>
          <Label>Weight (kg)</Label>
          <Input className="mt-1.5" type="number" min="1" max="80" step="0.1"
            value={dog.weightKg} placeholder="14.5"
            // Changing the weight changes which memberships are available,
            // so the chosen one has to go rather than silently become a
            // package this dog no longer qualifies for.
            onChange={(e) => onChange({ weightKg: e.target.value, packageId: "" })} />
        </div>
      </div>

      <div className="mt-3">
        <Label>Membership</Label>
        {!weightUsable ? (
          <p className="mt-1.5 text-sm text-muted-foreground">Enter a weight to see the memberships for this dog.</p>
        ) : packages.isLoading ? (
          <p className="mt-1.5 text-sm text-muted-foreground">Loading memberships…</p>
        ) : !packages.data?.length ? (
          <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-300">
            We do not have a membership price for a dog of {dog.weightKg} kg — please call us and we'll sort it out.
          </p>
        ) : (
          <>
            <Select value={dog.packageId} onValueChange={(value) => onChange({ packageId: value })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a membership" /></SelectTrigger>
              <SelectContent>
                {packages.data.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} — ${pkg.weeklyPrice.toFixed(2)}/week, every {pkg.appointmentIntervalWeeks} weeks
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              All your dogs need the same visit frequency so they can come in together.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function MembershipSignup() {
  // No retry: this fails with FORBIDDEN when the salon has not switched
  // sign-up on, and retrying does not change that — it only keeps the page
  // on a spinner through three rounds of backoff.
  const options = trpc.membershipSignup.getOptions.useQuery({}, { retry: false });
  const [dogs, setDogs] = useState<DogForm[]>([emptyDog()]);
  const [details, setDetails] = useState({ firstName: "", lastName: "", phone: "", email: "", note: "" });
  const [staffId, setStaffId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [done, setDone] = useState<{ cardSetupUrl: string | null; weeklyTotal: number } | null>(null);

  const maxDogs = options.data?.maxDogs ?? MAX_SIGNUP_DOGS;

  /** Only complete dogs go to the quote, so it does not flash errors while typing. */
  const quotableDogs = useMemo(
    () => dogs
      .filter((d) => d.name.trim() && d.packageId && Number(d.weightKg) > 0)
      .map((d) => ({ name: d.name.trim(), weightKg: Number(d.weightKg), packageId: d.packageId })),
    [dogs],
  );
  const quote = trpc.membershipSignup.quote.useQuery(
    { dogs: quotableDogs },
    { enabled: quotableDogs.length > 0 && quotableDogs.length === dogs.length },
  );
  const priced = quote.data?.ok ? quote.data : null;

  // The slot list is the salon's real availability, the same one the guest
  // booking page reads. The heaviest dog sets the length: a visit has to
  // fit the dog that takes longest.
  const heaviest = Math.max(0, ...dogs.map((d) => Number(d.weightKg) || 0));
  const serviceType = priced?.lines[0]?.serviceType === "styled" ? "styled_groom" : "classic_groom";
  const canLoadSlots = Boolean(staffId && selectedDate && heaviest > 0 && priced);
  const slots = trpc.onlineBooking.listAvailableSlots.useQuery(
    { staffId: Number(staffId), serviceType: serviceType as any, petWeightKg: heaviest, date: selectedDate },
    { enabled: canLoadSlots },
  );

  const submit = trpc.membershipSignup.submit.useMutation({
    onSuccess: (result) => {
      setDone({ cardSetupUrl: result.cardSetupUrl, weeklyTotal: result.weeklyTotal });
      toast.success("Membership request sent");
    },
    onError: (error) => toast.error(error.message),
  });

  const ready = Boolean(
    priced && scheduledStart && details.firstName.trim() && details.lastName.trim() && details.phone.trim(),
  );

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-violet-950 px-5 py-12 text-white">
        <div className="max-w-md rounded-3xl border border-violet-300/30 bg-white/10 p-8 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto w-fit rounded-2xl bg-emerald-400/20 p-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-300" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Request sent</h1>
          <p className="mt-2 text-sm leading-6 text-violet-50">
            The salon will confirm your membership and book your appointments for the next 12 months.
            We'll be in touch shortly.
          </p>
          {done.cardSetupUrl && (
            <>
              <Button asChild className="mt-6 w-full bg-white text-violet-900 hover:bg-violet-50">
                <a href={done.cardSetupUrl}><CreditCard className="mr-2 h-4 w-4" />Add your card</a>
              </Button>
              <p className="mt-3 text-xs leading-5 text-violet-200">
                Your card is saved now so billing can start as soon as the salon confirms.
                Nothing is charged until then — ${done.weeklyTotal.toFixed(2)} a week once it does.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#5b21b688,_transparent_40%),linear-gradient(135deg,#1e1b3a,#0f172a_55%,#241f4d)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-white">
          <h1 className="text-3xl font-bold">Join a grooming membership</h1>
          <p className="mt-2 text-sm leading-6 text-violet-100">
            One weekly payment, regular grooms booked in for the year ahead, and the same groomer every time.
          </p>
        </header>

        {/* Gated on DATA, not on the absence of an error. Between a failed
            attempt and the next retry a query reports neither loading nor
            an error, and keying the form off that window renders the whole
            thing — price, slots, submit button — for a salon that has
            sign-up switched off. */}
        {!options.data ? (
          options.error ? (
            <section className="rounded-3xl bg-card p-8 text-center shadow-2xl">
              <ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
              <h2 className="mt-3 font-semibold">Online sign-up is not open yet</h2>
              {/* Only the salon's own "not switched on" message is shown.
                  Anything else is a fault, and a tRPC error message is raw
                  server text — a failing query here put the SQL it tried,
                  column names and all, on a page open to the public. */}
              <p className="mt-1 text-sm text-muted-foreground">
                {options.error.data?.code === "FORBIDDEN"
                  ? options.error.message
                  : "We could not load the memberships just now. Please give us a call and we'll get you set up."}
              </p>
            </section>
          ) : (
            <section className="rounded-3xl bg-card p-8 text-center text-muted-foreground shadow-2xl">Loading…</section>
          )
        ) : (
          <section className="space-y-6 rounded-3xl bg-card p-5 shadow-2xl sm:p-8">
            <div>
              <h2 className="text-xl font-bold">Your dogs</h2>
              <div className="mt-4 space-y-4">
                {dogs.map((dog, index) => (
                  <DogRow
                    key={dog.key} dog={dog} index={index} canRemove={dogs.length > 1}
                    onChange={(next) => setDogs((all) => all.map((d) => (d.key === dog.key ? { ...d, ...next } : d)))}
                    onRemove={() => setDogs((all) => all.filter((d) => d.key !== dog.key))}
                  />
                ))}
              </div>
              {dogs.length < maxDogs && (
                <Button variant="outline" className="mt-4" onClick={() => setDogs((all) => [...all, emptyDog()])}>
                  <Plus className="mr-2 h-4 w-4" />Add another dog
                </Button>
              )}
            </div>

            {quote.data && !quote.data.ok && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <ul className="list-inside list-disc space-y-1">
                  {quote.data.problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
              </div>
            )}

            {priced && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/40">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-2xl font-bold tabular-nums">${priced.weeklyTotal.toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground">
                    a week · a groom every {priced.intervalWeeks} weeks · {priced.visitsPerYear}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {priced.lines.map((line) => (
                    <li key={line.petName} className="flex justify-between gap-3">
                      <span>{line.petName} — {line.packageName}</span>
                      <span className="tabular-nums">${line.weeklyPrice.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-6">
              <h2 className="text-xl font-bold">Your groomer and first appointment</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Groomer</Label>
                  <Select value={staffId} onValueChange={(value) => { setStaffId(value); setScheduledStart(""); }}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a groomer" /></SelectTrigger>
                    <SelectContent>
                      {options.data?.groomers.map((groomer) => (
                        <SelectItem key={groomer.id} value={String(groomer.id)}>{groomer.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>First appointment</Label>
                  <Input className="mt-1.5" type="date" value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); setScheduledStart(""); }} />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-950/50 dark:bg-violet-950/50">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                  <h3 className="font-semibold">Available times</h3>
                </div>
                {!canLoadSlots ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose your dogs' memberships, a groomer and a date to see what's free.
                  </p>
                ) : slots.isLoading ? (
                  <p className="mt-2 text-sm text-muted-foreground">Checking the diary…</p>
                ) : !slots.data?.length ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nothing free that day — try another date.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {slots.data.map((slot) => {
                      const value = new Date(slot.scheduledStart).toISOString();
                      const label = new Date(slot.scheduledStart).toLocaleTimeString("en-AU", {
                        hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane",
                      });
                      return (
                        <Button key={value} type="button" size="sm"
                          variant={scheduledStart === value ? "default" : "outline"}
                          onClick={() => setScheduledStart(value)}>{label}</Button>
                      );
                    })}
                  </div>
                )}
                {scheduledStart && priced && (
                  <p className="mt-3 text-sm text-violet-700 dark:text-violet-300">
                    We'll book this time every {priced.intervalWeeks} weeks for the next
                    {" "}{options.data?.monthsAhead ?? 12} months. If one lands on a day your groomer is away,
                    we'll move that single visit to the nearest free time and tell you.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t pt-6">
              <h2 className="text-xl font-bold">Your details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>First name</Label>
                  <Input className="mt-1.5" value={details.firstName}
                    onChange={(e) => setDetails((d) => ({ ...d, firstName: e.target.value }))} />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input className="mt-1.5" value={details.lastName}
                    onChange={(e) => setDetails((d) => ({ ...d, lastName: e.target.value }))} />
                </div>
                <div>
                  <Label>Mobile</Label>
                  <Input className="mt-1.5" value={details.phone}
                    onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Email <span className="text-muted-foreground">(optional)</span></Label>
                  <Input className="mt-1.5" type="email" value={details.email}
                    onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))} />
                </div>
              </div>
              <div className="mt-4">
                <Label>Anything we should know? <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea className="mt-1.5" rows={3} value={details.note}
                  onChange={(e) => setDetails((d) => ({ ...d, note: e.target.value }))} />
              </div>
            </div>

            <div className="border-t pt-6">
              <Button
                className="w-full bg-violet-700 hover:bg-violet-800"
                disabled={!ready || submit.isPending}
                onClick={() => submit.mutate({
                  firstName: details.firstName.trim(),
                  lastName: details.lastName.trim(),
                  phone: details.phone.trim(),
                  email: details.email.trim() || undefined,
                  dogs: dogs.map((d) => ({
                    name: d.name.trim(),
                    breed: d.breed.trim() || undefined,
                    weightKg: Number(d.weightKg),
                    packageId: d.packageId,
                  })),
                  staffId: Number(staffId),
                  scheduledStart: new Date(scheduledStart),
                  note: details.note.trim() || undefined,
                })}
              >
                {submit.isPending ? "Sending…" : "Request this membership"}
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                Nothing is charged and no appointments are held until the salon confirms your membership.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
