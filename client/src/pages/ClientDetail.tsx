import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dog, Phone, Mail, MapPin, CalendarDays, CreditCard, ArrowLeft,
  AlertTriangle, Award, Clock, DollarSign, Plus, ImagePlus, ChevronDown, ClipboardList, Copy, ShieldCheck, Trash2, UserRoundPlus
} from "lucide-react";
import { Link2, Link2Off, Search } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { HeartCrack, History, Replace, Unlink } from "lucide-react";
import { getDepartedMembershipBillingImpact, isEligibleMembershipReplacement, replacementEligibilityMessage } from "@shared/departedPetMembership";
import { resolveAppointmentMembershipCoverage } from "@shared/appointmentMembershipCoverage";

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom", styled_groom: "Styled Groom",
  bath_only: "Bath", fft: "FFT (Face, Feet & Hygiene Tidy)", nail_trim: "Nail Trim",
  daycare: "Daycare", deshed: "De-shed", other: "Other",
};

const SERVICE_COLOUR: Record<string, string> = {
  classic_groom: "#22c55e", styled_groom: "#22c55e",
  bath_only: "#3b82f6", fft: "#ec4899", nail_trim: "#a78bfa",
  daycare: "#f59e0b", deshed: "#f97316", other: "#94a3b8",
};

const TIER_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  diamond: { bg: "bg-cyan-50", text: "text-cyan-800", border: "border-cyan-200" },
  platinum: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-300" },
  gold:     { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  silver:   { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-300" },
  bronze:   { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200" },
};

const TIER_ICONS: Record<string, string> = {
  diamond: "💎", platinum: "🥈", gold: "🥇", silver: "🪙", bronze: "🏅",
};

function MembershipBadge({ tier, name, status }: { tier: string; name: string; status: string }) {
  const colours = TIER_COLOURS[tier] ?? TIER_COLOURS.bronze;
  const icon = TIER_ICONS[tier] ?? "🏅";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${colours.bg} ${colours.text} ${colours.border}`}>
      {icon} {name}
      {status !== "active" && <span className="opacity-60">({status})</span>}
    </span>
  );
}

// Sub-component to show linked family pets (uses its own query per pet)
function FamilyLinkedPets({ petId }: { petId: number }) {
  const { data: familyPets } = trpc.family.getFamily.useQuery({ petId });
  if (!familyPets || familyPets.length <= 1) return null;
  const others = familyPets.filter(p => p.id !== petId);
  if (others.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {others.map(p => (
        <Link key={p.id} href={`/clients/${p.clientId}`}>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 cursor-pointer transition-colors">
            <Link2 className="h-2.5 w-2.5" />
            {p.name}
          </span>
        </Link>
      ))}
    </div>
  );
}

function AlertBadge({ level, warnings }: { level: string; warnings?: string | null }) {
  if (level === "danger") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200" title={warnings ?? ""}>
      <AlertTriangle className="h-3 w-3" /> DANGER {warnings ? `— ${warnings}` : ""}
    </span>
  );
  if (level === "caution") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200" title={warnings ?? ""}>
      <AlertTriangle className="h-3 w-3" /> CAUTION {warnings ? `— ${warnings}` : ""}
    </span>
  );
  return null;
}

function ClientProfileSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse" aria-busy="true" aria-label="Loading client profile" data-testid="client-profile-skeleton">
      <div className="flex items-center justify-between"><div className="h-8 w-32 rounded-md bg-muted" /><div className="h-9 w-40 rounded-md bg-muted" /></div>
      <div className="rounded-2xl border bg-card p-6"><div className="flex gap-5"><div className="h-16 w-16 rounded-full bg-muted" /><div className="flex-1 space-y-3"><div className="h-7 w-52 rounded bg-muted" /><div className="h-4 w-80 max-w-full rounded bg-muted" /><div className="h-4 w-60 max-w-full rounded bg-muted" /></div></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 rounded-xl border bg-card" />)}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-48 rounded-xl border bg-card" />)}</div>
    </div>
  );
}

function StoreCreditCard({ clientId }: { clientId: number }) {
  const [addOpen, setAddOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "card" | "other">("bank_transfer");
  const [note, setNote] = useState("");

  const utils = trpc.useUtils();
  const { data: balanceData } = trpc.storeCredit.getBalance.useQuery({ clientId });
  const { data: history } = trpc.storeCredit.getHistory.useQuery({ clientId }, { enabled: showHistory });
  const balance = Number(balanceData?.balance ?? 0);

  const addCreditMutation = trpc.storeCredit.addCredit.useMutation({
    onSuccess: () => {
      toast.success("Store credit added");
      utils.storeCredit.getBalance.invalidate({ clientId });
      utils.storeCredit.getHistory.invalidate({ clientId });
      setAddOpen(false);
      setAmount("");
      setNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const typeLabel: Record<string, string> = {
    credit_added: "Credit added",
    appointment_deduction: "Used on appointment",
    refund: "Refund",
    adjustment: "Adjustment",
  };

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Store Credit
        </CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add credit
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">${balance.toFixed(2)}</span>
          <span className="text-sm text-muted-foreground">available</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Automatically applied to each appointment's cost as it's completed, until used up.
        </p>
        <button
          className="text-sm text-primary font-medium mt-3 flex items-center gap-1"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-3.5 w-3.5" /> {showHistory ? "Hide" : "View"} history
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>
        {showHistory && (
          <div className="mt-3 border rounded-lg divide-y">
            {!history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No store credit activity yet.</p>
            ) : (
              history.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{typeLabel[tx.type] ?? tx.type}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                      {tx.method ? ` · ${tx.method.replace("_", " ")}` : ""}
                      {tx.createdByName ? ` · ${tx.createdByName}` : ""}
                      {tx.note ? ` · ${tx.note}` : ""}
                    </div>
                  </div>
                  <span className={`font-semibold ${Number(tx.amount) >= 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add store credit</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="600.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Full year prepay" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={addCreditMutation.isPending}
              onClick={() => addCreditMutation.mutate({ clientId, amount: amount.trim(), method, note: note.trim() || undefined })}
            >
              Add credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = parseInt(params.id ?? "0");
  const { data, isLoading } = trpc.clients.getProfile.useQuery({ clientId }, { enabled: !!clientId });
  const { data: currentUser } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [uploadingPhotoForPetId, setUploadingPhotoForPetId] = useState<number | null>(null);
  const [departedPet, setDepartedPet] = useState<{ id: number; name: string } | null>(null);
  const [departureNote, setDepartureNote] = useState("");
  const [membershipAction, setMembershipAction] = useState<{ membershipId: number; petId: number; petName: string; membershipName: string } | null>(null);
  const [departureMembershipAction, setDepartureMembershipAction] = useState<"remove" | "transfer">("transfer");
  const [replacementPetId, setReplacementPetId] = useState("");
  const [membershipActionNote, setMembershipActionNote] = useState("");
  const [addingReplacementPet, setAddingReplacementPet] = useState(false);
  const [replacementPetForm, setReplacementPetForm] = useState({ name: "", breed: "", weightKg: "" });
  const [showMembershipActionSummary, setShowMembershipActionSummary] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [portalLinkExpiresAt, setPortalLinkExpiresAt] = useState<Date | null>(null);
  const [portalSetupLink, setPortalSetupLink] = useState<string | null>(null);
  const [portalSetupExpiresAt, setPortalSetupExpiresAt] = useState<Date | null>(null);
  const [portalSetupEmail, setPortalSetupEmail] = useState<string | null>(null);
  const [portalLinkOpen, setPortalLinkOpen] = useState(false);
  const [portalRevokeConfirm, setPortalRevokeConfirm] = useState(false);
  const [portalAccountRevokeConfirm, setPortalAccountRevokeConfirm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", relationship: "" });
  const [editingWeightPetId, setEditingWeightPetId] = useState<number | null>(null);
  const [weightDraft, setWeightDraft] = useState("");
  const isAdmin = currentUser?.role === "admin";
  const { data: portalAccess } = trpc.clientPortal.getAccessStatus.useQuery(
    { clientId },
    { enabled: isAdmin && Boolean(clientId) },
  );
  const { data: portalAccount } = trpc.clientPortal.getAccountStatus.useQuery(
    { clientId },
    { enabled: isAdmin && Boolean(clientId) },
  );
  const addPetPhoto = trpc.clients.addPetPhoto.useMutation({
    onSuccess: async () => {
      await utils.clients.getProfile.invalidate({ clientId });
      toast.success("Groom photo added to this pet’s history");
    },
    onError: (error) => toast.error(error.message),
  });
  const markDeparted = trpc.pets.markDeparted.useMutation({
    onSuccess: async (result) => {
      await utils.clients.getProfile.invalidate({ clientId });
      setDepartedPet(null);
      setDepartureNote("");
      toast.success(result.alreadyRecorded ? `${result.petName} is already recorded as passed away` : `${result.petName} has been recorded as passed away`);
    },
    onError: (error) => toast.error(error.message),
  });
  const manageDepartedPetMembership = trpc.memberships.manageDepartedPet.useMutation({
    onSuccess: async (result) => {
      await utils.clients.getProfile.invalidate({ clientId });
      setMembershipAction(null);
      setReplacementPetId("");
      setMembershipActionNote("");
      setShowMembershipActionSummary(false);
      toast.success(result.action === "transferred" ? `Membership transferred to ${result.replacementPetName}` : "Membership removed and billing stopped");
    },
    onError: (error) => toast.error(error.message),
  });
  const createReplacementPet = trpc.pets.create.useMutation({
    onSuccess: async (result) => {
      await utils.clients.getProfile.invalidate({ clientId });
      setReplacementPetId(String(result.id));
      setReplacementPetForm({ name: "", breed: "", weightKg: "" });
      setAddingReplacementPet(false);
      toast.success("Replacement pet added. Review eligibility, then continue.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updatePetWeight = trpc.pets.updateWeight.useMutation({
    onSuccess: async () => {
      await utils.clients.getProfile.invalidate({ clientId });
      setEditingWeightPetId(null);
      setWeightDraft("");
      toast.success("Recorded dog weight saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const issuePortalLink = trpc.clientPortal.issueAccessLink.useMutation({
    onSuccess: async (result) => {
      setPortalLink(result.portalUrl);
      setPortalLinkExpiresAt(result.expiresAt);
      setPortalSetupLink(null);
      await utils.clientPortal.getAccessStatus.invalidate({ clientId });
      toast.success("Secure client portal link generated. Share it manually when ready.");
    },
    onError: (error) => toast.error(error.message),
  });
  const issuePortalAccountSetupLink = trpc.clientPortal.issueAccountSetupLink.useMutation({
    onSuccess: async (result) => {
      setPortalSetupLink(result.setupUrl);
      setPortalSetupExpiresAt(result.expiresAt);
      setPortalSetupEmail(result.loginEmail);
      setPortalLink(null);
      await utils.clientPortal.getAccountStatus.invalidate({ clientId });
      toast.success("Client portal account setup link created. Share it manually when ready.");
    },
    onError: (error) => toast.error(error.message),
  });
  const revokePortalLink = trpc.clientPortal.revokeAccess.useMutation({
    onSuccess: async (result) => {
      setPortalRevokeConfirm(false);
      setPortalLink(null);
      await utils.clientPortal.getAccessStatus.invalidate({ clientId });
      toast[result.revoked ? "success" : "message"](result.revoked ? "Client portal link revoked" : "No active client portal link to revoke");
    },
    onError: (error) => toast.error(error.message),
  });
  const revokePortalAccount = trpc.clientPortal.revokeAccount.useMutation({
    onSuccess: async () => {
      setPortalAccountRevokeConfirm(false);
      setPortalSetupLink(null);
      await utils.clientPortal.getAccountStatus.invalidate({ clientId });
      toast.success("Client portal account access revoked");
    },
    onError: (error) => toast.error(error.message),
  });
  const addClientContact = trpc.clients.addContact.useMutation({
    onSuccess: async () => {
      await utils.clients.getProfile.invalidate({ clientId });
      setContactForm({ name: "", phone: "", email: "", relationship: "" });
      toast.success("Additional pickup contact saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeClientContact = trpc.clients.removeContact.useMutation({
    onSuccess: async () => {
      await utils.clients.getProfile.invalidate({ clientId });
      toast.success("Additional pickup contact removed");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleGroomPhotoUpload = async (petId: number, file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Photo must be 20 MB or smaller"); return; }
    setUploadingPhotoForPetId(petId);
    try {
      const response = await fetch("/api/upload/pet-groom-photo", {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Photo upload failed");
      await addPetPhoto.mutateAsync({
        petId,
        url: payload.url,
        storageKey: payload.key,
        caption: file.name.replace(/\.[^.]+$/, ""),
      });
    } catch (error: any) {
      toast.error(error.message ?? "Photo upload failed");
    } finally {
      setUploadingPhotoForPetId(null);
    }
  };

  // Family Link state (must be before early returns)
  const [familyLinkPetId, setFamilyLinkPetId] = useState<number | null>(null);
  const [familySearch, setFamilySearch] = useState("");
  const [familySearchActive, setFamilySearchActive] = useState(false);
  const { data: familySearchResults } = trpc.family.searchPets.useQuery(
    { query: familySearch, excludePetId: familyLinkPetId ?? undefined },
    { enabled: familySearchActive && familySearch.length >= 2 }
  );
  const linkPets = trpc.family.linkPets.useMutation({
    onSuccess: () => {
      toast.success("Pets linked as family!");
      setFamilyLinkPetId(null);
      setFamilySearch("");
      setFamilySearchActive(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const unlinkPet = trpc.family.unlinkPet.useMutation({
    onSuccess: () => toast.success("Pet removed from family group"),
    onError: (e) => toast.error(e.message),
  });
  // Walk-in client search state
  const [walkInClientSearch, setWalkInClientSearch] = useState("");
  const { data: walkInClientResults } = trpc.memberships.searchClients.useQuery({ search: walkInClientSearch },
    { enabled: walkInClientSearch.length >= 2 }
  );

  // Book Appointment state and data hooks must run before every early return.
  const [bookOpen, setBookOpen] = useState(false);
  const [bookPetId, setBookPetId] = useState<string>("");
  const [bookFamilyPetIds, setBookFamilyPetIds] = useState<string[]>([]);
  const [bookService, setBookService] = useState("classic_groom");
  const [bookDate, setBookDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookTime, setBookTime] = useState("09:00");
  const [bookStaffId, setBookStaffId] = useState<string>("");
  const { data: staffList } = trpc.staff.list.useQuery({ tenantId: 1 });
  const createAppt = trpc.calendar.createMultiPetAppointment.useMutation({
    onSuccess: () => {
      toast.success("Appointment booked!");
      setBookOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return (
    <DashboardLayout>
      <ClientProfileSkeleton />
    </DashboardLayout>
  );

  if (!data) return (
    <DashboardLayout>
      <div className="text-center py-20 text-muted-foreground">Client not found.</div>
    </DashboardLayout>
  );

  const { client, pets, memberships, appointments, payments, photos } = data;
  const additionalContacts = data.contacts ?? [];
  const petMembershipEvents = data.petMembershipEvents ?? [];
  const activePets = pets.filter(pet => pet.status !== "departed");
  const selectedBookingPet = activePets.find(pet => String(pet.id) === bookPetId);
  const bookingFamilyCompanions = selectedBookingPet?.familyGroupId
    ? activePets.filter(pet => pet.familyGroupId === selectedBookingPet.familyGroupId && pet.id !== selectedBookingPet.id)
    : [];
  const activeMemberships = memberships.filter(m => m.status === "active");
  const bookingPetIds = Array.from(new Set([bookPetId, ...bookFamilyPetIds])).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);
  const bookingMembershipCoverage = resolveAppointmentMembershipCoverage(
    bookingPetIds,
    bookService as "classic_groom" | "styled_groom" | "bath_only" | "fft" | "nail_trim" | "daycare" | "deshed" | "other",
    activeMemberships,
  );
  const totalSpend = appointments.reduce((sum, a) => sum + parseFloat(a.price ?? "0"), 0);
  const lastVisit = appointments[0]?.scheduledStart;
  const nextVisit = appointments.find(a => new Date(a.scheduledStart) > new Date());

  const handleBook = () => {
    if (!bookPetId) { toast.error("Please select a pet"); return; }
    const start = new Date(`${bookDate}T${bookTime}:00`);
    const end = new Date(start.getTime() + 90 * 60000);
    createAppt.mutate({
      tenantId: 1,
      clientId: client.id,
      petIds: Array.from(new Set([bookPetId, ...bookFamilyPetIds])).map(id => parseInt(id)),
      staffId: bookStaffId ? parseInt(bookStaffId) : undefined,
      serviceType: bookService as "classic_groom",
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      price: bookingMembershipCoverage.fullyCovered ? "0.00" : undefined,
    });
  };

  // Map petId -> memberships for that pet
  const petMemberships: Record<number, typeof memberships> = {};
  for (const m of memberships) {
    if (m.petId) {
      if (!petMemberships[m.petId]) petMemberships[m.petId] = [];
      petMemberships[m.petId].push(m);
    }
  }
  const photosByPet = (photos ?? []).reduce<Record<number, typeof photos>>((grouped, photo) => {
    (grouped[photo.petId] ??= []).push(photo);
    return grouped;
  }, {});
  const manageableDepartedMemberships = pets.flatMap(pet =>
    pet.status === "departed"
      ? (petMemberships[pet.id] ?? []).filter(membership => !["cancelled", "expired"].includes(membership.status)).map(membership => ({ pet, membership }))
      : []
  );

  const openDepartedMembershipAction = (pet: typeof pets[number], membership: typeof memberships[number]) => {
    setMembershipAction({ membershipId: membership.id, petId: pet.id, petName: pet.name, membershipName: membership.name });
    setDepartureMembershipAction("transfer");
    setReplacementPetId("");
    setShowMembershipActionSummary(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Back button */}
        <div className="flex items-center justify-between gap-2">
          <Link href="/clients">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Clients
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {isAdmin && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setPortalLink(null); setPortalSetupLink(null); setPortalRevokeConfirm(false); setPortalAccountRevokeConfirm(false); setPortalLinkOpen(true); }}><ShieldCheck className="h-4 w-4" /> Client portal</Button>}
            {isAdmin && (manageableDepartedMemberships.length > 0 || pets.some(pet => pet.status !== "departed")) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Quick actions <ChevronDown className="h-3.5 w-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Pet & membership management</DropdownMenuLabel>
                  {manageableDepartedMemberships.length > 0 && <DropdownMenuSeparator />}
                  {manageableDepartedMemberships.map(({ pet, membership }) => (
                    <DropdownMenuItem key={membership.id} onSelect={() => openDepartedMembershipAction(pet, membership)}>
                      Manage {membership.name} for {pet.name}
                    </DropdownMenuItem>
                  ))}
                  {pets.some(pet => pet.status !== "departed") && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Record a passing from the relevant pet card below.</DropdownMenuLabel></>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" className="gap-1.5" disabled={activePets.length === 0} onClick={() => { setBookPetId(activePets[0] ? String(activePets[0].id) : ""); setBookFamilyPetIds([]); setBookOpen(true); }}>
              <Plus className="h-4 w-4" /> Book Appointment
            </Button>
          </div>
        </div>

        <Dialog open={portalLinkOpen} onOpenChange={setPortalLinkOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>Client portal access</DialogTitle></DialogHeader>
            {!portalLink && !portalSetupLink && !portalRevokeConfirm && !portalAccountRevokeConfirm && <div className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">One-time secure link</h3><p className="text-sm text-muted-foreground">{portalAccess?.status === "active" ? `An active link expires ${new Date(portalAccess.expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}${portalAccess.lastAccessedAt ? ` and was last opened ${new Date(portalAccess.lastAccessedAt).toLocaleDateString("en-AU")}` : ""}.` : portalAccess ? `The latest link is ${portalAccess.status}. Create a new expiry-bound link when required.` : "No one-time client portal link has been issued yet."}</p></div><Badge variant="outline" className="capitalize">{portalAccess?.status ?? "not issued"}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-2">{portalAccess?.status === "active" && <Button variant="destructive" size="sm" onClick={() => setPortalRevokeConfirm(true)}>Revoke active link</Button>}<Button size="sm" disabled={issuePortalLink.isPending} onClick={() => issuePortalLink.mutate({ clientId })}>{issuePortalLink.isPending ? "Creating link…" : portalAccess?.status === "active" ? "Create replacement link" : "Create secure link"}</Button></div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Client login account</h3><p className="text-sm text-muted-foreground">{portalAccount?.portalAccountStatus === "active" ? `Active login for ${portalAccount.portalLoginEmail ?? portalAccount.email ?? "this client"}${portalAccount.portalLastSignedInAt ? `, last used ${new Date(portalAccount.portalLastSignedInAt).toLocaleDateString("en-AU")}` : ""}.` : portalAccount?.portalAccountStatus === "setup_pending" ? `Setup pending for ${portalAccount.portalLoginEmail ?? portalAccount.email ?? "this client"}${portalAccount.portalSetupExpiresAt ? ` until ${new Date(portalAccount.portalSetupExpiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}` : ""}.` : portalAccount?.portalAccountStatus === "revoked" ? "Client login access is revoked. Create a new setup link only when access should be restored." : "No client login account has been enabled yet."}</p></div><Badge variant="outline" className="capitalize">{portalAccount?.setupExpired ? "setup expired" : portalAccount?.portalAccountStatus?.replace(/_/g, " ") ?? "not enabled"}</Badge></div>
                <p className="mt-2 text-xs text-muted-foreground">Groomigo will not email or text setup links automatically. The client login uses a separate client-only session and cannot access staff or administrator screens. Use a separate browser profile or private window when demonstrating a client session on a staff device.</p>
                <div className="mt-3 flex flex-wrap gap-2">{["active", "setup_pending"].includes(portalAccount?.portalAccountStatus ?? "") && <Button variant="destructive" size="sm" onClick={() => setPortalAccountRevokeConfirm(true)}>Revoke login access</Button>}<Button size="sm" disabled={issuePortalAccountSetupLink.isPending} onClick={() => issuePortalAccountSetupLink.mutate({ clientId })}>{issuePortalAccountSetupLink.isPending ? "Creating setup…" : portalAccount?.portalAccountStatus === "active" ? "Create password reset setup" : "Create account setup link"}</Button></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setPortalLinkOpen(false)}>Close</Button></DialogFooter>
            </div>}
            {!portalLink && portalRevokeConfirm && <div className="space-y-4"><p className="text-sm text-muted-foreground">Revoke the active client portal link now? It will stop working immediately and cannot be restored. Groomigo will not notify the client.</p><DialogFooter><Button variant="outline" onClick={() => setPortalRevokeConfirm(false)}>Keep active</Button><Button variant="destructive" disabled={revokePortalLink.isPending} onClick={() => revokePortalLink.mutate({ clientId })}>{revokePortalLink.isPending ? "Revoking…" : "Revoke link"}</Button></DialogFooter></div>}
            {!portalSetupLink && portalAccountRevokeConfirm && <div className="space-y-4"><p className="text-sm text-muted-foreground">Revoke this client’s portal login now? Their password will stop working and any pending setup link will be invalidated. Groomigo will not notify the client.</p><DialogFooter><Button variant="outline" onClick={() => setPortalAccountRevokeConfirm(false)}>Keep access</Button><Button variant="destructive" disabled={revokePortalAccount.isPending} onClick={() => revokePortalAccount.mutate({ clientId })}>{revokePortalAccount.isPending ? "Revoking…" : "Revoke login"}</Button></DialogFooter></div>}
            {portalLink && <div className="space-y-4"><p className="text-sm text-muted-foreground">Share this link manually. It expires {portalLinkExpiresAt ? new Date(portalLinkExpiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "in 30 days"}.</p><div className="rounded-lg border bg-muted/40 p-3 break-all text-xs">{portalLink}</div><DialogFooter><Button variant="outline" onClick={() => setPortalLinkOpen(false)}>Close</Button><Button onClick={() => { navigator.clipboard.writeText(portalLink); toast.success("Client portal link copied"); }}><Copy className="mr-1.5 h-4 w-4" /> Copy link</Button></DialogFooter></div>}
            {portalSetupLink && <div className="space-y-4"><p className="text-sm text-muted-foreground">Share this setup link manually with {portalSetupEmail ?? "the client"}. It expires {portalSetupExpiresAt ? new Date(portalSetupExpiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "in 30 days"}. Existing setup links for this client are replaced.</p><div className="rounded-lg border bg-muted/40 p-3 break-all text-xs">{portalSetupLink}</div><DialogFooter><Button variant="outline" onClick={() => setPortalLinkOpen(false)}>Close</Button><Button onClick={() => { navigator.clipboard.writeText(portalSetupLink); toast.success("Client portal setup link copied"); }}><Copy className="mr-1.5 h-4 w-4" /> Copy setup link</Button></DialogFooter></div>}
          </DialogContent>
        </Dialog>

        {/* Hero header */}
        <div className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar */}
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-primary">
                {client.firstName[0]}{client.lastName[0]}
              </span>
            </div>

            {/* Name + contact */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold font-display">{client.firstName} {client.lastName}</h1>
                <Badge className={
                  client.status === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                  client.status === "blocked" ? "bg-red-100 text-red-800 border-red-200" :
                  "bg-slate-100 text-slate-600"
                }>
                  {client.status}
                </Badge>
                {activeMemberships.map(m => (
                  <MembershipBadge key={m.id} tier={m.tier} name={m.name} status={m.status} />
                ))}
              </div>

              <div className="flex items-center gap-4 mt-2 flex-wrap text-sm text-muted-foreground">
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <Phone className="h-3.5 w-3.5" /> {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <Mail className="h-3.5 w-3.5" /> {client.email}
                  </a>
                )}
                {client.address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {client.address}
                  </span>
                )}
              </div>

              {client.referralSource && (
                <p className="text-xs text-muted-foreground mt-1.5">Referred via: {client.referralSource}</p>
              )}
            </div>

            {/* Client since */}
            <div className="text-right text-sm text-muted-foreground flex-shrink-0">
              <p className="text-xs">Client since</p>
              <p className="font-medium text-foreground">
                {new Date(client.createdAt).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
              </p>
            </div>
          </div>

          {client.notes && (
            <>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground italic">{client.notes}</p>
            </>
          )}
        </div>

        {isAdmin && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><UserRoundPlus className="h-4 w-4 text-primary" /> Pickup contacts</CardTitle><p className="text-sm text-muted-foreground">The primary client number and any contacts listed here are available when staff send a ready-for-pickup message after a completed appointment.</p></CardHeader>
            <CardContent className="space-y-3">
              {client.phone && <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"><div><p className="text-sm font-medium">{client.firstName} {client.lastName} <Badge variant="outline" className="ml-1.5">Primary</Badge></p><p className="text-xs text-muted-foreground">{client.phone}</p></div></div>}
              {additionalContacts.map(contact => <div key={contact.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"><div className="min-w-0"><p className="text-sm font-medium truncate">{contact.name}{contact.relationship ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{contact.relationship}</span> : null}</p><p className="text-xs text-muted-foreground">{contact.phone}{contact.email ? ` · ${contact.email}` : ""}</p></div><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" title={`Remove ${contact.name}`} disabled={removeClientContact.isPending} onClick={() => removeClientContact.mutate({ clientId, contactId: contact.id })}><Trash2 className="h-4 w-4" /></Button></div>)}
              <div className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input placeholder="Contact name" value={contactForm.name} onChange={event => setContactForm(current => ({ ...current, name: event.target.value }))} />
                <Input placeholder="Mobile number" value={contactForm.phone} onChange={event => setContactForm(current => ({ ...current, phone: event.target.value }))} />
                <Input placeholder="Relationship (optional)" value={contactForm.relationship} onChange={event => setContactForm(current => ({ ...current, relationship: event.target.value }))} />
                <div className="flex gap-2"><Input className="min-w-0" placeholder="Email (optional)" value={contactForm.email} onChange={event => setContactForm(current => ({ ...current, email: event.target.value }))} /><Button className="shrink-0" disabled={addClientContact.isPending || !contactForm.name.trim() || !contactForm.phone.trim()} onClick={() => addClientContact.mutate({ clientId, name: contactForm.name, phone: contactForm.phone, email: contactForm.email || undefined, relationship: contactForm.relationship || undefined })}>{addClientContact.isPending ? "Saving…" : "Add"}</Button></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Dog className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold font-display">{pets.length}</p>
                <p className="text-xs text-muted-foreground">Pets</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="h-4.5 w-4.5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold font-display">{appointments.length}</p>
                <p className="text-xs text-muted-foreground">Appointments</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Award className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold font-display">{activeMemberships.length}</p>
                <p className="text-xs text-muted-foreground">Active Memberships</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold font-display">${totalSpend.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Total Spend</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Last / Next visit */}
        {(lastVisit || nextVisit) && (
          <div className="flex gap-3 flex-wrap">
            {lastVisit && (
              <div className="flex items-center gap-2 text-sm bg-card border rounded-lg px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Last visit:</span>
                <span className="font-medium">{new Date(lastVisit).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            )}
            {nextVisit && (
              <div className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Next visit:</span>
                <span className="font-medium text-primary">{new Date(nextVisit.scheduledStart).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="text-muted-foreground text-xs">({nextVisit.petName})</span>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="pets">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="pets">
              <Dog className="h-3.5 w-3.5 mr-1.5" />Pets ({pets.length})
            </TabsTrigger>
            <TabsTrigger value="appointments">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />Appointments ({appointments.length})
            </TabsTrigger>
            <TabsTrigger value="memberships">
              <Award className="h-3.5 w-3.5 mr-1.5" />Memberships ({memberships.length})
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />Payments ({payments.length})
            </TabsTrigger>
            <TabsTrigger value="activity">
              <History className="h-3.5 w-3.5 mr-1.5" />Activity ({petMembershipEvents.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Pets tab ── */}
          <TabsContent value="pets" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pets.length === 0 && <p className="text-muted-foreground text-sm col-span-3">No pets on file.</p>}
              {pets.map(pet => {
                const pMemberships = petMemberships[pet.id] ?? [];
                const activePetMembership = pMemberships.find(m => m.status === "active");
                return (
                  <Card key={pet.id} className={`relative overflow-hidden ${pet.status === "departed" ? "border-amber-300 bg-gradient-to-br from-amber-50/80 via-card to-rose-50/50 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]" : ""}`}>
                    {/* Colour strip */}
                    <div className="h-1.5 w-full" style={{ background: pet.status === "departed" ? "#d97706" : activePetMembership ? (TIER_COLOURS[activePetMembership.tier]?.text.replace("text-", "var(--") ?? "#6366f1") : "#6366f1" }} />
                    {pet.status === "departed" && (
                      <div className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-100 text-amber-800 shadow-sm" title="Memorial — passed away">
                        <HeartCrack className="h-4 w-4" aria-hidden="true" />
                      </div>
                    )}
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Dog className="h-4 w-4 text-primary" />
                          {pet.name}
                        </span>
                        {pet.status === "departed" && (
                          <Badge variant="outline" className="border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                            <HeartCrack className="mr-1 h-3 w-3" /> Memorial · Passed away
                          </Badge>
                        )}
                        {activePetMembership && (
                          <MembershipBadge tier={activePetMembership.tier} name={activePetMembership.name} status={activePetMembership.status} />
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1.5 text-sm">
                      <div className="flex items-start gap-2 overflow-x-auto pb-1">
                        {(photosByPet[pet.id] ?? []).slice(0, 6).map(photo => (
                          <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block shrink-0 group" title={photo.caption ?? "View groom photo"}>
                            <img src={photo.url} alt={photo.caption ?? `${pet.name} groom photo`} className="h-16 w-16 rounded-lg object-cover border transition-transform duration-200 group-hover:scale-105" />
                          </a>
                        ))}
                        <label className="h-16 w-16 shrink-0 cursor-pointer rounded-lg border border-dashed border-primary/40 bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 text-[10px] font-medium hover:bg-primary/10 transition-colors">
                          <ImagePlus className="h-4 w-4" />
                          {uploadingPhotoForPetId === pet.id ? "Uploading" : "Add photo"}
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={uploadingPhotoForPetId === pet.id}
                            onChange={event => {
                              const file = event.target.files?.[0];
                              if (file) void handleGroomPhotoUpload(pet.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {pet.breed && <p><span className="text-muted-foreground">Breed:</span> <span className="font-medium">{pet.breed}</span></p>}
                      <div className="flex flex-wrap items-center gap-4">
                        {editingWeightPetId === pet.id ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/5 px-2 py-1.5">
                            <Label htmlFor={`pet-weight-${pet.id}`} className="text-xs text-muted-foreground">Weight (kg)</Label>
                            <Input
                              id={`pet-weight-${pet.id}`}
                              type="number"
                              min="0"
                              max="80"
                              step="0.1"
                              inputMode="decimal"
                              className="h-8 w-24 bg-background text-sm"
                              value={weightDraft}
                              onChange={event => setWeightDraft(event.target.value)}
                              aria-describedby={`pet-weight-help-${pet.id}`}
                            />
                            <span id={`pet-weight-help-${pet.id}`} className="text-[11px] text-muted-foreground">Leave blank if unknown</span>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              disabled={updatePetWeight.isPending}
                              onClick={() => {
                                const enteredWeight = weightDraft.trim();
                                const parsedWeight = enteredWeight === "" ? null : Number(enteredWeight);
                                if (parsedWeight !== null && (!Number.isFinite(parsedWeight) || parsedWeight < 0 || parsedWeight > 80)) {
                                  toast.error("Enter a weight from 0 to 80 kg, or leave it blank if unknown");
                                  return;
                                }
                                updatePetWeight.mutate({ petId: pet.id, weightKg: parsedWeight });
                              }}
                            >
                              {updatePetWeight.isPending ? "Saving" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              disabled={updatePetWeight.isPending}
                              onClick={() => { setEditingWeightPetId(null); setWeightDraft(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p><span className="text-muted-foreground">Weight:</span> {pet.weightKg ? `${pet.weightKg} kg` : "Not recorded"}</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => { setEditingWeightPetId(pet.id); setWeightDraft(pet.weightKg ?? ""); }}
                            >
                              Edit weight
                            </Button>
                          </div>
                        )}
                        {pet.gender && <p><span className="text-muted-foreground">Gender:</span> {pet.gender}{pet.desexed ? " (desexed)" : ""}</p>}
                      </div>
                      {pet.coatType && <p><span className="text-muted-foreground">Coat:</span> {pet.coatType}</p>}
                      {pet.colour && <p><span className="text-muted-foreground">Colour:</span> {pet.colour}</p>}
                      {(pet.alertLevel === "danger" || pet.alertLevel === "caution") && (
                        <div className="mt-2">
                          <AlertBadge level={pet.alertLevel} warnings={pet.warnings} />
                        </div>
                      )}
                      {pet.behaviourNotes && (
                        <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-800 border border-amber-100">
                          <span className="font-semibold">Behaviour:</span> {pet.behaviourNotes}
                        </div>
                      )}
                      {pet.groomingNotes && (
                        <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-blue-800 border border-blue-100">
                          <span className="font-semibold">Grooming:</span> {pet.groomingNotes}
                        </div>
                      )}
                      {/* All memberships for this pet */}
                      {pMemberships.length > 0 && (
                        <div className="mt-2 pt-2 border-t space-y-1">
                          {pMemberships.map(m => (
                            <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                              <MembershipBadge tier={m.tier} name={m.name} status={m.status} />
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">${m.pricePerCycle}/wk</span>
                                {isAdmin && pet.status === "departed" && !["cancelled", "expired"].includes(m.status) && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => {
                                      setMembershipAction({ membershipId: m.id, petId: pet.id, petName: pet.name, membershipName: m.name });
                                      setDepartureMembershipAction("transfer");
                                      setReplacementPetId("");
                                      setShowMembershipActionSummary(false);
                                    }}
                                  >
                                    Manage
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {isAdmin && pet.status !== "departed" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-8 w-full border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                          onClick={() => setDepartedPet({ id: pet.id, name: pet.name })}
                        >
                          <HeartCrack className="mr-1.5 h-3.5 w-3.5" /> Record passing
                        </Button>
                      )}
                      {/* Family Link section */}
                      <div className="mt-2 pt-2 border-t">
                        {familyLinkPetId === pet.id ? (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                              <Link2 className="h-3 w-3" /> Link to another dog
                            </p>
                            <div className="flex gap-1">
                              <Input
                                value={familySearch}
                                onChange={e => { setFamilySearch(e.target.value); setFamilySearchActive(true); }}
                                placeholder="Search dog or owner..."
                                className="h-7 text-xs"
                              />
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setFamilyLinkPetId(null); setFamilySearch(""); }}>
                                <Link2Off className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {familySearchResults && familySearchResults.length > 0 && (
                              <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                                {familySearchResults.map(r => (
                                  <button
                                    key={r.id}
                                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-primary/5 border-b last:border-0 flex items-center justify-between gap-2"
                                    onClick={() => linkPets.mutate({ petIds: [pet.id, r.id] })}
                                  >
                                    <span><strong>{r.name}</strong> ({r.breed ?? "unknown breed"}) — {r.clientFirstName} {r.clientLastName}</span>
                                    <Link2 className="h-3 w-3 text-primary flex-shrink-0" />
                                  </button>
                                ))}
                              </div>
                            )}
                            {familySearch.length >= 2 && familySearchResults?.length === 0 && (
                              <p className="text-xs text-muted-foreground">No dogs found</p>
                            )}
                          </div>
                        ) : (
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => setFamilyLinkPetId(pet.id)}
                          >
                            <Link2 className="h-3 w-3" />
                            {(pet as any).familyGroupId ? "Manage family link" : "Link to family"}
                          </button>
                        )}
                        {/* Show linked family pets as clickable badges */}
                        {(pet as any).familyGroupId && (
                          <FamilyLinkedPets petId={pet.id} />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {petMembershipEvents.length > 0 && (
              <div className="mt-4 rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-primary" /> Pet & membership care history
                </div>
                <div className="space-y-2">
                  {petMembershipEvents.map(event => {
                    const sourcePet = pets.find(pet => pet.id === event.petId)?.name ?? "Pet";
                    const replacementPet = pets.find(pet => pet.id === event.replacementPetId)?.name;
                    const membership = memberships.find(item => item.id === event.membershipId)?.name;
                    const description = event.eventType === "pet_marked_departed"
                      ? `${sourcePet} was recorded as passed away`
                      : event.eventType === "membership_transferred"
                        ? `${membership ?? "Membership"} moved from ${sourcePet} to ${replacementPet ?? "replacement pet"}`
                        : `${membership ?? "Membership"} was removed for ${sourcePet}`;
                    return (
                      <div key={event.id} className="rounded-lg border bg-card px-3 py-2 text-xs">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-medium">{description}</span>
                          <span className="text-muted-foreground">{new Date(event.changedAt).toLocaleDateString("en-AU")} · {event.changedByName ?? "Administrator"}</span>
                        </div>
                        {event.note && <p className="mt-1 text-muted-foreground italic">{event.note}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Appointments tab ── */}
          <TabsContent value="appointments" className="mt-4">
            <div className="bg-card rounded-xl border overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">Date & Time</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Pet</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Service</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Groomer</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No appointments yet.</td></tr>
                  )}
                  {appointments.map((a, idx) => {
                    const isFuture = new Date(a.scheduledStart) > new Date();
                    return (
                      <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/20 ${isFuture ? "bg-primary/3" : ""}`}>
                        <td className="p-3">
                          <div className="font-medium">{new Date(a.scheduledStart).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</div>
                          <div className="text-xs text-muted-foreground">{new Date(a.scheduledStart).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true })}</div>
                        </td>
                        <td className="p-3">
                          <span className="font-medium">{a.petName}</span>
                          {a.petBreed && <div className="text-xs text-muted-foreground">{a.petBreed}</div>}
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ background: SERVICE_COLOUR[a.serviceType] ?? "#64748b" }}>
                            {SERVICE_LABELS[a.serviceType] ?? a.serviceType}
                          </span>
                        </td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{a.staffName ?? "—"}</td>
                        <td className="p-3">
                          <Badge className={
                            a.workflowState === "complete" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                            a.status === "cancelled" ? "bg-red-100 text-red-800 border-red-200" :
                            isFuture ? "bg-primary/10 text-primary border-primary/20" :
                            "bg-slate-100 text-slate-600"
                          } variant="outline">
                            {isFuture ? "Upcoming" : a.workflowState === "complete" ? "Complete" : a.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-medium">{a.price ? `$${parseFloat(a.price).toFixed(2)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Memberships tab ── */}
          <TabsContent value="memberships" className="mt-4">
            <div className="space-y-3">
              {memberships.length === 0 && <p className="text-muted-foreground text-sm">No memberships on file.</p>}
              {memberships.map(m => {
                const colours = TIER_COLOURS[m.tier] ?? TIER_COLOURS.bronze;
                const icon = TIER_ICONS[m.tier] ?? "🏅";
                return (
                  <Card key={m.id} className={`border-2 ${colours.border}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-lg ${colours.bg} border ${colours.border}`}>
                            {icon}
                          </div>
                          <div>
                            <p className="font-semibold text-base">{m.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {m.petName && <span>For <strong>{m.petName}</strong> · </span>}
                              ${m.pricePerCycle}/wk · {m.billingCycleWeeks}wk billing cycle
                            </p>
                          </div>
                        </div>
                        <Badge className={
                          m.status === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                          m.status === "pending_payment" ? "bg-amber-100 text-amber-800 border-amber-200" :
                          m.status === "cancelled" ? "bg-red-100 text-red-800 border-red-200" :
                          "bg-slate-100 text-slate-600"
                        }>
                          {m.status === "active" ? "✓ Active" : m.status === "pending_payment" ? "⚠ Payment Due" : m.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Started</p>
                          <p className="font-medium">{new Date(m.startedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
                        </div>
                        {m.nextBillingDate && (
                          <div>
                            <p className="text-xs text-muted-foreground">Next Billing</p>
                            <p className="font-medium">{new Date(m.nextBillingDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
                          </div>
                        )}
                        {m.cancelledAt && (
                          <div>
                            <p className="text-xs text-muted-foreground">Cancelled</p>
                            <p className="font-medium text-red-600">{new Date(m.cancelledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">Tier</p>
                          <p className={`font-semibold capitalize ${colours.text}`}>{icon} {m.tier}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Payments tab ── */}
          <TabsContent value="payments" className="mt-4">
            <StoreCreditCard clientId={client.id} />

            <div className="bg-card rounded-xl border overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Membership</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No payment records.</td></tr>
                  )}
                  {payments.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{p.membershipName ?? "—"}</td>
                      <td className="p-3">
                        <Badge className={
                          p.status === "paid" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                          p.status === "failed" ? "bg-red-100 text-red-800 border-red-200" :
                          p.status === "refunded" ? "bg-blue-100 text-blue-800 border-blue-200" :
                          "bg-amber-100 text-amber-800 border-amber-200"
                        } variant="outline">
                          {p.status === "paid" ? "✓ Paid" : p.status === "failed" ? "✗ Failed" : p.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-medium">${parseFloat(p.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="border-b bg-muted/30 px-5 py-4">
                <div className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-primary" />Membership & pet activity</div>
                <p className="mt-1 text-xs text-muted-foreground">A timestamped record of departed-pet updates, membership swaps and removals.</p>
              </div>
              {petMembershipEvents.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">No membership or departed-pet changes have been recorded for this client.</p>
              ) : (
                <div className="divide-y">
                  {petMembershipEvents.map(event => {
                    const sourcePet = pets.find(pet => pet.id === event.petId)?.name ?? "Pet";
                    const replacementPet = pets.find(pet => pet.id === event.replacementPetId)?.name;
                    const membership = memberships.find(item => item.id === event.membershipId)?.name;
                    const isTransfer = event.eventType === "membership_transferred";
                    const description = event.eventType === "pet_marked_departed"
                      ? `${sourcePet} was recorded as passed away`
                      : isTransfer
                        ? `${membership ?? "Membership"} moved from ${sourcePet} to ${replacementPet ?? "replacement pet"}`
                        : `${membership ?? "Membership"} was removed for ${sourcePet}`;
                    return <div key={event.id} className="flex gap-3 px-5 py-4">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${event.eventType === "pet_marked_departed" ? "bg-amber-100 text-amber-800" : isTransfer ? "bg-teal-100 text-teal-800" : "bg-red-100 text-red-800"}`}><History className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-sm">{description}</p><Badge variant="outline" className="text-[10px]">{event.eventType === "pet_marked_departed" ? "Pet status" : isTransfer ? "Membership transfer" : "Membership removed"}</Badge></div>{event.note && <p className="mt-1 text-sm text-muted-foreground italic">{event.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{new Date(event.changedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} · {event.changedByName ?? "Administrator"}</p></div>
                    </div>;
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Book Appointment Dialog ── */}
      <Dialog open={bookOpen} onOpenChange={open => { setBookOpen(open); if (!open) setBookFamilyPetIds([]); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Book Appointment — {client.firstName} {client.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Pet selector */}
            <div className="space-y-1.5">
              <Label>Pet</Label>
	              <Select value={bookPetId} onValueChange={value => { setBookPetId(value); setBookFamilyPetIds([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pet..." />
                </SelectTrigger>
                <SelectContent>
                  {activePets.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} {p.breed ? `— ${p.breed}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bookingFamilyCompanions.length > 0 && <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/70 p-3"><p className="text-sm font-semibold text-violet-950">Family-linked dogs</p><p className="mt-0.5 text-xs text-violet-800">Add family companions to this shared appointment?</p><div className="mt-2 flex flex-wrap gap-2">{bookingFamilyCompanions.map(pet => { const included = bookFamilyPetIds.includes(String(pet.id)); return <Button key={pet.id} type="button" size="sm" variant={included ? "default" : "outline"} className={included ? "bg-violet-700 hover:bg-violet-800" : "border-violet-300 bg-white text-violet-900 hover:bg-violet-100"} onClick={() => setBookFamilyPetIds(current => included ? current.filter(id => id !== String(pet.id)) : [...current, String(pet.id)])}>{included ? "✓ " : "+ "}{pet.name}</Button>; })}</div></div>}
              {bookingPetIds.length > 0 && bookingMembershipCoverage.fullyCovered && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-emerald-600 text-white">Weekly membership active</Badge>{Object.values(bookingMembershipCoverage.membershipByPetId).map(membership => <span key={membership.id} className="text-xs font-medium">{membership.name} · {membership.tier}</span>)}</div><p className="mt-1 text-xs text-emerald-800">Every selected dog is covered for this service. This appointment is recorded as $0.00 because payment is managed through the weekly membership.</p></div>}
              {bookingPetIds.length > 0 && !bookingMembershipCoverage.fullyCovered && bookingMembershipCoverage.coveredPetIds.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Some selected dogs have an active membership, but not every selected dog is covered for this service. Review the appointment price before saving.</div>}
            </div>
            {/* Service */}
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={bookService} onValueChange={setBookService}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic_groom">Classic Groom</SelectItem>
                  <SelectItem value="styled_groom">Styled Groom</SelectItem>
                  <SelectItem value="bath_only">Bath</SelectItem>
                  <SelectItem value="fft">FFT (Face, Feet &amp; Hygiene Tidy)</SelectItem>
                  <SelectItem value="deshed">De-shed</SelectItem>
                  <SelectItem value="nail_trim">Nail Trim</SelectItem>
                  <SelectItem value="daycare">Daycare</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} />
              </div>
            </div>
            {/* Groomer */}
            <div className="space-y-1.5">
              <Label>Groomer (optional)</Label>
              <Select value={bookStaffId || "__none__"} onValueChange={v => setBookStaffId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Any available" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any available</SelectItem>
                  {staffList?.filter(s => s.isActive).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>Cancel</Button>
            <Button onClick={handleBook} disabled={createAppt.isPending}>
              {createAppt.isPending ? "Booking..." : "Book Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(departedPet)} onOpenChange={(open) => { if (!open && !markDeparted.isPending) setDepartedPet(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900"><HeartCrack className="h-5 w-5" /> Record a pet’s passing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <p>This keeps <strong>{departedPet?.name}</strong> in the client’s history. It will not delete past appointments, grooming reports or payment records.</p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">If there is an active membership, use its <strong>Manage</strong> button after saving to either transfer it to an eligible same-size replacement pet or remove it and stop future billing.</p>
            <div className="space-y-1.5">
              <Label htmlFor="departure-note">Private care note (optional)</Label>
              <Input id="departure-note" value={departureNote} onChange={event => setDepartureNote(event.target.value)} placeholder="For example: client advised us today" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={markDeparted.isPending} onClick={() => setDepartedPet(null)}>Cancel</Button>
            <Button className="bg-amber-700 hover:bg-amber-800" disabled={markDeparted.isPending || !departedPet} onClick={() => departedPet && markDeparted.mutate({ petId: departedPet.id, note: departureNote || undefined })}>
              {markDeparted.isPending ? "Saving…" : "Record passing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(membershipAction) && !showMembershipActionSummary} onOpenChange={(open) => { if (!open && !manageDepartedPetMembership.isPending) { setMembershipAction(null); setShowMembershipActionSummary(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage {membershipAction?.membershipName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1 text-sm">
            <p><strong>{membershipAction?.petName}</strong> remains in the client’s care history. Choose how to handle this membership; no historical records will be deleted.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={departureMembershipAction === "transfer" ? "default" : "outline"} className="h-auto min-h-20 whitespace-normal" onClick={() => setDepartureMembershipAction("transfer")}>
                <Replace className="mr-1.5 h-4 w-4" /> Transfer to replacement
              </Button>
              <Button type="button" variant={departureMembershipAction === "remove" ? "destructive" : "outline"} className="h-auto min-h-20 whitespace-normal" onClick={() => setDepartureMembershipAction("remove")}>
                <Unlink className="mr-1.5 h-4 w-4" /> Remove membership
              </Button>
            </div>
            {departureMembershipAction === "transfer" ? (
              <div className="space-y-1.5">
                <Label>Eligible replacement pet</Label>
                {!addingReplacementPet ? (
                  <>
                    <Select value={replacementPetId} onValueChange={setReplacementPetId}>
                      <SelectTrigger><SelectValue placeholder="Select a same-size active pet..." /></SelectTrigger>
                      <SelectContent>
                        {pets.filter(pet => pet.status === "active" && pet.id !== membershipAction?.petId).map(pet => {
                          const source = pets.find(item => item.id === membershipAction?.petId);
                          const eligible = source ? isEligibleMembershipReplacement(source, pet) : false;
                          return <SelectItem key={pet.id} value={String(pet.id)} disabled={!eligible}>{pet.name} {pet.weightKg ? `· ${pet.weightKg}kg` : "· weight required"}{eligible ? "" : " · different band"}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="mt-2 w-full border-dashed" onClick={() => { setAddingReplacementPet(true); setReplacementPetForm({ name: "", breed: "", weightKg: "" }); }}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Add new pet
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-primary">Add a replacement pet</p>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAddingReplacementPet(false)}>Use an existing pet</Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="replacement-pet-name" className="text-xs">Name</Label>
                        <Input id="replacement-pet-name" value={replacementPetForm.name} onChange={event => setReplacementPetForm(form => ({ ...form, name: event.target.value }))} placeholder="New dog’s name" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="replacement-pet-weight" className="text-xs">Weight (kg)</Label>
                        <Input id="replacement-pet-weight" type="number" min="0" max="80" step="0.1" value={replacementPetForm.weightKg} onChange={event => setReplacementPetForm(form => ({ ...form, weightKg: event.target.value }))} placeholder="Required" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="replacement-pet-breed" className="text-xs">Breed (optional)</Label>
                      <Input id="replacement-pet-breed" value={replacementPetForm.breed} onChange={event => setReplacementPetForm(form => ({ ...form, breed: event.target.value }))} placeholder="Breed" />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={createReplacementPet.isPending || !replacementPetForm.name.trim() || !replacementPetForm.weightKg}
                      onClick={() => {
                        const source = pets.find(pet => pet.id === membershipAction?.petId);
                        const candidate = { id: 0, weightKg: replacementPetForm.weightKg, status: "active" as const };
                        if (!source || !isEligibleMembershipReplacement(source, candidate)) {
                          toast.error("The new pet must be in the same configured weight band before this membership can be transferred.");
                          return;
                        }
                        createReplacementPet.mutate({ clientId, name: replacementPetForm.name.trim(), breed: replacementPetForm.breed.trim() || undefined, weightKg: replacementPetForm.weightKg });
                      }}
                    >
                      {createReplacementPet.isPending ? "Adding pet…" : "Add and select this pet"}
                    </Button>
                  </div>
                )}
                {replacementPetId && (() => {
                  const source = pets.find(pet => pet.id === membershipAction?.petId);
                  const replacement = pets.find(pet => pet.id === Number(replacementPetId));
                  return source && replacement ? <p className="text-xs text-muted-foreground">{replacementEligibilityMessage(source, replacement)}</p> : null;
                })()}
                <p className="text-xs text-muted-foreground">Transfers are limited to an active pet on this client’s account in the same configured weight band.</p>
              </div>
            ) : (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">This cancels the membership record for future billing and preserves its payments and care history.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="membership-care-note">Private care note (optional)</Label>
              <Input id="membership-care-note" value={membershipActionNote} onChange={event => setMembershipActionNote(event.target.value)} placeholder="Optional administrative note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={manageDepartedPetMembership.isPending} onClick={() => setMembershipAction(null)}>Cancel</Button>
            <Button variant={departureMembershipAction === "remove" ? "destructive" : "default"} disabled={manageDepartedPetMembership.isPending || (departureMembershipAction === "transfer" && !replacementPetId)} onClick={() => setShowMembershipActionSummary(true)}>
              Review changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(membershipAction) && showMembershipActionSummary} onOpenChange={(open) => { if (!open && !manageDepartedPetMembership.isPending) setShowMembershipActionSummary(false); }}>
        <DialogContent className="max-w-md">
          {(() => {
            const selectedMembership = memberships.find(item => item.id === membershipAction?.membershipId);
            const replacementPet = pets.find(pet => pet.id === Number(replacementPetId));
            const billingImpact = getDepartedMembershipBillingImpact(departureMembershipAction, selectedMembership?.pricePerCycle, selectedMembership?.nextBillingDate);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{departureMembershipAction === "transfer" ? "Confirm membership transfer" : "Confirm membership removal"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm">
                  <p>Review the outcome below. Nothing has been changed yet.</p>
                  <div className={`rounded-xl border p-4 ${departureMembershipAction === "remove" ? "border-red-200 bg-red-50" : "border-primary/20 bg-primary/5"}`}>
                    <div className="flex items-start gap-3">
                      {departureMembershipAction === "transfer" ? <Replace className="mt-0.5 h-5 w-5 text-primary" /> : <Unlink className="mt-0.5 h-5 w-5 text-red-700" />}
                      <div className="space-y-2">
                        <p className="font-semibold">{selectedMembership?.name ?? membershipAction?.membershipName}</p>
                        <p><span className="text-muted-foreground">Current pet:</span> <strong>{membershipAction?.petName}</strong></p>
                        {departureMembershipAction === "transfer" ? (
                          <>
                            <p><span className="text-muted-foreground">Replacement pet:</span> <strong>{replacementPet?.name}</strong>{replacementPet?.weightKg ? ` · ${replacementPet.weightKg}kg` : ""}</p>
                            <p><span className="text-muted-foreground">Future billing:</span> {billingImpact}</p>
                            <p className="text-xs text-muted-foreground">The membership tier, payment history and care records remain unchanged; only the eligible pet assignment changes.</p>
                          </>
                        ) : (
                          <>
                            <p><span className="text-muted-foreground">Future billing:</span> <strong className="text-red-800">{billingImpact}</strong></p>
                            <p className="text-xs text-muted-foreground">Past payments, invoices, appointments and grooming history remain preserved on this client record.</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {membershipActionNote && <p className="rounded-lg border bg-muted/30 p-3 text-xs"><span className="font-semibold">Private note:</span> {membershipActionNote}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" disabled={manageDepartedPetMembership.isPending} onClick={() => setShowMembershipActionSummary(false)}>Back</Button>
                  <Button variant={departureMembershipAction === "remove" ? "destructive" : "default"} disabled={manageDepartedPetMembership.isPending || (departureMembershipAction === "transfer" && !replacementPetId)} onClick={() => membershipAction && manageDepartedPetMembership.mutate({ membershipId: membershipAction.membershipId, petId: membershipAction.petId, action: departureMembershipAction, replacementPetId: departureMembershipAction === "transfer" ? Number(replacementPetId) : undefined, note: membershipActionNote || undefined })}>
                    {manageDepartedPetMembership.isPending ? "Saving…" : departureMembershipAction === "transfer" ? "Confirm transfer" : "Confirm removal"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
