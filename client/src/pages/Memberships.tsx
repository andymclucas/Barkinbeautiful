import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CreditCard, Search, Dog, Phone, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Plus, TrendingDown, FileText, CheckCircle, XCircle, RefreshCw, Landmark } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MembershipAccountsReceivable } from "@/components/MembershipAccountsReceivable";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type MembershipItem = {
  id: number;
  clientId: number | null;
  name: string | null;
  tier: string | null;
  serviceType: string | null;
  status: string;
  pricePerCycle: string | null;
  billingCycleWeeks: number | null;
  nextBillingDate: number | Date | null;
  failedPaymentCount: number | null;
  bookingSuspended: boolean | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientPhone: string | null;
  petName: string | null;
  petBreed: string | null;
};

type SortKey = "client" | "membership" | "tier" | "price" | "nextBilling" | "status";
type SortDir = "asc" | "desc";
type MembershipTier = "diamond" | "platinum" | "gold" | "silver" | "bronze";
type MembershipWeightClass = "small" | "small_medium" | "medium" | "large" | "extra_large" | "giant";

const TIER_ORDER: Record<string, number> = { diamond: 0, platinum: 1, gold: 2, silver: 3, bronze: 4 };

const STATUS_COLOURS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-800",
  pending_payment: "bg-amber-100 text-amber-800",
  expired: "bg-slate-100 text-slate-500",
};

const TIER_COLOURS: Record<string, string> = {
  diamond: "bg-violet-100 text-violet-800",
  platinum: "bg-slate-200 text-slate-700",
  gold: "bg-yellow-100 text-yellow-800",
  silver: "bg-slate-100 text-slate-600",
  bronze: "bg-orange-100 text-orange-800",
};

const TIER_OPTIONS = [
  { value: "all", label: "All Tiers" },
  { value: "diamond", label: "💎 Diamond" },
  { value: "platinum", label: "🥈 Platinum" },
  { value: "gold", label: "🥇 Gold" },
  { value: "silver", label: "🪙 Silver" },
  { value: "bronze", label: "🏅 Bronze" },
];

const MEMBERSHIP_TIER_OPTIONS: Array<{ value: MembershipTier; label: string }> = [
  { value: "diamond", label: "Diamond" },
  { value: "platinum", label: "Platinum" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bronze", label: "Bronze" },
];

const STATUS_TABS = [
  { key: "active", label: "Active" },
  { key: "pending_payment", label: "Pending Payment" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 50;

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />;
}

// ─── Client Preview ───────────────────────────────────────────────────────────
function MembershipClientPreview({ m, children }: { m: MembershipItem; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = trpc.clients.quickPreview.useQuery(
    { clientId: m.clientId ?? 0 },
    { enabled: open && !!m.clientId, staleTime: 60_000 }
  );

  if (!m.clientId) return <>{children}</>;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={350} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className="inline-flex max-w-full">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent className="z-[70] w-80 overflow-hidden rounded-xl border border-primary/15 bg-popover p-0 shadow-xl shadow-black/15" side="right" align="center" sideOffset={14} collisionPadding={16}>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading client overview…</div>
        ) : (
          <div className="divide-y">
            <div className="bg-primary/[0.06] px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{m.clientFirstName} {m.clientLastName}</p>
              {m.clientPhone ? (
                <a href={`tel:${m.clientPhone.replace(/\s/g, "")}`} className="mt-1.5 flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                  <Phone className="h-3 w-3" /> {m.clientPhone}
                </a>
              ) : <p className="mt-1 text-xs text-muted-foreground">No phone number on file</p>}
            </div>
            <div className="p-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Dog className="h-3 w-3" /> Associated pets</p>
              {data?.pets.length ? (
                <div className="space-y-1.5">
                  {data.pets.map((pet) => (
                    <div key={pet.id} className="flex items-center gap-2 text-xs">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100"><Dog className="h-3 w-3 text-amber-600" /></div>
                      <span className="font-medium">{pet.name}</span>
                      {pet.breed && <span className="text-muted-foreground">· {pet.breed}</span>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">No pets on file</p>}
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
              <span>{m.petName}{m.petBreed ? ` · ${m.petBreed}` : ""}</span>
              {m.failedPaymentCount && m.failedPaymentCount > 0 && <span className="font-semibold text-red-600">{m.failedPaymentCount} failed payment{m.failedPaymentCount === 1 ? "" : "s"}</span>}
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── Add New Membership Modal ─────────────────────────────────────────────────
type ClientResult = {
  clientId: number | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  petId: number | null;
  petName: string | null;
  petBreed: string | null;
};

function AddMembershipModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [manualTier, setManualTier] = useState<MembershipTier | "">("");
  const [manualWeightClass, setManualWeightClass] = useState<MembershipWeightClass | "">("");
  const [form, setForm] = useState({
    packageId: "",
    paymentGateway: "cash" as "square" | "stripe" | "cash" | "other",
    nextBillingDate: "",
  });

  const { data: searchResults } = trpc.memberships.searchClients.useQuery(
    { tenantId: 1, search: clientSearch },
    { enabled: clientSearch.length >= 2 }
  );
  const { data: packageOptions, isLoading: isLoadingPackages } = trpc.memberships.getPackageOptions.useQuery(
    { tenantId: 1, clientId: selectedClient?.clientId ?? 0, petId: selectedClient?.petId ?? 0 },
    { enabled: !!selectedClient?.clientId && !!selectedClient?.petId },
  );
  const { data: currentUser } = trpc.auth.me.useQuery();
  const isAdmin = currentUser?.role === "admin";
  const requiresManualWeightSelection = packageOptions?.requiresManualWeightSelection ?? false;
  const manualPackageOptions = (packageOptions?.packages ?? []).filter((membershipPackage) =>
    membershipPackage.tier === manualTier && membershipPackage.weightClass === manualWeightClass,
  );
  const selectedPackage = packageOptions?.packages.find((membershipPackage) => membershipPackage.id === form.packageId);

  const createMutation = trpc.memberships.create.useMutation({
    onSuccess: () => {
      toast.success("Membership created successfully");
      onSuccess();
      onClose();
      setClientSearch("");
      setSelectedClient(null);
      setManualTier("");
      setManualWeightClass("");
      setForm({ packageId: "", paymentGateway: "cash", nextBillingDate: "" });
    },
    onError: (e) => toast.error(`Failed to create membership: ${e.message}`),
  });

  const handleSubmit = () => {
    if (!selectedClient?.clientId || !selectedClient?.petId) {
      toast.error("Please select a client and pet");
      return;
    }
    if (!form.packageId) {
      toast.error("Please choose a membership package");
      return;
    }
    if (requiresManualWeightSelection && (!manualTier || !manualWeightClass)) {
      toast.error("Choose an approved membership tier and weight band");
      return;
    }
    createMutation.mutate({
      tenantId: 1,
      clientId: selectedClient.clientId,
      petId: selectedClient.petId,
      ...form,
      manualWeightClass: requiresManualWeightSelection ? manualWeightClass || undefined : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Membership</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Client search */}
          <div className="space-y-1">
            <Label>Client / Pet <span className="text-red-500">*</span></Label>
            {selectedClient ? (
              <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                <div>
                  <p className="font-medium text-sm">{selectedClient.firstName} {selectedClient.lastName}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.petName} {selectedClient.petBreed ? `(${selectedClient.petBreed})` : ""}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedClient(null); setManualTier(""); setManualWeightClass(""); setForm(f => ({ ...f, packageId: "" })); }}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search client name..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
                {searchResults && searchResults.length > 0 && clientSearch.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {searchResults.map((r, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                        onClick={() => { setSelectedClient(r); setClientSearch(""); setManualTier(""); setManualWeightClass(""); setForm(f => ({ ...f, packageId: "" })); }}
                      >
                        <span className="font-medium">{r.firstName} {r.lastName}</span>
                        <span className="text-muted-foreground ml-2">{r.petName} {r.petBreed ? `(${r.petBreed})` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Membership package <span className="text-red-500">*</span></Label>
            {!selectedClient ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Select a client and dog to see their eligible VIP packages.</p>
            ) : isLoadingPackages ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Checking the dog’s recorded weight…</p>
            ) : requiresManualWeightSelection ? (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-medium">A verified recorded weight is not available for this dog.</p>
                  <p className="mt-1 text-xs text-amber-900">Choose the membership tier first, then an approved weight band. This fallback only sets the membership package and does not change the dog’s recorded weight.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="membership-tier">VIP tier <span className="text-red-500">*</span></Label>
                  <Select
                    value={manualTier}
                    onValueChange={(tier) => {
                      setManualTier(tier as MembershipTier);
                      setManualWeightClass("");
                      setForm(f => ({ ...f, packageId: "" }));
                    }}
                  >
                    <SelectTrigger id="membership-tier"><SelectValue placeholder="Choose a tier" /></SelectTrigger>
                    <SelectContent>
                      {MEMBERSHIP_TIER_OPTIONS.map((tier) => <SelectItem key={tier.value} value={tier.value}>{tier.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="membership-weight-band">Approved weight band <span className="text-red-500">*</span></Label>
                  <Select
                    value={manualWeightClass}
                    disabled={!manualTier}
                    onValueChange={(weightClass) => {
                      const typedWeightClass = weightClass as MembershipWeightClass;
                      const matchingPackages = (packageOptions?.packages ?? []).filter((membershipPackage) =>
                        membershipPackage.tier === manualTier && membershipPackage.weightClass === typedWeightClass,
                      );
                      setManualWeightClass(typedWeightClass);
                      setForm(f => ({ ...f, packageId: matchingPackages.length === 1 ? matchingPackages[0].id : "" }));
                    }}
                  >
                    <SelectTrigger id="membership-weight-band"><SelectValue placeholder={manualTier ? "Choose an approved band" : "Choose a tier first"} /></SelectTrigger>
                    <SelectContent>
                      {(packageOptions?.weightBands ?? []).map((weightBand) => <SelectItem key={weightBand.id} value={weightBand.id}>{weightBand.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {manualWeightClass && manualPackageOptions.length > 1 && (
                  <div className="space-y-1">
                    <Label htmlFor="membership-package-variant">Service package <span className="text-red-500">*</span></Label>
                    <Select value={form.packageId} onValueChange={packageId => setForm(f => ({ ...f, packageId }))}>
                      <SelectTrigger id="membership-package-variant"><SelectValue placeholder="Choose Classic or Styled" /></SelectTrigger>
                      <SelectContent>
                        {manualPackageOptions.map((membershipPackage) => (
                          <SelectItem key={membershipPackage.id} value={membershipPackage.id}>{membershipPackage.serviceType === "styled" ? "Styled" : "Classic"} · ${membershipPackage.weeklyPrice}/week</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {manualWeightClass && manualPackageOptions.length === 1 && (
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">The verified {manualPackageOptions[0].serviceType} package has been selected for this tier and weight band.</p>
                )}
              </div>
            ) : packageOptions?.packages.length ? (
              <Select value={form.packageId} onValueChange={packageId => setForm(f => ({ ...f, packageId }))}>
                <SelectTrigger><SelectValue placeholder="Choose a verified VIP package" /></SelectTrigger>
                <SelectContent>
                  {packageOptions.packages.map((membershipPackage) => (
                    <SelectItem key={membershipPackage.id} value={membershipPackage.id}>{membershipPackage.name} · ${membershipPackage.weeklyPrice}/week</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No verified VIP packages are available for this dog.</p>
            )}
          </div>

          {selectedPackage && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Weekly price</p>
                <p className="mt-1 text-lg font-bold">${selectedPackage.weeklyPrice.toFixed(2)} / week</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Appointment schedule</p>
                <p className="mt-1 text-sm font-semibold">Every {selectedPackage.appointmentIntervalWeeks} weeks</p>
                <p className="text-xs text-emerald-800">{selectedPackage.visitsPerYear}</p>
              </div>
              <p className="col-span-2 text-xs text-emerald-800">Billed weekly. Package name, weekly price and appointment frequency come from the approved VIP schedule.</p>
            </div>
          )}

          {isAdmin ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Weekly collection method</Label>
                <Select value={form.paymentGateway} onValueChange={v => setForm(f => ({ ...f, paymentGateway: v as typeof form.paymentGateway }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Next billing date</Label>
                <Input type="date" value={form.nextBillingDate} onChange={e => setForm(f => ({ ...f, nextBillingDate: e.target.value }))} />
              </div>
            </div>
          ) : (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">An administrator configures payment collection and the next billing date separately. This action does not collect or charge a payment.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Membership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────
function MembershipRow({ m }: { m: MembershipItem }) {
  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/20"
    >
      <td className="p-3">
        <MembershipClientPreview m={m}>
          <Link href={m.clientId ? `/clients/${m.clientId}` : "#"}>
            <span className={`flex items-center gap-2 ${m.clientId ? "cursor-pointer group" : ""}`} aria-label={`Open ${m.clientFirstName ?? "client"} ${m.clientLastName ?? ""} profile`}>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Dog className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className={`font-medium transition-colors ${m.clientId ? "group-hover:text-primary group-hover:underline" : ""}`}>{m.clientFirstName} {m.clientLastName}</p>
                <p className="text-xs text-muted-foreground">{m.petName} {m.petBreed ? `(${m.petBreed})` : ""}</p>
              </div>
            </span>
          </Link>
        </MembershipClientPreview>
      </td>
      <td className="p-3 hidden md:table-cell">
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{m.name}</span>
        </div>
      </td>
      <td className="p-3 hidden lg:table-cell">
        {m.tier && (
          <Badge className={`text-xs capitalize ${TIER_COLOURS[m.tier] ?? "bg-slate-100 text-slate-600"}`}>
            {m.tier}
          </Badge>
        )}
      </td>
      <td className="p-3 font-medium">
        ${m.pricePerCycle}<span className="text-xs text-muted-foreground font-normal">/wk</span>
      </td>
      <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
        {m.nextBillingDate ? new Date(m.nextBillingDate).toLocaleDateString("en-AU") : "—"}
      </td>
      <td className="p-3">
        <div className="space-y-1">
          <Badge className={`text-xs ${STATUS_COLOURS[m.status] ?? ""}`}>
            {m.status.replace("_", " ")}
          </Badge>
          {m.bookingSuspended && (
            <Badge className="text-xs bg-red-100 text-red-800 block">Suspended</Badge>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Memberships() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("active");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("client");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: currentUser } = trpc.auth.me.useQuery();
  const isAdmin = currentUser?.role === "admin";

  const tierParam = tierFilter === "all" ? undefined : tierFilter as "diamond" | "platinum" | "gold" | "silver" | "bronze";
  const statusParam = STATUS_TABS.some(tab => tab.key === activeTab)
    ? activeTab as "active" | "paused" | "cancelled" | "pending_payment" | "expired"
    : undefined;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.memberships.list.useQuery({
    tenantId: 1,
    status: statusParam,
    tier: tierParam,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortKey,
    sortDir,
  }, { enabled: isAdmin });

  const { data: failedPayments } = trpc.memberships.getFailedPayments.useQuery({ tenantId: 1 }, { enabled: isAdmin });
  const { data: debtSummary, refetch: refetchDebt } = trpc.memberships.getDebtSummary.useQuery({ tenantId: 1 }, { enabled: isAdmin });
  const generateInvoiceMutation = trpc.memberships.generateDebtInvoice.useMutation({
    onSuccess: (res) => {
      toast.success(`Draft invoice ${res.invoiceNumber} created`);
      refetchDebt();
    },
    onError: (e) => toast.error(e.message),
  });
  const markPaidMutation = trpc.memberships.markDebtPaid.useMutation({
    onSuccess: (res) => {
      toast.success(`Cleared ${res.clearedGrooms} groom${res.clearedGrooms !== 1 ? "s" : ""} — $${res.totalAmount} marked as paid`);
      setConfirmMarkPaid(null);
      refetchDebt();
    },
    onError: (e) => toast.error(e.message),
  });
  const [confirmMarkPaid, setConfirmMarkPaid] = useState<{ id: number; debtGrooms: number; pricePerCycle: string | null; clientName: string; petName: string | null } | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState<"cash" | "eftpos" | "bank_transfer" | "square">("cash");
  // ── Failed payment mutations & state ──────────────────────────────────────
  const recordFailureMutation = trpc.memberships.recordPaymentFailure.useMutation({
    onSuccess: (res) => {
      toast.success((res as { suspended?: boolean }).suspended
        ? `Strike 2 — bookings suspended. Client notified by email.`
        : `Strike 1 recorded. Retry scheduled for next business day.`);
      setConfirmRecordFailure(null);
      setFailureReason("");
      utils.memberships.getFailedPayments.invalidate();
      utils.memberships.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const resolveFailureMutation = trpc.memberships.resolvePaymentFailure.useMutation({
    onSuccess: () => {
      toast.success("Payment failure cleared — membership restored to active.");
      setConfirmResolve(null);
      utils.memberships.getFailedPayments.invalidate();
      utils.memberships.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [confirmRecordFailure, setConfirmRecordFailure] = useState<{ id: number; clientName: string; petName: string | null; membershipName: string | null; failedCount: number } | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [confirmResolve, setConfirmResolve] = useState<{ id: number; clientName: string; petName: string | null } | null>(null);
  const [debtSearch, setDebtSearch] = useState("");
  const [debtSortKey, setDebtSortKey] = useState<"client" | "owed" | "value">("owed");
  const [debtSortDir, setDebtSortDir] = useState<"asc" | "desc">("desc");

  const toggleDebtSort = (key: "client" | "owed" | "value") => {
    if (debtSortKey === key) setDebtSortDir(d => d === "asc" ? "desc" : "asc");
    else { setDebtSortKey(key); setDebtSortDir("desc"); }
  };

  const allDebtItems = (debtSummary ?? []).filter(d => d.debtGrooms > 0);
  const debtItems = allDebtItems
    .filter(d => {
      if (!debtSearch) return true;
      const q = debtSearch.toLowerCase();
      return (
        `${d.clientFirstName} ${d.clientLastName}`.toLowerCase().includes(q) ||
        (d.petName ?? "").toLowerCase().includes(q) ||
        (d.name ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (debtSortKey === "client") cmp = `${a.clientFirstName} ${a.clientLastName}`.localeCompare(`${b.clientFirstName} ${b.clientLastName}`);
      else if (debtSortKey === "owed") cmp = a.debtGrooms - b.debtGrooms;
      else if (debtSortKey === "value") cmp = a.debtAmount - b.debtAmount;
      return debtSortDir === "asc" ? cmp : -cmp;
    });
  const totalDebtGrooms = allDebtItems.reduce((s, d) => s + d.debtGrooms, 0);
  const totalDebtAmount = allDebtItems.reduce((s, d) => s + d.debtAmount, 0);

  const items: MembershipItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleTabChange = (val: string) => { setActiveTab(val); setPage(1); };
  const handleTierChange = (val: string) => { setTierFilter(val); setPage(1); };
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  if (currentUser?.role === "staff") {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl space-y-5">
          <div>
            <h1 className="text-2xl font-bold font-display">Membership setup</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create a verified VIP membership for a client and dog. Payment collection, billing dates, invoices, payment failures and debt management remain administrator-only.</p>
          </div>
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle className="text-base">Verified VIP package setup</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">Packages, weekly prices and appointment frequency are calculated from the approved Barkin Beautiful VIP catalogue. If a weight is not recorded, choose a tier first and then an approved weight band.</p>
              <Button onClick={() => setShowAddModal(true)} className="flex items-center gap-2"><Plus className="h-4 w-4" />Add New Membership</Button>
            </CardContent>
          </Card>
          <AddMembershipModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={() => undefined} />
        </div>
      </DashboardLayout>
    );
  }

  const thClass = "text-left p-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground hover:bg-muted/30 transition-colors";

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Memberships</h1>
            <p className="text-sm text-muted-foreground">
              {total} {activeTab.replace("_", " ")} memberships
              {tierFilter !== "all" ? ` · ${tierFilter} tier` : ""}
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Membership
          </Button>
        </div>

        {failedPayments && failedPayments.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">
                    {failedPayments.length} Failed Payment{failedPayments.length > 1 ? "s" : ""} Require Attention
                  </p>
                  <div className="mt-2 space-y-1">
                    {failedPayments.map(fp => (
                      <div key={fp.membershipId} className="flex items-center justify-between text-xs text-amber-700">
                        <span>{fp.clientFirstName} {fp.clientLastName} — {fp.petName} ({fp.membershipName})</span>
                        <div className="flex items-center gap-2">
                          {fp.clientPhone && (
                            <a href={`tel:${fp.clientPhone}`} className="flex items-center gap-0.5 hover:underline">
                              <Phone className="h-3 w-3" />{fp.clientPhone}
                            </a>
                          )}
                          <Badge className="bg-amber-200 text-amber-900 text-[10px]">{fp.failedCount}x failed</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by client or pet name..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <Select value={tierFilter} onValueChange={handleTierChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Tiers" />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            {STATUS_TABS.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
            ))}
            <TabsTrigger value="debt" className="gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Debt Tracking
              {debtItems.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">{debtItems.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="failed_payments" className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Failed Payments
              {(failedPayments?.length ?? 0) > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">{failedPayments!.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="accounts_receivable" className="gap-1.5"><Landmark className="h-3.5 w-3.5" />Accounts Receivable</TabsTrigger>
          </TabsList>

          {STATUS_TABS.map(tab => (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground">Loading...</div>
              ) : (
                <div className="bg-card rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className={thClass} onClick={() => toggleSort("client")}>
                          <span className="flex items-center">Client / Pet <SortIcon col="client" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className={`${thClass} hidden md:table-cell`} onClick={() => toggleSort("membership")}>
                          <span className="flex items-center">Membership <SortIcon col="membership" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className={`${thClass} hidden lg:table-cell`} onClick={() => toggleSort("tier")}>
                          <span className="flex items-center">Tier <SortIcon col="tier" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className={thClass} onClick={() => toggleSort("price")}>
                          <span className="flex items-center">Price <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className={`${thClass} hidden md:table-cell`} onClick={() => toggleSort("nextBilling")}>
                          <span className="flex items-center">Next Billing <SortIcon col="nextBilling" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className={thClass} onClick={() => toggleSort("status")}>
                          <span className="flex items-center">Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No memberships in this category.</td></tr>
                      )}
                      {items.map((m) => <MembershipRow key={m.id} m={m} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          ))}
          <TabsContent value="debt" className="mt-4">
            {debtItems.length === 0 ? (
              <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground">
                <TrendingDown className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No outstanding groom debt</p>
                <p className="text-sm mt-1">All paid billing cycles have been matched to completed grooms.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4">
                      <p className="text-xs text-red-600 font-semibold uppercase tracking-wide">Grooms Owed</p>
                      <p className="text-3xl font-bold text-red-700 mt-1">{totalDebtGrooms}</p>
                      <p className="text-xs text-red-500 mt-0.5">across {debtItems.length} membership{debtItems.length !== 1 ? "s" : ""}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                      <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Estimated Value</p>
                      <p className="text-3xl font-bold text-orange-700 mt-1">${totalDebtAmount.toFixed(2)}</p>
                      <p className="text-xs text-orange-500 mt-0.5">at current membership rates</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-9 h-8 text-sm"
                      placeholder="Search by client, pet, or membership name..."
                      value={debtSearch}
                      onChange={e => setDebtSearch(e.target.value)}
                    />
                  </div>
                  {debtSearch && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Showing {debtItems.length} of {allDebtItems.length} result{allDebtItems.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <div className="bg-card rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground">
                          <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleDebtSort("client")}>
                            Client / Pet
                            {debtSortKey === "client" ? (debtSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                          </button>
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Membership</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Paid Cycles</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Grooms Done</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">
                          <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleDebtSort("owed")}>
                            Owed
                            {debtSortKey === "owed" ? (debtSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                          </button>
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground">
                          <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleDebtSort("value")}>
                            Value
                            {debtSortKey === "value" ? (debtSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                          </button>
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtItems.length === 0 && (
                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">No results match your search.</td></tr>
                      )}
                      {debtItems.map(d => (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                <Dog className="h-3.5 w-3.5 text-red-600" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{d.clientFirstName} {d.clientLastName}</p>
                                <p className="text-xs text-muted-foreground">{d.petName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <p className="text-sm">{d.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{d.tier} · {d.serviceType}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-semibold">{d.paidCycles}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-semibold text-emerald-700">{d.groomsDelivered}</span>
                          </td>
                          <td className="p-3 text-center">
                            <Badge className="bg-red-100 text-red-800 font-bold">{d.debtGrooms} groom{d.debtGrooms !== 1 ? "s" : ""}</Badge>
                          </td>
                          <td className="p-3 font-semibold text-red-700">
                            ${d.debtAmount.toFixed(2)}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs h-7"
                                disabled={generateInvoiceMutation.isPending}
                                onClick={() => generateInvoiceMutation.mutate({
                                  membershipId: d.id,
                                  debtGrooms: d.debtGrooms,
                                  pricePerGroom: d.pricePerCycle ?? "0",
                                })}
                              >
                                <FileText className="h-3 w-3" /> Invoice
                              </Button>
                              <Button
                                size="sm"
                                className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={markPaidMutation.isPending}
                                onClick={() => setConfirmMarkPaid({
                                  id: d.id,
                                  debtGrooms: d.debtGrooms,
                                  pricePerCycle: d.pricePerCycle,
                                  clientName: `${d.clientFirstName ?? ""} ${d.clientLastName ?? ""}`.trim(),
                                  petName: d.petName,
                                })}
                              >
                                <CheckCircle className="h-3 w-3" /> Mark Paid
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="accounts_receivable" className="mt-4">
            <MembershipAccountsReceivable />
          </TabsContent>

          {/* ── Failed Payments Tab ── */}
          <TabsContent value="failed_payments" className="mt-4">
            {(failedPayments?.length ?? 0) === 0 ? (
              <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-3 opacity-30 text-emerald-500" />
                <p className="font-medium">No failed payments</p>
                <p className="text-sm mt-1">All membership payments are up to date.</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-muted-foreground">Client / Pet</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Membership</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Strikes</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Last Failed</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedPayments!.map(fp => (
                      <tr key={fp.membershipId} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                              <Dog className="h-3.5 w-3.5 text-amber-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{fp.clientFirstName} {fp.clientLastName}</p>
                              <p className="text-xs text-muted-foreground">{fp.petName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <p className="text-sm">{fp.membershipName}</p>
                        </td>
                        <td className="p-3">
                          <Badge className={`text-xs font-bold ${
                            fp.failedCount >= 2 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {fp.failedCount}x
                          </Badge>
                        </td>
                        <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
                          {fp.lastFailedAt ? new Date(fp.lastFailedAt).toLocaleDateString("en-AU") : "—"}
                        </td>
                        <td className="p-3">
                          {fp.suspended ? (
                            <Badge className="text-xs bg-red-100 text-red-800">Suspended</Badge>
                          ) : (
                            <Badge className="text-xs bg-amber-100 text-amber-800">Pending Retry</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs h-7 border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => setConfirmRecordFailure({
                                id: fp.membershipId,
                                clientName: `${fp.clientFirstName ?? ""} ${fp.clientLastName ?? ""}`.trim(),
                                petName: fp.petName,
                                membershipName: fp.membershipName,
                                failedCount: fp.failedCount,
                              })}
                            >
                              <XCircle className="h-3 w-3" /> Record Failure
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={resolveFailureMutation.isPending}
                              onClick={() => setConfirmResolve({
                                id: fp.membershipId,
                                clientName: `${fp.clientFirstName ?? ""} ${fp.clientLastName ?? ""}`.trim(),
                                petName: fp.petName,
                              })}
                            >
                              <RefreshCw className="h-3 w-3" /> Resolve
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
          <span>Showing {total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <AddMembershipModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => utils.memberships.list.invalidate()}
      />

      {/* ── Record Payment Failure Dialog ── */}
      <Dialog open={!!confirmRecordFailure} onOpenChange={open => { if (!open) { setConfirmRecordFailure(null); setFailureReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-4 w-4" />
              Record Payment Failure
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {confirmRecordFailure && (
              <>
                <p className="text-sm text-muted-foreground">
                  Recording a failure for <strong className="text-foreground">{confirmRecordFailure.clientName}</strong>
                  {confirmRecordFailure.petName ? ` (${confirmRecordFailure.petName})` : ""}.
                  {confirmRecordFailure.failedCount >= 1 ? (
                    <span className="block mt-1 text-red-600 font-medium">⚠ This is Strike 2 — bookings will be suspended and the client will be notified by email.</span>
                  ) : (
                    <span className="block mt-1">This is Strike 1 — a retry will be scheduled for the next business day.</span>
                  )}
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Reason (optional)</Label>
                  <Textarea
                    className="text-sm h-20 resize-none"
                    placeholder="e.g. Card declined — insufficient funds"
                    value={failureReason}
                    onChange={e => setFailureReason(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setConfirmRecordFailure(null); setFailureReason(""); }}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={recordFailureMutation.isPending}
              onClick={() => {
                if (!confirmRecordFailure) return;
                recordFailureMutation.mutate({
                  membershipId: confirmRecordFailure.id,
                  failureReason: failureReason || undefined,
                });
              }}
            >
              {recordFailureMutation.isPending ? "Recording..." : "Confirm Failure"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Payment Failure Dialog ── */}
      <Dialog open={!!confirmResolve} onOpenChange={open => { if (!open) setConfirmResolve(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <RefreshCw className="h-4 w-4" />
              Resolve Payment Failure
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will clear all payment failures for <strong className="text-foreground">{confirmResolve?.clientName}</strong>
              {confirmResolve?.petName ? ` (${confirmResolve.petName})` : ""} and restore their membership to <strong className="text-foreground">active</strong>.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmResolve(null)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={resolveFailureMutation.isPending}
              onClick={() => {
                if (!confirmResolve) return;
                resolveFailureMutation.mutate({ membershipId: confirmResolve.id });
              }}
            >
              {resolveFailureMutation.isPending ? "Resolving..." : "Confirm Resolve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mark as Paid Confirmation Dialog ── */}
      <Dialog open={!!confirmMarkPaid} onOpenChange={open => { if (!open) setConfirmMarkPaid(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Mark Debt as Paid
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will record <strong className="text-foreground">{confirmMarkPaid?.debtGrooms} groom{(confirmMarkPaid?.debtGrooms ?? 0) !== 1 ? "s" : ""}</strong> as paid for{" "}
              <strong className="text-foreground">{confirmMarkPaid?.clientName}</strong>{confirmMarkPaid?.petName ? ` (${confirmMarkPaid.petName})` : ""}, clearing their outstanding balance of{" "}
              <strong className="text-foreground">${((confirmMarkPaid?.debtGrooms ?? 0) * parseFloat(confirmMarkPaid?.pricePerCycle ?? "0")).toFixed(2)}</strong>.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <select
                className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                value={markPaidMethod}
                onChange={e => setMarkPaidMethod(e.target.value as typeof markPaidMethod)}
              >
                <option value="cash">Cash</option>
                <option value="eftpos">EFTPOS</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="square">Square</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmMarkPaid(null)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={markPaidMutation.isPending}
              onClick={() => {
                if (!confirmMarkPaid) return;
                markPaidMutation.mutate({
                  membershipId: confirmMarkPaid.id,
                  debtGrooms: confirmMarkPaid.debtGrooms,
                  pricePerGroom: confirmMarkPaid.pricePerCycle ?? "0",
                  paymentMethod: markPaidMethod,
                });
              }}
            >
              {markPaidMutation.isPending ? "Saving..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
