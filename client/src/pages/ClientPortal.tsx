import { useLocation, useParams } from "wouter";
import { CalendarDays, Dog, Heart, Mail, Phone, Scissors, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PortalPet = { id: number; name: string; breed: string | null; species: string; status: string };
type PortalAppointment = { id: number; scheduledStart: Date | string; scheduledEnd: Date | string; serviceType: string; status: string; workflowState: string; petName: string; staffName: string | null };
type PortalMembership = { id: number; petId: number | null; name: string; tier: string; status: string; nextBillingDate: Date | string | null };
type PortalGroomingCard = { id: number; petId: number; petName: string; appointmentDate: Date | string; overallRating: string | null; mood: string | null; additionalNote: string | null; beforePhotoUrl: string | null; afterPhotoUrl: string | null; recommendedFrequencyWeeks: number | null; sentAt: Date | string | null };
type PortalData = { salon: { name: string; phone: string | null; email: string | null }; client: { firstName: string; lastName: string; email: string | null; phone: string | null }; pets: PortalPet[]; appointments: PortalAppointment[]; memberships: PortalMembership[]; groomingCards: PortalGroomingCard[] };

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom", styled_groom: "Styled Groom", bath_only: "Bath",
  fft: "FFT (Face, Feet & Hygiene Tidy)", nail_trim: "Nail Trim", daycare: "Daycare", deshed: "De-shed", other: "Other",
};

function portalDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Not scheduled";
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

  if (isLoading) return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 p-6"><div className="mx-auto max-w-4xl animate-pulse space-y-5"><div className="h-24 rounded-2xl bg-muted" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-32 rounded-xl bg-muted" />)}</div></div></main>;
  if (error || !data) return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 grid place-items-center p-6"><Card className="max-w-md text-center"><CardHeader><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><CardTitle>{token ? "Portal link unavailable" : "Client sign in required"}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{error?.message ?? (token ? "Please ask the salon for a new secure portal link." : "Please sign in to view your client portal.")}</p>{!token && <Button onClick={() => navigate("/portal/login")}>Go to client sign in</Button>}</CardContent></Card></main>;

  const upcoming = data.appointments.filter(appointment => new Date(appointment.scheduledStart).getTime() >= Date.now() && !["cancelled", "no_show"].includes(appointment.status));
  const past = data.appointments.filter(appointment => !upcoming.includes(appointment)).slice(0, 8);

  return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 py-8 px-4"><div className="mx-auto max-w-4xl space-y-6">
    <header className="rounded-2xl bg-primary p-6 text-primary-foreground"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm opacity-85">Welcome to</p><h1 className="font-display text-3xl font-bold">{data.salon.name}</h1><p className="mt-2 text-sm opacity-90">Hi {data.client.firstName}, here is a secure summary of your pets and grooming care.</p></div>{!token && <Button variant="outline" className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? "Signing out…" : "Sign out"}</Button>}</div></header>
    <section className="grid gap-4 sm:grid-cols-3"><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Your pets</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data.pets.length}</p><p className="mt-1 text-sm text-muted-foreground">{data.pets.map(pet => pet.name).join(", ") || "No pets listed"}</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Upcoming visits</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{upcoming.length}</p><p className="mt-1 text-sm text-muted-foreground">Appointments currently scheduled</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Memberships</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data.memberships.filter(membership => membership.status === "active").length}</p><p className="mt-1 text-sm text-muted-foreground">Active pet care memberships</p></CardContent></Card></section>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Dog className="h-5 w-5 text-primary" /> Your pets</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{data.pets.map(pet => <div key={pet.id} className="rounded-xl border bg-card p-4"><p className="font-semibold">{pet.name}</p><p className="text-sm text-muted-foreground">{pet.breed || pet.species}</p><Badge variant="outline" className="mt-2 capitalize">{pet.status}</Badge></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Upcoming appointments</CardTitle></CardHeader><CardContent className="space-y-3">{upcoming.length ? upcoming.map(appointment => <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"><div><p className="font-semibold">{appointment.petName} · {SERVICE_LABELS[appointment.serviceType] ?? appointment.serviceType}</p><p className="text-sm text-muted-foreground">{portalDate(appointment.scheduledStart)}{appointment.staffName ? ` with ${appointment.staffName}` : ""}</p></div><Badge className="capitalize">{appointment.status}</Badge></div>) : <p className="text-sm text-muted-foreground">There are no upcoming appointments in this portal.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> Memberships</CardTitle></CardHeader><CardContent className="space-y-3">{data.memberships.length ? data.memberships.map(membership => <div key={membership.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"><div><p className="font-semibold">{membership.name}</p><p className="text-sm text-muted-foreground">{membership.status === "active" && membership.nextBillingDate ? `Next renewal: ${portalDate(membership.nextBillingDate)}` : "Please contact the salon for account details."}</p></div><Badge variant="outline" className="capitalize">{membership.tier}</Badge></div>) : <p className="text-sm text-muted-foreground">No memberships are currently shown.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Scissors className="h-5 w-5 text-primary" /> Grooming cards</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{data.groomingCards.length ? data.groomingCards.map(card => <div key={card.id} className="rounded-xl border bg-card p-4"><p className="font-semibold">{card.petName} · {portalDate(card.appointmentDate)}</p>{card.afterPhotoUrl && <img src={card.afterPhotoUrl} alt={`${card.petName} after grooming`} className="mt-3 h-44 w-full rounded-lg object-cover" />}{card.additionalNote && <p className="mt-3 text-sm text-muted-foreground">{card.additionalNote}</p>}{card.recommendedFrequencyWeeks && <p className="mt-3 text-xs font-medium text-primary">Recommended return: every {card.recommendedFrequencyWeeks} weeks</p>}</div>) : <p className="text-sm text-muted-foreground">Approved grooming cards will appear here when the salon shares them.</p>}</CardContent></Card>
    <Card><CardContent className="flex flex-wrap items-center gap-5 py-5 text-sm text-muted-foreground"><span>Need help with an appointment?</span>{data.salon.phone && <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`tel:${data.salon.phone}`}><Phone className="h-4 w-4" /> {data.salon.phone}</a>}{data.salon.email && <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`mailto:${data.salon.email}`}><Mail className="h-4 w-4" /> {data.salon.email}</a>}</CardContent></Card>
    {past.length > 0 && <p className="pb-6 text-center text-xs text-muted-foreground">Your recent appointment history is available in the salon’s secure records.</p>}
  </div></main>;
}
