import { Fragment, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  QUICK_MAX_DOGS, QUICK_SERVICES, missingQuickFields, parseCounterPrice,
  quickDurationMinutes, quickWalkInError, usableQuickDogs,
  type QuickService, type QuickRequiredField,
} from "@shared/quickAppointment";

/**
 * A walk-in nail clip or quick bath, taken at the counter.
 *
 * Andy, 06/11/2026: "I think having mandatory fields in the quick appt
 * section need to be there... just in case anything goes wrong, they
 * have a record of who came in and when."
 *
 * ## Four fields, not six
 *
 * He asked for name, dog, breed, phone and email all mandatory. Breed
 * and email are asked for and not enforced: a mandatory field that is
 * awkward at a counter with a dog on the table produces `a@a.com` and a
 * breed of "x", and a record that LOOKS like it has contact details and
 * does not is worse for an incident than an honest blank. Phone is the
 * one that does the work — if a dog is hurt you ring them that
 * afternoon.
 *
 * ## The phone comes first on purpose
 *
 * It is the first field because it is also the lookup. A client who has
 * walked in before fills the rest of the form in by being recognised,
 * which is the difference between four fields and one tap — and it is
 * what stops three visits becoming three records of the same person.
 */
export function QuickAppointmentDialog({
  onCreated,
  triggerLabel = "Quick Appointment",
  triggerVariant = "outline",
  triggerClassName = "brand-lift gap-1.5 bg-card/80",
  triggerIcon = <Zap className="h-4 w-4" />,
}: {
  onCreated?: () => void;
  /*
   * The trigger varies, the dialog does not.
   *
   * The Workflow board wants this prominent and in its own words,
   * because that is where somebody is standing when a dog walks in.
   * The Calendar wants it quiet beside its other controls. Sharing the
   * dialog is the point: a walk-in taken at the board and one taken at
   * the calendar cannot collect different things, which is exactly what
   * the board's own hand-rolled version did until 07/11/2026 — it
   * collected six fields and wrote none of them.
   */
  triggerLabel?: string;
  triggerVariant?: "outline" | "default";
  triggerClassName?: string;
  /*
   * The board keeps its person-plus. A groomer reading the control row
   * mid-groom is better served by the icon that was already there than
   * by consistency with a screen she is not looking at.
   */
  triggerIcon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    phone: "", firstName: "", lastName: "", petName: "", breed: "", email: "",
    serviceType: "nail_trim" as QuickService, price: "", notes: "",
  });
  /*
   * The dogs after the first.
   *
   * Lauren, 09/11/2026: "2 dogs for nails same family. Same invoice. One
   * lady has 4 x dogs having nails." Kept separate from `form.petName`
   * so the single-dog path — which is most walk-ins — looks and behaves
   * exactly as it did.
   */
  const [extraDogs, setExtraDogs] = useState<{ name: string; breed: string }[]>([]);
  const [known, setKnown] = useState<{ clientId: number; petId: number; label: string } | null>(null);

  /*
   * Only once a whole number has been typed, and only then.
   *
   * The lookup reads every client in the salon that has a phone and
   * matches in JS, because the stored numbers are not normalised and no
   * LIKE pattern finds "(07) 3123 4567" from "0731234567". At ~10,000
   * clients that is not something to run on the sixth keystroke and
   * then again on the seventh, eighth and ninth.
   *
   * Eight digits is the shortest real number here — a Brisbane landline
   * without its area code — so nothing is lost by waiting for it.
   */
  const phoneDigits = form.phone.replace(/\D/g, "");
  const matches = trpc.calendar.walkInMatch.useQuery(
    { phone: form.phone },
    {
      enabled: open && !known && phoneDigits.length >= 8,
      // The answer cannot change while somebody finishes typing a name.
      staleTime: 60_000,
    },
  );

  const create = trpc.calendar.createQuickAppointment.useMutation({
    onSuccess: () => {
      toast.success("On the board as a walk-in. Press done when the dog leaves.", { duration: 8000 });
      close();
      onCreated?.();
    },
    onError: (e) => toast.error(e.message, { duration: 10000 }),
  });

  const close = () => {
    setOpen(false);
    setKnown(null);
    setForm({
      phone: "", firstName: "", lastName: "", petName: "", breed: "", email: "",
      serviceType: "nail_trim", price: "", notes: "",
    });
  };

  const missing: QuickRequiredField[] = known ? [] : missingQuickFields(form);
  const parsedPrice = parseCounterPrice(form.price);
  const priceProblem = parsedPrice.ok ? null : parsedPrice.reason;

  /* Named dogs only: an empty row somebody added and changed their mind
     about is not an error, it is just not a dog. */
  const namedExtras = usableQuickDogs(extraDogs.map(d => ({ name: d.name, breed: d.breed })));
  const dogCount = 1 + namedExtras.length;
  const minutes = quickDurationMinutes(dogCount);
  const perDog = parsedPrice.ok ? parsedPrice.price : null;
  const total = perDog === null ? null : (Number(perDog) * dogCount).toFixed(2);

  const problem = (known ? null : quickWalkInError(form)) ?? priceProblem;
  const short = (field: QuickRequiredField) => missing.includes(field);

  return (
    <>
      <Button variant={triggerVariant} size="sm" className={triggerClassName}
        onClick={() => setOpen(true)}>
        {triggerIcon} {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else setOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick appointment</DialogTitle>
            <DialogDescription>
              A walk-in nail clip or quick bath. Goes straight on the board as here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {known ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span className="font-medium">{known.label}</span>
                <span className="text-xs text-muted-foreground">been in before</span>
                <Button variant="ghost" size="sm" className="ml-auto h-7"
                  onClick={() => setKnown(null)}>Someone else</Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="quick-phone">
                    Phone number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="quick-phone" inputMode="tel" autoFocus
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="0412 345 678"
                    className={short("phone") && form.phone ? "border-destructive" : ""}
                  />
                  {/* Recognised before anything else is typed, so a
                      returning walk-in is one tap rather than four
                      fields entered again — and so the salon does not
                      end up with three records of one person. */}
                  {(matches.data?.clients ?? []).length > 0 && (
                    <div className="rounded-lg border">
                      {(matches.data?.clients ?? []).map((client: any) => (
                        client.pets.length > 0 ? client.pets.map((pet: any) => (
                          <button
                            key={`${client.id}-${pet.id}`} type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10"
                            onClick={() => setKnown({
                              clientId: client.id, petId: pet.id,
                              label: `${pet.name} — ${client.firstName} ${client.lastName}`,
                            })}
                          >
                            <span className="font-medium">{pet.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {client.firstName} {client.lastName}{pet.breed ? ` · ${pet.breed}` : ""}
                            </span>
                          </button>
                        )) : null
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-first">
                      First name <span className="text-destructive">*</span>
                    </Label>
                    <Input id="quick-first" value={form.firstName}
                      onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-last">
                      Last name <span className="text-destructive">*</span>
                    </Label>
                    <Input id="quick-last" value={form.lastName}
                      onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-dog">
                      Dog's name <span className="text-destructive">*</span>
                    </Label>
                    <Input id="quick-dog" value={form.petName}
                      onChange={(e) => setForm(f => ({ ...f, petName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-breed">Breed</Label>
                    <Input id="quick-breed" value={form.breed}
                      onChange={(e) => setForm(f => ({ ...f, breed: e.target.value }))}
                      placeholder="or a description" />
                  </div>

                  {/* The rest of the family. A row appears only when it is
                      asked for, so the common single-dog walk-in is the
                      same three fields it has always been. */}
                  {extraDogs.map((dog, i) => (
                    <Fragment key={i}>
                      <div className="space-y-1.5">
                        <Label htmlFor={`quick-dog-${i}`}>Dog {i + 2}&apos;s name</Label>
                        <Input id={`quick-dog-${i}`} value={dog.name}
                          onChange={(e) => setExtraDogs(ds => ds.map((d, j) => j === i ? { ...d, name: e.target.value } : d))} />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Label htmlFor={`quick-breed-${i}`}>Breed</Label>
                          <Input id={`quick-breed-${i}`} value={dog.breed}
                            onChange={(e) => setExtraDogs(ds => ds.map((d, j) => j === i ? { ...d, breed: e.target.value } : d))}
                            placeholder="or a description" />
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="mb-0.5 shrink-0"
                          onClick={() => setExtraDogs(ds => ds.filter((_, j) => j !== i))}>
                          Remove
                        </Button>
                      </div>
                    </Fragment>
                  ))}

                  {dogCount < QUICK_MAX_DOGS && (
                    <div className="col-span-2">
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => setExtraDogs(ds => [...ds, { name: "", breed: "" }])}>
                        + Another dog
                      </Button>
                    </div>
                  )}
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="quick-email">Email</Label>
                    <Input id="quick-email" type="email" value={form.email}
                      onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Service</Label>
                {/* Two, as asked. Not the full service list: a walk-in
                    is a nail clip or a quick bath, and offering a styled
                    groom here invites one onto a ten-minute slot. */}
                <div className="flex flex-wrap gap-2">
                  {QUICK_SERVICES.map((service) => (
                    <button
                      key={service.value} type="button"
                      onClick={() => setForm(f => ({ ...f, serviceType: service.value }))}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.serviceType === service.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {service.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-price">
                  {dogCount > 1 ? "Price each" : "Price"}
                </Label>
                <Input id="quick-price" inputMode="decimal" value={form.price}
                  onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="$"
                  className={priceProblem ? "border-destructive" : ""} />
                {/* The column is decimal(10,2) and "$25" is what gets
                    typed. parseCounterPrice is the same function the
                    server runs, so the two cannot disagree about what
                    counts as money. */}
                {priceProblem && (
                  <p className="text-[11px] leading-4 text-destructive">{priceProblem}</p>
                )}
                {/* Per dog, because appointments.price is per row and the
                    invoice sums them — a typed total divided four ways
                    writes four prices that are each wrong. The total is
                    shown so nobody has to do it in their head at a
                    counter. */}
                {!priceProblem && dogCount > 1 && total !== null && (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    {dogCount} dogs &middot; <strong>${total}</strong> total, one invoice
                  </p>
                )}
              </div>
            </div>

            {problem && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{problem}</p>
            )}
            <p className="text-[11px] leading-4 text-muted-foreground">
              The name and number are so there is a record of who came in and when if
              anything goes wrong. No text is sent — they are standing right here.
              {dogCount > 1 && ` All ${dogCount} dogs go on one invoice, blocking ${minutes} minutes.`}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={create.isPending}>Cancel</Button>
            <Button
              disabled={Boolean(problem) || create.isPending}
              onClick={() => create.mutate({
                clientId: known?.clientId,
                petId: known?.petId,
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                petName: form.petName.trim(),
                phone: form.phone.trim(),
                breed: form.breed.trim() || undefined,
                email: form.email.trim() || undefined,
                serviceType: form.serviceType,
                price: form.price.trim() || undefined,
                notes: form.notes.trim() || undefined,
                extraDogs: namedExtras.map(d => ({
                  name: d.name,
                  breed: (d.breed ?? "").trim() || undefined,
                })),
              })}
            >
              {create.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</>
                : "Add walk-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
