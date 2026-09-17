import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { CalendarDays, Dog, Heart, Mail, Phone, Scissors, ShieldCheck, Wallet, History as HistoryIcon, PencilLine, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type PortalPet = { id: number; name: string; breed: string | null; species: string; status: string };
type PortalAppointment = { id: number; scheduledStart: Date | string; scheduledEnd: Date | string; serviceType: string; status: string; workflowState: string; petId: number; petName: string; petWeightKg: string | number | null; staffId: number | null; staffName: string | null };
type PortalMembership = { id: number; petId: number | null; name: string; tier: string; status: string; nextBillingDate: Date | string | null };
type PortalGroomingCard = { id: number; petId: number; petName: string; appointmentDate: Date | string; overallRating: string | null; mood: string | null; additionalNote: string | null; beforePhotoUrl: string | null; afterPhotoUrl: string | null; recommendedFrequencyWeeks: number | null; sentAt: Date | string | null };
type PortalData = { salon: { name: string; phone: string | null; email: string | null }; client: { firstName: string; lastName: string; email: string | null; phone: string | null }; pets: PortalPet[]; appointments: PortalAppointment[]; memberships: PortalMembership[]; groomingCards: PortalGroomingCard[]; storeCreditBalance: string };

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom", styled_groom: "Styled Groom", bath_only: "Bath",
  fft: "FFT (Face, Feet & Hygiene Tidy)", nail_trim: "Nail Trim", daycare: "Daycare", deshed: "De-shed", other: "Other",
};

function portalDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Not scheduled";
}

function portalDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const tokenPortal = trpc.clientPortal.getPortal.useQuery({ token: token ?? "" }, { enabled: Boolean(token) });
  const accountPortal = trpc.clientPortal.getMyPortal.useQuery(undefined, { enabled: !token, retry: false });
  const logout = trpc.clientPortal.logout.useMutation({ onSuccess: () => navigate("/portal/login") });
  const data = (token ? tokenPortal.data : accountPortal.data) as PortalData | undefined;
  const isLoading = token ? tokenPortal.isLoading : accountPortal.isLoading;
  const error = token ? tokenPortal.error : accountPortal.error;
  const refetch = () => (token ? tokenPortal.refetch() : accountPortal.refetch());

  const [rescheduleTarget, setRescheduleTarget] = useState<PortalAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PortalAppointment | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(""); // "" = not chosen yet, "any" = no preference, else staffId
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [showAllHistory, setShowAllHistory] = useState(false);

  const openReschedule = (appt: PortalAppointment) => {
    setRescheduleTarget(appt);
    setSelectedStaffId(appt.staffId ? String(appt.staffId) : "any");
    setSelectedDate(new Date(appt.scheduledStart).toISOString().slice(0, 10));
    setSelectedSlot("");
  };

  const groomerProfiles = trpc.clientPortal.listReschedulableStaff.useQuery({ tenantId: 1 });
  const petWeightKg = rescheduleTarget?.petWeightKg ? Number(rescheduleTarget.petWeightKg) : 0;
  const specificSlots = trpc.clientPortal.listAvailableSlots.useQuery(
    { tenantId: 1, staffId: Number(selectedStaffId), serviceType: rescheduleTarget?.serviceType as any, petWeightKg, date: selectedDate, excludeAppointmentId: rescheduleTarget?.id ?? 0 },
    { enabled: !!rescheduleTarget && !!selectedDate && selectedStaffId !== "" && selectedStaffId !== "any" }
  );
  const anyStaffSlots = trpc.clientPortal.listAvailableSlotsAnyStaff.useQuery(
    { tenantId: 1, serviceType: rescheduleTarget?.serviceType as any, petWeightKg, date: selectedDate, excludeAppointmentId: rescheduleTarget?.id ?? 0 },
    { enabled: !!rescheduleTarget && !!selectedDate && selectedStaffId === "any" }
  );
  const availableSlots = selectedStaffId === "any" ? anyStaffSlots.data : specificSlots.data;
  const slotsLoading = selectedStaffId === "any" ? anyStaffSlots.isFetching : specificSlots.isFetching;

  const rescheduleMutation = trpc.clientPortal.rescheduleAppointment.useMutation({
    onSuccess: () => { toast.success("Appointment rescheduled"); setRescheduleTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.clientPortal.cancelAppointment.useMutation({
    onSuccess: () => { toast.success("Appointment cancelled"); setCancelTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 p-6"><div className="mx-auto max-w-4xl animate-pulse space-y-5"><div className="h-24 rounded-2xl bg-muted" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-32 rounded-xl bg-muted" />)}</div></div></main>;
  if (error || !data) return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 grid place-items-center p-6"><Card className="max-w-md text-center"><CardHeader><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><CardTitle>{token ? "Portal link unavailable" : "Client sign in required"}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{error?.message ?? (token ? "Please ask the salon for a new secure portal link." : "Please sign in to view your client portal.")}</p>{!token && <Button onClick={() => navigate("/portal/login")}>Go to client sign in</Button>}</CardContent></Card></main>;

  const upcoming = data.appointments.filter(appointment => new Date(appointment.scheduledStart).getTime() >= Date.now() && !["cancelled", "no_show"].includes(appointment.status));
  const past = data.appointments.filter(appointment => !upcoming.includes(appointment));
  const pastVisible = showAllHistory ? past : past.slice(0, 5);
  const canManage = (appt: PortalAppointment) => appt.workflowState === "scheduled" && appt.status !== "cancelled";
  const canReschedule = (appt: PortalAppointment) => canManage(appt) && new Date(appt.scheduledStart).getTime() - Date.now() >= 24 * 3600000;
  const creditBalance = Number(data.storeCreditBalance ?? 0);

  return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 py-8 px-4"><div className="mx-auto max-w-4xl space-y-6">
    <header className="rounded-2xl bg-primary p-6 text-primary-foreground"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm opacity-85">Welcome to</p><h1 className="font-display text-3xl font-bold">{data.salon.name}</h1><p className="mt-2 text-sm opacity-90">Hi {data.client.firstName}, here is a secure summary of your pets and grooming care.</p></div>{!token && <Button variant="outline" className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? "Signing out…" : "Sign out"}</Button>}</div></header>

    <section className="grid gap-4 sm:grid-cols-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Your pets</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data.pets.length}</p><p className="mt-1 text-sm text-muted-foreground">{data.pets.map(pet => pet.name).join(", ") || "No pets listed"}</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Upcoming visits</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{upcoming.length}</p><p className="mt-1 text-sm text-muted-foreground">Appointments currently scheduled</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Memberships</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data.memberships.filter(membership => membership.status === "active").length}</p><p className="mt-1 text-sm text-muted-foreground">Active pet care memberships</p></CardContent></Card>
      <Card className="border-primary/20 bg-primary/5"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Store credit</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">${creditBalance.toFixed(2)}</p><p className="mt-1 text-sm text-muted-foreground">{creditBalance > 0 ? "Automatically applied to your next visits" : "No credit currently on file"}</p></CardContent></Card>
    </section>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Dog className="h-5 w-5 text-primary" /> Your pets</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{data.pets.map(pet => <div key={pet.id} className="rounded-xl border bg-card p-4"><p className="font-semibold">{pet.name}</p><p className="text-sm text-muted-foreground">{pet.breed || pet.species}</p><Badge variant="outline" className="mt-2 capitalize">{pet.status}</Badge></div>)}</CardContent></Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Upcoming appointments</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length ? upcoming.map(appointment => (
          <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
            <div>
              <p className="font-semibold">{appointment.petName} · {SERVICE_LABELS[appointment.serviceType] ?? appointment.serviceType}</p>
              <p className="text-sm text-muted-foreground">{portalDateTime(appointment.scheduledStart)}{appointment.staffName ? ` with ${appointment.staffName}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="capitalize">{appointment.status}</Badge>
              {canManage(appointment) && (
                <>
                  {canReschedule(appointment) ? (
                    <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => openReschedule(appointment)}>
                      <PencilLine className="h-3.5 w-3.5" /> Reschedule
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">This appointment cannot be rescheduled online. Please call Barkin' Beautiful on (07) 3823 4567.</span>
                  )}
                  <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={() => setCancelTarget(appointment)}>
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )) : <p className="text-sm text-muted-foreground">There are no upcoming appointments in this portal.</p>}
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> Memberships</CardTitle></CardHeader><CardContent className="space-y-3">{data.memberships.length ? data.memberships.map(membership => <div key={membership.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"><div><p className="font-semibold">{membership.name}</p><p className="text-sm text-muted-foreground">{membership.status === "active" && membership.nextBillingDate ? `Next renewal: ${portalDate(membership.nextBillingDate)}` : "Please contact the salon for account details."}</p></div><Badge variant="outline" className="capitalize">{membership.tier}</Badge></div>) : <p className="text-sm text-muted-foreground">No memberships are currently shown.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Scissors className="h-5 w-5 text-primary" /> Grooming cards</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{data.groomingCards.length ? data.groomingCards.map(card => <div key={card.id} className="rounded-xl border bg-card p-4"><p className="font-semibold">{card.petName} · {portalDate(card.appointmentDate)}</p>{card.afterPhotoUrl && <img src={card.afterPhotoUrl} alt={`${card.petName} after grooming`} className="mt-3 h-44 w-full rounded-lg object-cover" />}{card.additionalNote && <p className="mt-3 text-sm text-muted-foreground">{card.additionalNote}</p>}{card.recommendedFrequencyWeeks && <p className="mt-3 text-xs font-medium text-primary">Recommended return: every {card.recommendedFrequencyWeeks} weeks</p>}</div>) : <p className="text-sm text-muted-foreground">Approved grooming cards will appear here when the salon shares them.</p>}</CardContent></Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><HistoryIcon className="h-5 w-5 text-primary" /> Appointment history</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {past.length ? pastVisible.map(appointment => (
          <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
            <div>
              <p className="font-semibold">{appointment.petName} · {SERVICE_LABELS[appointment.serviceType] ?? appointment.serviceType}</p>
              <p className="text-sm text-muted-foreground">{portalDate(appointment.scheduledStart)}{appointment.staffName ? ` with ${appointment.staffName}` : ""}</p>
            </div>
            <Badge variant="outline" className="capitalize">{appointment.status === "cancelled" || appointment.workflowState === "cancelled" ? "Cancelled" : appointment.workflowState === "no_show" || appointment.status === "no_show" ? "No show" : "Completed"}</Badge>
          </div>
        )) : <p className="text-sm text-muted-foreground">No past appointments yet.</p>}
        {past.length > 5 && (
          <button className="text-sm font-medium text-primary" onClick={() => setShowAllHistory(!showAllHistory)}>
            {showAllHistory ? "Show fewer" : `Show all ${past.length} past appointments`}
          </button>
        )}
      </CardContent>
    </Card>

    <Card><CardContent className="flex flex-wrap items-center gap-5 py-5 text-sm text-muted-foreground"><span>Need help with an appointment?</span>{data.salon.phone && <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`tel:${data.salon.phone}`}><Phone className="h-4 w-4" /> {data.salon.phone}</a>}{data.salon.email && <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`mailto:${data.salon.email}`}><Mail className="h-4 w-4" /> {data.salon.email}</a>}</CardContent></Card>
  </div>

  <Dialog open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Reschedule appointment</DialogTitle></DialogHeader>
      {rescheduleTarget && (
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">{rescheduleTarget.petName} · {SERVICE_LABELS[rescheduleTarget.serviceType] ?? rescheduleTarget.serviceType}</p>

          <div className="space-y-1.5">
            <Label>Groomer</Label>
            <Select value={selectedStaffId} onValueChange={(v) => { setSelectedStaffId(v); setSelectedSlot(""); }}>
              <SelectTrigger><SelectValue placeholder="Choose a groomer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preferred groomer</SelectItem>
                {groomerProfiles.data?.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <input
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(""); }}
            />
          </div>

          {selectedStaffId && selectedDate && (
            <div className="space-y-1.5">
              <Label>Available times</Label>
              {slotsLoading ? (
                <p className="text-sm text-muted-foreground">Checking availability\u2026</p>
              ) : availableSlots && availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {availableSlots.map(slot => {
                    const iso = new Date(slot.scheduledStart).toISOString();
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedSlot(iso)}
                        className={`rounded-md border px-2 py-1.5 text-sm ${selectedSlot === iso ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
                      >
                        {new Date(slot.scheduledStart).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No times available that day &mdash; try another date, or give the salon a call.</p>
              )}
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => setRescheduleTarget(null)}>Cancel</Button>
        <Button
          disabled={rescheduleMutation.isPending || !selectedSlot}
          onClick={() => rescheduleTarget && rescheduleMutation.mutate({ token, appointmentId: rescheduleTarget.id, newStart: selectedSlot })}
        >
          {rescheduleMutation.isPending ? "Saving\u2026" : "Confirm new time"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Cancel this appointment?</DialogTitle></DialogHeader>
      {cancelTarget && <p className="text-sm text-muted-foreground py-2">{cancelTarget.petName}'s {(SERVICE_LABELS[cancelTarget.serviceType] ?? cancelTarget.serviceType).toLowerCase()} on {portalDateTime(cancelTarget.scheduledStart)} will be cancelled. This can't be undone from here — call the salon if you'd like to rebook.</p>}
      <DialogFooter>
        <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep appointment</Button>
        <Button
          variant="destructive"
          disabled={cancelMutation.isPending}
          onClick={() => cancelTarget && cancelMutation.mutate({ token, appointmentId: cancelTarget.id })}
        >
          {cancelMutation.isPending ? "Cancelling…" : "Yes, cancel it"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  </main>;
}
