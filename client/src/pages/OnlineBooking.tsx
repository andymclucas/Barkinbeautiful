import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateField";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getEligibleOnlineBookingServices,
  getPetWeightBand,
  getWeightEligibilityMessage,
} from "@shared/onlineBookingWeightEligibility";
import {
  ONLINE_BOOKING_DATE_FIELD_LAYOUT,
  ONLINE_BOOKING_TOP_ROW_GRID,
} from "@/lib/onlineBookingFormLayout";
import { getBookingGroomerDisplayName } from "../../../shared/bookingGroomerDisplay";
import { getActiveTimeZone } from "@/lib/timezone";
import { OnlineBookingEstimate } from "@/components/OnlineBookingEstimate";
import { ExistingClientPortalLink } from "@/components/ExistingClientPortalLink";

import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";
import { SalonLogo } from "@/components/SalonLogo";
import { salonName } from "@shared/salonBrand";
import { GroomigoLogo } from "@/components/GroomigoLogo";

/**
 * "Powered by" over the standard Groomigo logo: the teal dog with the
 * word underneath (Andy, 17/11/2026, "in all instances"). Andy,
 * 26/11/2026: the booking page showed a stock paw icon and plain text
 * instead, and he asked for "the actual Groomigo logo with the correct
 * colours", at the top right and again at the bottom of the page.
 *
 * Always the white-lettered drawing: this page's background is the dark
 * gradient whatever the visitor's light or dark mode.
 */
/** `form.staffId` when the client has no preferred groomer. */
const ANY_GROOMER = "any";

function PoweredByGroomigo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`} data-testid="powered-by-groomigo">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-violet-200/80">Powered by</span>
      <GroomigoLogo tone="on-dark" height={64} />
    </div>
  );
}
export default function OnlineBooking({ previewMode = false }: { previewMode?: boolean }) {
  // This page is sent to the salon's own clients, so it wears the
  // salon's colours rather than stock Groomigo ones.
  const publicBrand = usePublicBrandTheme();
  const salon = { name: publicBrand.salonName, logoUrl: publicBrand.logoUrl };
  const publicProfiles = trpc.onlineBooking.listGroomerProfiles.useQuery({}, { enabled: !previewMode });
  const previewProfiles = trpc.onlineBooking.listPreviewGroomerProfiles.useQuery({}, { enabled: previewMode });
  const groomers = previewMode ? previewProfiles.data : publicProfiles.data;
  const isLoading = previewMode ? previewProfiles.isLoading : publicProfiles.isLoading;
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", petName: "", breed: "", weightKg: "", staffId: "", serviceType: "classic_groom", scheduledStart: "", notes: "" });
  const [selectedDate, setSelectedDate] = useState("");
  const [complete, setComplete] = useState(false);
  const create = trpc.onlineBooking.createGuest.useMutation({
    onSuccess: (result) => { setBookedEstimate({ price: result.estimatePrice, disclaimer: result.disclaimer }); setComplete(true); toast.success("Booking request received"); },
    onError: error => toast.error(error.message),
  });
  const createPreview = trpc.onlineBooking.createPreviewGuest.useMutation({
    onSuccess: (result) => { setBookedEstimate({ price: result.estimatePrice, disclaimer: result.disclaimer }); setComplete(true); toast.success("Preview test booking created"); },
    onError: error => toast.error(error.message),
  });
  const selectedWeightBand = getPetWeightBand(form.weightKg);
  // The estimate depends on exactly two things the client has typed: the
  // weight and the service. Both are in the query key, so changing either
  // re-prices rather than leaving a stale figure on screen next to a new
  // selection — which would be the one bug here that costs money.
  const estimate = trpc.onlineBooking.priceEstimate.useQuery(
    { serviceType: form.serviceType as any, weightKg: Number(form.weightKg) },
    { enabled: Boolean(selectedWeightBand) },
  );
  // Held at submit time so the success screen quotes what was actually
  // booked, not whatever the form has been edited to since.
  const [bookedEstimate, setBookedEstimate] = useState<{ price: string | null; disclaimer: string | null } | null>(null);
  const serviceOptions = getEligibleOnlineBookingServices(form.weightKg);
  /**
   * "No preferred groomer" (Andy, 26/11/2026: "if people are new, or don't
   * mind, they can just try and take the next available appointment").
   * `form.staffId` holds ANY_GROOMER for that choice. A booking still names
   * a groomer, so the one who is free at the chosen time is kept beside it
   * in `slotStaffId` and sent when the request is made.
   */
  const anyGroomer = form.staffId === ANY_GROOMER;
  const [slotStaffId, setSlotStaffId] = useState<number | null>(null);
  const canLoadSlots = Boolean(form.staffId && selectedWeightBand && selectedDate);
  const slotInput = { staffId: anyGroomer ? 0 : Number(form.staffId), serviceType: form.serviceType as any, petWeightKg: Number(form.weightKg), date: selectedDate };
  const anySlotInput = { serviceType: form.serviceType as any, petWeightKg: Number(form.weightKg), date: selectedDate };
  const publicSlots = trpc.onlineBooking.listAvailableSlots.useQuery(slotInput, { enabled: !previewMode && canLoadSlots && !anyGroomer });
  const previewSlots = trpc.onlineBooking.listPreviewAvailableSlots.useQuery(slotInput, { enabled: previewMode && canLoadSlots && !anyGroomer });
  const publicAnySlots = trpc.onlineBooking.listAvailableSlotsAnyGroomer.useQuery(anySlotInput, { enabled: !previewMode && canLoadSlots && anyGroomer });
  const previewAnySlots = trpc.onlineBooking.listPreviewAvailableSlotsAnyGroomer.useQuery(anySlotInput, { enabled: previewMode && canLoadSlots && anyGroomer });
  const slotSource = anyGroomer ? (previewMode ? previewAnySlots : publicAnySlots) : (previewMode ? previewSlots : publicSlots);
  const availableSlots: Array<{ scheduledStart: Date | string; staffId?: number }> | undefined = slotSource.data;
  const slotsLoading = slotSource.isLoading;
  /** The groomer the request will name: the chosen one, or whoever is free at the chosen time. */
  const bookingStaffId = anyGroomer ? slotStaffId : form.staffId ? Number(form.staffId) : null;
  const matchedGroomer = anyGroomer && slotStaffId ? groomers?.find(groomer => groomer.id === slotStaffId) : undefined;
  const creating = previewMode ? createPreview.isPending : create.isPending;
  const utils = trpc.useUtils();
  const [findingNext, setFindingNext] = useState(false);
  /**
   * Jump to the first free time, so a client need not guess a day (Andy,
   * 26/11/2026). Needs only the dog's weight and the service: with no
   * groomer chosen it searches all of them and picks whoever is free first.
   */
  const findNextAvailable = async () => {
    if (!selectedWeightBand) return;
    setFindingNext(true);
    try {
      const searchAll = anyGroomer || !form.staffId;
      const input = { staffId: searchAll ? null : Number(form.staffId), serviceType: form.serviceType as any, petWeightKg: Number(form.weightKg) };
      const next = previewMode
        ? await utils.onlineBooking.previewNextAvailable.fetch(input)
        : await utils.onlineBooking.nextAvailable.fetch(input);
      if (!next) {
        toast.error(!searchAll ? "No free times with this groomer in the next 8 weeks. Try another groomer, or contact the salon." : "No free times in the next 8 weeks. Please contact the salon.");
        return;
      }
      setSelectedDate(next.date);
      // With no groomer chosen the choice becomes "No preferred groomer",
      // and the groomer who is free is shown beside the time.
      setSlotStaffId(next.staffId);
      setForm(p => ({ ...p, staffId: searchAll ? ANY_GROOMER : p.staffId, scheduledStart: new Date(next.scheduledStart).toISOString() }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't look for a time. Please try again.");
    } finally {
      setFindingNext(false);
    }
  };
  const submitRequest = () => {
    const input = { firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email, petName: form.petName, breed: form.breed || undefined, weightKg: Number(form.weightKg), staffId: bookingStaffId ?? 0, serviceType: form.serviceType as any, scheduledStart: new Date(form.scheduledStart), notes: form.notes || undefined };
    if (!bookingStaffId) return;
    if (previewMode) createPreview.mutate(input); else create.mutate(input);
  };
  if (complete) return <main className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-950 to-violet-950 flex items-center justify-center px-5 py-12 text-white"><div className="max-w-md text-center rounded-3xl border border-violet-300/30 dark:border-violet-800/30 bg-white/10 backdrop-blur p-8 shadow-2xl"><div className="mx-auto w-fit rounded-2xl bg-emerald-400/20 p-4"><CheckCircle2 className="h-10 w-10 text-emerald-300" /></div><h1 className="mt-5 text-2xl font-bold">{previewMode ? "Preview booking recorded" : "Booking request received"}</h1><p className="mt-3 text-violet-100">{previewMode ? "This is a marked preview test. No client message, automatic confirmation or live booking release has occurred." : `Thank you. We have reserved your requested time pending confirmation from ${salonName(salon, "the salon")}.`}</p>{bookedEstimate?.price && <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 text-left"><div className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold">Estimated price</span><span className="text-2xl font-bold tabular-nums">${Number(bookedEstimate.price).toFixed(2)}</span></div>{bookedEstimate.disclaimer && <p className="mt-2 text-xs leading-5 text-violet-100">{bookedEstimate.disclaimer}</p>}</div>}<Button className="mt-6 bg-violet-400 text-foreground hover:bg-violet-300 dark:hover:bg-violet-800" onClick={() => { setComplete(false); setSelectedDate(""); setForm({ firstName: "", lastName: "", phone: "", email: "", petName: "", breed: "", weightKg: "", staffId: "", serviceType: "classic_groom", scheduledStart: "", notes: "" }); }}>Book another visit</Button></div></main>;

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#5b21b688,_transparent_40%),linear-gradient(135deg,#1e1b3a,#0f172a_55%,#241f4d)] px-4 py-8 text-foreground sm:px-6"><div className="mx-auto max-w-5xl"><header className="mb-8 flex flex-col gap-4 text-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><SalonLogo brand={salon} className="h-14 w-14 rounded-xl bg-card p-1" badgeClassName="h-14 w-14 text-lg" /><div>{salon.name && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{salonName(salon)}</p>}<h1 className="text-2xl font-bold">Book your groom</h1></div></div><PoweredByGroomigo className="sm:items-end" /></header><ExistingClientPortalLink salonName={salon.name ? salonName(salon) : null} />
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]"><section className="rounded-3xl bg-card p-5 shadow-2xl sm:p-8">{previewMode && <div className="mb-5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"><strong>Preview mode only.</strong> Every request is marked as a test. No client messages, automatic confirmations or live booking release will occur.</div>}<div className="mb-6"><h2 className="text-xl font-bold">Choose a preferred groomer</h2><p className="mt-1 text-sm text-muted-foreground">Availability is protected by live capacity limits. A booking request is confirmed only after the salon accepts it.</p></div>
      {isLoading ? <p className="py-12 text-center text-muted-foreground">Loading groomer profiles…</p> : !groomers?.length ? <div className="rounded-xl border border-dashed p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" /><h3 className="mt-3 font-semibold">Online booking is coming soon</h3><p className="mt-1 text-sm text-muted-foreground">The salon has not released any groomer profiles for online bookings yet.</p></div> : <>
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Available groomers"><button type="button" aria-pressed={anyGroomer} onClick={() => { setSlotStaffId(null); setForm(p => ({ ...p, staffId: ANY_GROOMER, scheduledStart: "" })); }} className={`rounded-2xl border p-4 text-left transition ${anyGroomer ? "border-violet-600 bg-violet-50 dark:bg-violet-950/40 ring-2 ring-violet-200" : "hover:border-violet-300 dark:hover:border-violet-800 hover:bg-violet-50/50 dark:hover:bg-violet-950/50"}`}><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-violet-700 text-white"><Sparkles className="h-5 w-5" /></div><div><p className="font-semibold">No preferred groomer</p><p className="text-xs text-muted-foreground">First available</p></div></div><p className="mt-3 line-clamp-2 text-sm text-muted-foreground">New here, or don’t mind who? Take the first groomer free.</p></button>{groomers.map(groomer => <button type="button" key={groomer.id} onClick={() => { setForm(p => ({ ...p, staffId: String(groomer.id), scheduledStart: "" })); }} className={`rounded-2xl border p-4 text-left transition ${form.staffId === String(groomer.id) ? "border-violet-600 bg-violet-50 dark:bg-violet-950/40 ring-2 ring-violet-200" : "hover:border-violet-300 dark:hover:border-violet-800 hover:bg-violet-50/50 dark:hover:bg-violet-950/50"}`}><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full font-bold text-white" style={{ background: groomer.colourHex }}>{groomer.photoUrl ? <img src={groomer.photoUrl} alt="" className="h-full w-full object-cover" /> : groomer.name[0]}</div><div><p className="font-semibold">{getBookingGroomerDisplayName(groomer.name)}</p><p className="text-xs capitalize text-muted-foreground">{groomer.role}</p></div></div>{groomer.bio && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{groomer.bio}</p>}</button>)}</div>
        <div className={`mt-7 ${ONLINE_BOOKING_TOP_ROW_GRID}`}><div className="min-w-0"><Label>Dog’s weight (kg)</Label><Input className="mt-1.5" type="number" min="0" max="80" step="0.1" value={form.weightKg} onChange={e => { setForm(p => ({ ...p, weightKg: e.target.value, scheduledStart: "" })); }} placeholder="e.g. 14.5" /></div><div className="min-w-0"><Label>Service</Label><Select disabled={!selectedWeightBand} value={form.serviceType} onValueChange={value => { setForm(p => ({ ...p, serviceType: value, scheduledStart: "" })); }}><SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="Enter weight first" /></SelectTrigger><SelectContent>{serviceOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className={ONLINE_BOOKING_DATE_FIELD_LAYOUT}><Label>Choose a date</Label><DateField className="mt-1.5 w-full" min={new Date().toISOString().slice(0, 10)} value={selectedDate} onChange={next => { setSelectedDate(next); setForm(p => ({ ...p, scheduledStart: "" })); }} /></div></div>
        <p className={`mt-2 text-sm ${selectedWeightBand ? "text-violet-700 dark:text-violet-300" : "text-amber-700 dark:text-amber-300"}`}>{getWeightEligibilityMessage(form.weightKg)}</p>
        {selectedWeightBand && <OnlineBookingEstimate className="mt-4" price={estimate.data?.price} range={estimate.data?.range} reason={estimate.data?.reason} disclaimer={estimate.data?.disclaimer} newClientRate={estimate.data?.newClientRate} regularFrom={estimate.data?.regularFrom} loading={estimate.isLoading} />}
        <div className="mt-5 rounded-2xl border border-violet-100 dark:border-violet-950/50 bg-violet-50/50 dark:bg-violet-950/50 p-4"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-violet-700 dark:text-violet-300" /><h3 className="font-semibold text-foreground">Available times</h3></div><Button type="button" variant="outline" className="mt-3 w-full gap-2 bg-card sm:w-auto" disabled={!selectedWeightBand || findingNext} onClick={findNextAvailable}><CalendarDays className="h-4 w-4" />{findingNext ? "Finding the next free time…" : "Find next available"}</Button>{!canLoadSlots ? <p className="mt-2 text-sm text-muted-foreground">{selectedWeightBand ? "Not sure which day? Press Find next available, or choose a groomer (or no preferred groomer) and a date to see every time." : "Enter your dog’s weight, then press Find next available, or choose a groomer and a date."}</p> : slotsLoading ? <p className="mt-2 text-sm text-muted-foreground">Finding available times…</p> : !availableSlots?.length ? <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">No times are available for this date. {anyGroomer ? "Please choose another day, or press Find next available." : "Please choose another day or groomer."}</p> : <div className="mt-3 flex flex-wrap gap-2">{availableSlots.map(slot => { const isSelected = form.scheduledStart === new Date(slot.scheduledStart).toISOString(); return <Button key={new Date(slot.scheduledStart).toISOString()} type="button" variant={isSelected ? "default" : "outline"} className={isSelected ? "bg-violet-700 hover:bg-violet-800" : "bg-card hover:bg-violet-50 dark:hover:bg-violet-950/40"} onClick={() => { setSlotStaffId(slot.staffId ?? null); setForm(p => ({ ...p, scheduledStart: new Date(slot.scheduledStart).toISOString() })); }}>{new Date(slot.scheduledStart).toLocaleTimeString("en-AU", { timeZone: getActiveTimeZone(), hour: "numeric", minute: "2-digit" })}</Button>; })}</div>}{form.scheduledStart && <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">Selected time: {new Date(form.scheduledStart).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{matchedGroomer ? ` with ${getBookingGroomerDisplayName(matchedGroomer.name)}` : ""}</p>}</div>
        <div className="mt-8 border-t pt-6"><h2 className="text-xl font-bold">Your details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><Label>First name</Label><Input className="mt-1.5" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} /></div><div><Label>Last name</Label><Input className="mt-1.5" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} /></div><div><Label>Mobile number</Label><Input className="mt-1.5" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="04xx xxx xxx" /></div><div><Label>Email <span className="text-muted-foreground">(optional)</span></Label><Input className="mt-1.5" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div><div><Label>Pet’s name</Label><Input className="mt-1.5" value={form.petName} onChange={e => setForm(p => ({ ...p, petName: e.target.value }))} /></div><div><Label>Breed <span className="text-muted-foreground">(optional)</span></Label><Input className="mt-1.5" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} /></div><div className="sm:col-span-2"><Label>Anything we should know?</Label><Textarea className="mt-1.5" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Coat condition, behaviour, style preference or special requirements." /></div></div></div>
        <Button className="mt-6 w-full bg-violet-700 hover:bg-violet-800" disabled={!form.scheduledStart || !bookingStaffId || !selectedWeightBand || creating || !form.firstName || !form.lastName || !form.phone || !form.petName} onClick={submitRequest}>{creating ? "Submitting request…" : previewMode ? "Create preview booking" : "Request this booking"}</Button>
      </>}</section>
      <aside className="h-fit rounded-3xl border border-white/15 bg-white/10 p-5 text-white backdrop-blur"><Clock3 className="h-6 w-6 text-violet-300" /><h2 className="mt-3 font-bold">A calmer way to book</h2><p className="mt-2 text-sm leading-6 text-violet-50">Choose a groomer you know and love, or pick no preferred groomer and take the first one who is free. Slot capacity is checked live so the day never becomes overbooked.</p><div className="mt-5 space-y-3 border-t border-white/15 pt-5 text-sm text-violet-50"><div className="flex gap-2"><UserRound className="h-4 w-4 flex-none text-violet-300" />Each pet is assessed separately, even in multi-pet families.</div><div className="flex gap-2"><CalendarDays className="h-4 w-4 flex-none text-violet-300" />Bath-only services have a protected daily online limit.</div></div></aside>
    </div>
    <footer className="mt-10 flex justify-center pb-4"><PoweredByGroomigo className="items-center" /></footer>
    </div></main>;
}
