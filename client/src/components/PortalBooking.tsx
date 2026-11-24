import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/DateField";
import { getActiveTimeZone } from "@/lib/timezone";
import { brisbaneDateKey } from "@shared/localDateTime";
import { MEMBER_EXTRAS_MESSAGE, PLAN_NOT_USABLE_MESSAGE } from "@shared/portalSelfBooking";

/**
 * Booking from the client portal, and extras on a booking already made.
 *
 * Andy, 24/11/2026: clients book their own dogs and add extras themselves,
 * only into a groomer's free time with 30 minutes clear either side. A
 * member's dog books its plan's groom and nothing else. The server decides
 * all of it (clientPortal.bookingOptions / bookingSlots / createBooking /
 * addExtras); this screen only shows what it is told.
 */

const money = (v: string | null | undefined) => (v === null || v === undefined ? null : `$${Number(v).toFixed(2)}`);
const timeOf = (v: Date | string) => new Date(v).toLocaleTimeString("en-AU", { timeZone: getActiveTimeZone(), hour: "numeric", minute: "2-digit" });
const dayOf = (v: Date | string) => new Date(v).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "long", day: "numeric", month: "long" });

/** Days from today in the salon's calendar, as YYYY-MM-DD. */
function dayKeyFromToday(days: number): string {
  return brisbaneDateKey(new Date(Date.now() + days * 86_400_000));
}

export function PortalBookCard({ token, readOnly, onBook }: { token?: string; readOnly?: boolean; onBook: () => void }) {
  const options = trpc.clientPortal.bookingOptions.useQuery({ token }, { enabled: !readOnly });
  if (readOnly || !options.data?.enabled || options.data.pets.length === 0) return null;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <CalendarPlus className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Book an appointment</h2>
            <p className="text-sm text-muted-foreground">Pick a day and time that suits you. We&rsquo;ll confirm it shortly.</p>
          </div>
        </div>
        <Button size="lg" className="text-base font-bold" onClick={onBook}>Book now</Button>
      </CardContent>
    </Card>
  );
}

export function PortalBookingDialog({ token, open, onClose, onBooked }: { token?: string; open: boolean; onClose: () => void; onBooked: () => void }) {
  const options = trpc.clientPortal.bookingOptions.useQuery({ token }, { enabled: open });
  const [petId, setPetId] = useState<number | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [staffId, setStaffId] = useState("any");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [addOnIds, setAddOnIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setPetId(null); setServiceType(""); setStaffId("any"); setDate(""); setSlot(""); setAddOnIds([]); setNotes("");
  }, [open]);

  const data = options.data;
  const pet = data?.pets.find((p) => p.id === petId) ?? null;
  const petServices = data?.services.find((s) => s.petId === petId)?.services ?? [];
  const member = pet?.planState === "covered";

  // A member's dog has one service, its plan's; choose it for them.
  useEffect(() => {
    if (pet && member && petServices[0]) setServiceType(petServices[0].serviceType);
  }, [pet?.id, member, petServices.length]);

  const slots = trpc.clientPortal.bookingSlots.useQuery(
    { token, petId: petId ?? 0, serviceType, staffId: staffId === "any" ? null : Number(staffId), date },
    { enabled: open && !!petId && !!serviceType && !!date },
  );
  const utils = trpc.useUtils();
  const [findingNext, setFindingNext] = useState(false);
  /** Jump to the first free time, so the client need not hunt for a day. */
  const findNextAvailable = async () => {
    if (!petId || !serviceType) return;
    setFindingNext(true);
    try {
      const next = await utils.clientPortal.bookingNextAvailable.fetch({ token, petId, serviceType, staffId: staffId === "any" ? null : Number(staffId) });
      if (!next) {
        toast.error("No free times in the next 8 weeks. Please contact the salon.");
        return;
      }
      setDate(next.date);
      setSlot(new Date(next.scheduledStart).toISOString());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't look for a time. Please try again.");
    } finally {
      setFindingNext(false);
    }
  };
  const create = trpc.clientPortal.createBooking.useMutation({
    onSuccess: (r) => {
      toast.success(`Booked for ${dayOf(r.scheduledStart)} at ${timeOf(r.scheduledStart)}. We'll confirm it shortly.`);
      if (r.extrasNotAdded?.length) toast.error(`We couldn't add ${r.extrasNotAdded.join(", ")}. Please let us know and we'll add it.`);
      onBooked();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const service = petServices.find((s) => s.serviceType === serviceType);
  const extras = useMemo(() => (data?.addOns ?? []).filter((a) => addOnIds.includes(a.id)), [data?.addOns, addOnIds]);
  const total = service?.price !== null && service?.price !== undefined
    ? Number(service.price) + extras.reduce((sum, a) => sum + Number(a.price), 0)
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Book an appointment</DialogTitle></DialogHeader>
        {!data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Which dog?</Label>
              <div className="flex flex-wrap gap-2">
                {data.pets.map((p) => (
                  <Button key={p.id} type="button" variant={petId === p.id ? "default" : "outline"} aria-pressed={petId === p.id}
                    onClick={() => { setPetId(p.id); setServiceType(""); setSlot(""); setAddOnIds([]); }}>
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>

            {pet && pet.planState === "on_plan_not_usable" && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{PLAN_NOT_USABLE_MESSAGE}</p>
            )}
            {pet && pet.planState !== "on_plan_not_usable" && petServices.length === 0 && (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">We need {pet.name}&rsquo;s size before booking online. Please contact the salon.</p>
            )}

            {pet && pet.planState !== "on_plan_not_usable" && petServices.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label>Service</Label>
                  {member ? (
                    <div className="rounded-md border bg-muted/40 p-3 text-sm">
                      <p className="font-medium">{service?.label ?? "Membership groom"} · included in your membership</p>
                      <p className="mt-1 text-muted-foreground">{MEMBER_EXTRAS_MESSAGE}</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {petServices.map((s) => (
                        <button key={s.serviceType} type="button" aria-pressed={serviceType === s.serviceType}
                          onClick={() => { setServiceType(s.serviceType); setSlot(""); }}
                          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${serviceType === s.serviceType ? "border-primary bg-primary/10" : "hover:bg-accent"}`}>
                          <span className="font-medium">{s.label}</span>
                          <span className="text-muted-foreground">{money(s.price) ?? "Price on the day"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {serviceType && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Groomer</Label>
                        <Select value={staffId} onValueChange={(v) => { setStaffId(v); setSlot(""); }}>
                          <SelectTrigger aria-label="Groomer"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">No preference</SelectItem>
                            {data.groomers.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Date</Label>
                        <DateField value={date} min={dayKeyFromToday(1)} max={dayKeyFromToday(90)} onChange={(next) => { setDate(next); setSlot(""); }} />
                      </div>
                    </div>
                    <Button type="button" variant="outline" className="w-full gap-2" disabled={findingNext} onClick={findNextAvailable}>
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                      {findingNext ? "Finding the next free time…" : "Book next available"}
                    </Button>

                    {date && (
                      <div className="space-y-1.5">
                        <Label>Available times</Label>
                        {slots.isLoading ? (
                          <p className="text-sm text-muted-foreground">Checking availability…</p>
                        ) : slots.data && slots.data.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2">
                            {slots.data.map((s) => {
                              const iso = new Date(s.scheduledStart).toISOString();
                              return (
                                <button key={iso} type="button" aria-pressed={slot === iso} onClick={() => setSlot(iso)}
                                  className={`rounded-md border px-2 py-1.5 text-sm ${slot === iso ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                                  {timeOf(s.scheduledStart)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No times free that day. Try another date, or contact the salon.</p>
                        )}
                      </div>
                    )}

                    {!member && data.addOns.length > 0 && (
                      <ExtrasPicker addOns={data.addOns} selected={addOnIds} onChange={setAddOnIds} />
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="pb-notes">Anything we should know? (optional)</Label>
                      <Textarea id="pb-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    {slot && (
                      <div className="rounded-md border bg-muted/40 p-3 text-sm">
                        <p className="font-medium">{pet.name} · {service?.label} · {dayOf(slot)} at {timeOf(slot)}</p>
                        {extras.length > 0 && <p className="text-muted-foreground">Extras: {extras.map((a) => a.name).join(", ")}</p>}
                        <p className="mt-1">{member ? "Included in your membership." : total !== null ? `Estimated total ${money(total.toFixed(2))}` : "We'll confirm the price on the day."}</p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!pet || !serviceType || !slot || create.isPending}
            onClick={() => pet && create.mutate({ token, petId: pet.id, serviceType, staffId: staffId === "any" ? null : Number(staffId), scheduledStart: new Date(slot), addOnIds, notes: notes.trim() || undefined })}
          >
            {create.isPending ? "Booking…" : "Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtrasPicker({ addOns, selected, onChange }: {
  addOns: { id: number; name: string; description: string | null; price: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Extras (optional)</legend>
      <div className="grid gap-2">
        {addOns.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <span className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
              <span>
                <span className="font-medium">{a.name}</span>
                {a.description && <span className="block text-xs text-muted-foreground">{a.description}</span>}
              </span>
            </span>
            <span className="shrink-0 text-muted-foreground">{money(a.price)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Extras onto a booking already made. Not for a member's groom. */
export function PortalAddExtrasDialog({ token, appointment, onClose, onAdded }: {
  token?: string;
  appointment: { id: number; petId: number; petName: string } | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const options = trpc.clientPortal.bookingOptions.useQuery({ token }, { enabled: !!appointment });
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => { setSelected([]); }, [appointment?.id]);
  const add = trpc.clientPortal.addExtras.useMutation({
    onSuccess: (r) => { toast.success(r.added.length ? `Added: ${r.added.join(", ")}` : "Those extras were already on the booking."); onAdded(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const pet = options.data?.pets.find((p) => p.id === appointment?.petId);
  const memberDog = pet?.planState === "covered" || pet?.planState === "on_plan_not_usable";
  return (
    <Dialog open={!!appointment} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Add extras for {appointment?.petName}</DialogTitle></DialogHeader>
        {!options.data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : memberDog ? (
          <p className="text-sm text-muted-foreground">{MEMBER_EXTRAS_MESSAGE}</p>
        ) : options.data.addOns.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no extras to add online. Please contact the salon.</p>
        ) : (
          <ExtrasPicker addOns={options.data.addOns} selected={selected} onChange={setSelected} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!memberDog && (
            <Button disabled={selected.length === 0 || add.isPending} onClick={() => appointment && add.mutate({ token, appointmentId: appointment.id, addOnIds: selected })}>
              {add.isPending ? "Adding…" : "Add extras"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
