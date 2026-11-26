import DashboardLayout from "@/components/DashboardLayout";
import { CancelMembershipFutureBookings } from "@/components/CancelMembershipFutureBookings";
import { resolveKeptPrices, type FutureBookingChoice } from "@shared/membershipCancelBookings";
import type { SizePriceDecision } from "@shared/sizeChangePricing";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { billingCycleFromWeeks, retryWarning } from "@shared/stripeBilling";
import { membershipTabCount } from "@shared/membershipTabCount";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CreditCard, PauseCircle, PlayCircle, Search, Dog, Phone, ArrowUpDown, ArrowUp, ArrowDown, Plus, CheckCircle, CheckCircle2, XCircle, RefreshCw, Landmark } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MembershipAccountsReceivable } from "@/components/MembershipAccountsReceivable";
import { MembershipSignupRequests } from "@/components/MembershipSignupRequests";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageNumbers } from "@/components/PageNumbers";
import { readSavedListView, type SavedListView } from "@shared/listPaging";
import { Link } from "wouter";
import { toast } from "sonner";
import { getActiveTimeZone } from "@/lib/timezone";
import { describeDeclineHistory } from "@shared/declineHistory";
import { weeklyToMonthly, describeRate, annualisedCost } from "@shared/membershipBillingCycle";

import { describePause, nextBillingLine, resolvePauseResumesAt } from "@shared/membershipPause";
import { membershipListFilter } from "@shared/membershipBillingSource";
import { MembershipPetAssignment } from "@/components/MembershipPetAssignment";
import { FLOATING_BUTTON_CLEARANCE } from "@/lib/floatingButtonClearance";
type MembershipItem = {
  id: number;
  clientId: number | null;
  name: string | null;
  tier: string | null;
  serviceType: string | null;
  status: string;
  /** Set only by a deliberate pause, never by a failed-payment suspension. */
  pauseMode?: "cycles" | "date" | "manual" | null;
  pauseResumesAt?: string | Date | null;
  pricePerCycle: string | null;
  /** Always the WEEKLY rate, whichever cycle bills it. */
  billingCycle?: "weekly" | "monthly" | null;
  billingCycleWeeks: number | null;
  nextBillingDate: number | Date | null;
  failedPaymentCount: number | null;
  bookingSuspended: boolean | null;
  stripeSubscriptionId: string | null;
  /** Other open memberships paid by the same Stripe payment (shared/familyBilling.ts). */
  sharedPaymentWith?: number;
  isTest: boolean | null;
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
  active: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300",
  paused: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300",
  pending_payment: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300",
  expired: "bg-muted text-muted-foreground",
};

const TIER_COLOURS: Record<string, string> = {
  diamond: "bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-300",
  platinum: "bg-accent text-foreground",
  gold: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300",
  silver: "bg-muted text-muted-foreground",
  bronze: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300",
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

// Active is billed in Groomigo; To be migrated is active but still billed
// in MoeGo (shared/membershipBillingSource.ts, Andy 25/11/2026).
const STATUS_TABS = [
  { key: "active", label: "Active" },
  { key: "to_migrate", label: "To be migrated" },
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
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50"><Dog className="h-3 w-3 text-amber-600 dark:text-amber-400" /></div>
                      <span className="font-medium">{pet.name}</span>
                      {pet.breed && <span className="text-muted-foreground">· {pet.breed}</span>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">No pets on file</p>}
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
              <span>{m.petName}{m.petBreed ? ` · ${m.petBreed}` : ""}</span>
              {m.failedPaymentCount && m.failedPaymentCount > 0 && <span className="font-semibold text-red-600 dark:text-red-400">{m.failedPaymentCount} failed payment{m.failedPaymentCount === 1 ? "" : "s"}</span>}
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
    { search: clientSearch },
    { enabled: clientSearch.length >= 2 }
  );
  const { data: packageOptions, isLoading: isLoadingPackages } = trpc.memberships.getPackageOptions.useQuery(
    { clientId: selectedClient?.clientId ?? 0, petId: selectedClient?.petId ?? 0 },
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
                <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  <p className="font-medium">A verified recorded weight is not available for this dog.</p>
                  <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">Choose the membership tier first, then an approved weight band. This fallback only sets the membership package and does not change the dog’s recorded weight.</p>
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
              <p className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">No verified VIP packages are available for this dog.</p>
            )}
          </div>

          {selectedPackage && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-emerald-950 dark:text-emerald-100">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Weekly price</p>
                <p className="mt-1 text-lg font-bold">${selectedPackage.weeklyPrice.toFixed(2)} / week</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Appointment schedule</p>
                <p className="mt-1 text-sm font-semibold">Every {selectedPackage.appointmentIntervalWeeks} weeks</p>
              </div>
              <p className="sm:col-span-2 text-xs text-emerald-800 dark:text-emerald-300">Billed weekly. Package name, weekly price and appointment frequency come from the approved VIP schedule.</p>
            </div>
          )}

          {isAdmin ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <DateField value={form.nextBillingDate} onChange={next => setForm(f => ({ ...f, nextBillingDate: next }))} />
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
                {/* What the hidden columns would have said. A phone could
                    see the client, the price and the status but not WHICH
                    plan or when it next bills — the two things you check a
                    membership for. Folded in here rather than given their
                    own card: one table, one extra line. */}
                <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                  {m.name}
                  {m.tier ? ` · ${m.tier}` : ""}
                  {m.nextBillingDate
                    ? ` · next ${new Date(m.nextBillingDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: getActiveTimeZone() })}`
                    : ""}
                  {m.isTest ? " · TEST" : ""}
                </p>
              </div>
            </span>
          </Link>
        </MembershipClientPreview>
      </td>
      <td className="p-3 hidden md:table-cell">
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          {/* Opens this membership on the client's card, where it can be
              paused, billed or stopped (Andy, 25/11/2026). */}
          {m.clientId ? (
            <Link href={`/clients/${m.clientId}?membership=${m.id}`} className="text-sm hover:text-primary hover:underline">
              {m.name}
            </Link>
          ) : (
            <span className="text-sm">{m.name}</span>
          )}
          {m.isTest && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-300">TEST</Badge>}
        </div>
      </td>
      <td className="p-3 hidden lg:table-cell">
        {m.tier && (
          <Badge className={`text-xs capitalize ${TIER_COLOURS[m.tier] ?? "bg-muted text-muted-foreground"}`}>
            {m.tier}
          </Badge>
        )}
      </td>
      <td className="p-3 font-medium">
        {/* A monthly member is charged weekly x 52/12, but the weekly rate
            is what is stored, so both are shown: the figure that leaves
            their account, and the rate it comes from. Showing only one
            makes a $450.67 charge look unrelated to a $104 membership. */}
        {m.billingCycle === "monthly" ? (
          <>
            ${weeklyToMonthly(m.pricePerCycle) ?? "—"}
            <span className="text-xs text-muted-foreground font-normal">/mo</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              ${m.pricePerCycle}/wk equivalent
            </span>
          </>
        ) : (
          <>${m.pricePerCycle}<span className="text-xs text-muted-foreground font-normal">/wk</span></>
        )}
      </td>
      <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
        {/* While paused, the restart date, not the old next billing date
            (shared/membershipPause.ts, nextBillingLine; Andy, 25/11/2026). */}
        {(() => {
          const line = nextBillingLine({
            status: m.status,
            pauseMode: m.pauseMode ?? null,
            pauseResumesAt: m.pauseResumesAt ? new Date(m.pauseResumesAt) : null,
            failedPaymentCount: m.failedPaymentCount,
            bookingSuspended: m.bookingSuspended,
            nextBillingDate: m.nextBillingDate ? new Date(m.nextBillingDate) : null,
          });
          if (!line) return "—";
          if (!("date" in line)) return line.text;
          const day = line.date.toLocaleDateString("en-AU", { timeZone: getActiveTimeZone() });
          return line.label === "Restarts" ? `Restarts ${day}` : day;
        })()}
      </td>
      <td className="p-3">
        <div className="space-y-1">
          <Badge className={`text-xs ${STATUS_COLOURS[m.status] ?? ""}`}>
            {m.status.replace("_", " ")}
          </Badge>
          {m.bookingSuspended && (
            <Badge className="text-xs bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 block">Suspended</Badge>
          )}
          <MembershipActions m={m} />
        </div>
      </td>
    </tr>
  );
}


/**
 * Weekly or monthly, for one client.
 *
 * Andy, 23/10/2026: "Set default to weekly billing, but give the clients
 * an option to move to monthly billing as it has been asked if that is an
 * option. Won't be everyone, but it needs to be workable for their
 * cashflow." Hence a per-membership control and no bulk switch.
 *
 * It states the new charge and the annual total before asking, because
 * the one thing a client will query is why $104 a week became $450.67 a
 * month. Those are the same money — 52 weeks against 12 months — and the
 * figure is derived rather than typed so it cannot be got wrong here.
 */
function MembershipCycleControl({ m }: { m: MembershipItem }) {
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const cycle = m.billingCycle === "monthly" ? "monthly" : "weekly";
  const next = cycle === "monthly" ? "weekly" : "monthly";
  const nextRate = next === "monthly" ? weeklyToMonthly(m.pricePerCycle) : m.pricePerCycle;

  const setCycle = trpc.memberships.setBillingCycle.useMutation({
    onSuccess: (result) => {
      setConfirming(false);
      toast.success(result.changed ? `Now billing ${result.chargedLabel}` : "Already on that cycle");
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
    },
    onError: (error) => { setConfirming(false); toast.error(error.message); },
  });

  // Closed memberships bill nothing, so there is no cycle to choose.
  if (m.status === "cancelled" || m.status === "expired") return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="block text-[11px] font-medium text-violet-700 dark:text-violet-300 hover:underline"
      >
        Switch to {next} billing
      </button>
    );
  }

  return (
    <div className="rounded-md border border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-400/5 p-2 text-[11px]">
      <p className="font-semibold text-slate-900 dark:text-white">
        Bill {describeRate(nextRate, next)}?
      </p>
      <p className="mt-0.5 text-slate-600 dark:text-slate-300">
        {nextRate
          ? `Same money over a year — $${annualisedCost(nextRate, next)} either way.`
          : "This membership has no price set."}
      </p>
      {m.stripeSubscriptionId && (
        <p className="mt-1 font-medium text-amber-700 dark:text-amber-300">
          Stop billing first — Stripe cannot move a live subscription between cycles.
        </p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          disabled={setCycle.isPending || !nextRate}
          onClick={() => setCycle.mutate({ membershipId: m.id, billingCycle: next })}
          className="rounded bg-violet-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
        >
          {setCycle.isPending ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded border px-2 py-1 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Ending the membership itself, as opposed to its billing.
 *
 * Until now the only route to status "cancelled" was manageDepartedPet,
 * which refuses to run unless the pet has been recorded as passed away — so
 * a client who simply left the salon kept an active membership for ever, and
 * never appeared under Cancelled.
 */
/**
 * Every action on a membership: billing (start, retry, pause, resume),
 * the cycle switch, and cancel. One block, so the Memberships list and the
 * client card offer exactly the same things (Andy, 25/11/2026: "Need to
 * have the same functions in the client card > membership section as in
 * the memberships").
 *
 * A Stripe-billed membership shows Cancel membership as a button beside
 * Pause, inside the billing control; everything else keeps the small link
 * underneath.
 */
export function MembershipActions({ m }: { m: MembershipItem }) {
  return (
    <>
      <MembershipBillingControl m={m} />
      <MembershipCycleControl m={m} />
      {!m.stripeSubscriptionId && <MembershipCancelControl m={m} />}
    </>
  );
}

export type { MembershipItem };

function MembershipCancelControl({ m, variant = "link" }: { m: MembershipItem; variant?: "link" | "button" }) {
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const [futureChoice, setFutureChoice] = useState<FutureBookingChoice | null>(null);
  // What each kept booking should cost: staff pick, the system never does.
  const [keptDecisions, setKeptDecisions] = useState<Record<number, SizePriceDecision | undefined>>({});
  const [keptErrors, setKeptErrors] = useState<Record<number, string>>({});
  const clientName = [m.clientFirstName, m.clientLastName].filter(Boolean).join(" ").trim() || "this client";

  // What the dog still has booked on this membership. Asked for only once
  // the dialog is open, and never kept: bookings change all day.
  const preview = trpc.memberships.cancelPreview.useQuery(
    { membershipId: m.id },
    { enabled: confirming, staleTime: 0, gcTime: 0, retry: false },
  );
  const futureBookings = preview.data?.bookings ?? [];
  // Until the list has arrived nobody can have answered for it, and once
  // it has, bookings on it need an answer (Andy, 18/11/2026).
  // isFetching as well as isLoading: reopening the dialog shows the last
  // list while a fresh one loads, and nobody should answer for a stale one.
  const waitingOnBookings = confirming && (preview.isLoading || preview.isFetching || preview.isError || (futureBookings.length > 0 && futureChoice === null));

  const cancelMembership = trpc.memberships.cancelMembership.useMutation({
    onSuccess: (result) => {
      toast.success(["Membership cancelled.", result.summary].filter(Boolean).join(" "));
      utils.calendar.invalidate();
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
      utils.memberships.getFailedPayments.invalidate();
      setConfirming(false);
    },
    onError: (error) => {
      toast.error(error.message);
      // The row may have changed underneath (billing is stopped before
      // anything else), so show what is true now.
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
      setConfirming(false);
    },
  });

  if (m.status === "cancelled" || m.status === "expired") return null;

  return (
    <>
      {variant === "button" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 flex-1 gap-1.5 whitespace-nowrap border-red-200 px-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          disabled={cancelMembership.isPending}
          onClick={() => { setFutureChoice(null); setKeptDecisions({}); setKeptErrors({}); setConfirming(true); }}
        >
          <XCircle className="h-3 w-3 shrink-0" />
          {cancelMembership.isPending ? "Cancelling…" : "Cancel membership"}
        </Button>
      ) : (
        <button
          type="button"
          className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50 dark:hover:text-red-400"
          disabled={cancelMembership.isPending}
          onClick={() => { setFutureChoice(null); setKeptDecisions({}); setKeptErrors({}); setConfirming(true); }}
        >
          {cancelMembership.isPending ? "Cancelling…" : "Cancel membership"}
        </button>
      )}
      <Dialog open={confirming} onOpenChange={(open) => !open && !cancelMembership.isPending && setConfirming(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Cancel this membership?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This ends {clientName}&rsquo;s membership for good and moves it to Cancelled. Any automatic billing is
            stopped at the same time, and they will not be able to book on the membership. Use <strong>Pause</strong>{" "}
            instead if they are only away for a while.
          </p>
          {preview.isLoading && <p className="text-xs text-muted-foreground">Checking for future bookings on this membership…</p>}
          {preview.isError && (
            <p role="alert" className="text-xs text-destructive">
              Could not check for future bookings, so this cannot be cancelled yet. Close this and try again.
            </p>
          )}
          <CancelMembershipFutureBookings
            bookings={futureBookings}
            choice={futureChoice}
            onChoice={setFutureChoice}
            decisions={keptDecisions}
            onDecision={(bookingId, decision) => {
              setKeptDecisions((previous) => ({ ...previous, [bookingId]: decision }));
              setKeptErrors((previous) => {
                const { [bookingId]: _answered, ...rest } = previous;
                return rest;
              });
            }}
            errors={keptErrors}
            disabled={cancelMembership.isPending}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={cancelMembership.isPending} onClick={() => setConfirming(false)}>
              Keep membership
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelMembership.isPending || waitingOnBookings}
              onClick={() => {
                const previewedBookingIds = futureBookings.map((booking: { id: number }) => booking.id);
                if (futureBookings.length === 0 || !futureChoice) {
                  cancelMembership.mutate({ membershipId: m.id });
                  return;
                }
                if (futureChoice === "remove") {
                  cancelMembership.mutate({ membershipId: m.id, futureBookings: "remove", previewedBookingIds });
                  return;
                }
                // Keeping them: every booking the membership had made free
                // needs a price answered before anything is cancelled.
                const kept = resolveKeptPrices(futureBookings, keptDecisions);
                if (!kept.ok) {
                  setKeptErrors(kept.errors);
                  return;
                }
                cancelMembership.mutate({ membershipId: m.id, futureBookings: "keep", previewedBookingIds, keptPrices: kept.prices });
              }}
            >
              {cancelMembership.isPending ? "Cancelling…" : "Cancel membership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Whether this membership bills itself weekly through Stripe, and the one
 * action that changes that.
 *
 * Deliberately small and in the row: the owner sets up a handful of pilot
 * clients and needs to see at a glance which of 154 memberships are actually
 * on automatic billing. "Bill weekly" fails with a clear message when the
 * client has no card on file, which is the usual reason it cannot start.
 */
function MembershipBillingControl({ m }: { m: MembershipItem }) {
  const utils = trpc.useUtils();
  // Both actions below move real money off a real card, so each one is
  // confirmed first. These are 10px links in a 154-row table; a misclick
  // used to charge a client up to $104 with no way to undo it.
  const [confirming, setConfirming] = useState<"start" | "charge" | "pause" | "resume" | "cancel" | null>(null);
  // Blank means charge now. Set when the client has to be told how the new
  // billing works before any money leaves their account.
  const [firstChargeOn, setFirstChargeOn] = useState("");
  /**
   * How the pause ends, chosen before it starts.
   *
   * Defaulted to one cycle rather than "manual": the common case is a
   * client away for a known stretch, and a pause nobody has to remember
   * to lift is the point of the feature. Manual is still there for the
   * open-ended case.
   */
  const [pauseMode, setPauseMode] = useState<"cycles" | "date" | "manual">("cycles");
  const [pauseCycles, setPauseCycles] = useState(1);
  const [pauseResumeOn, setPauseResumeOn] = useState("");

  /**
   * The restart date staff are about to commit to, in words.
   *
   * Computed with resolvePauseResumesAt — the function the server uses
   * — rather than a second copy of the cycle maths here. A dialog that
   * promised one date while the server stored another is the exact
   * failure mode the shared/ convention exists to prevent, and this is
   * the figure staff will read out to a client on the phone.
   */
  /**
   * The grooms already in the diary that this pause will leave free.
   *
   * Asked for only while the pause dialog is open and re-asked as the
   * plan changes, because the window depends on the restart date. The
   * figure staff need is "two grooms, $190" before they confirm, not a
   * surprise next month.
   */
  const { data: pauseImpact } = trpc.stripeCards.pauseImpact.useQuery(
    {
      membershipId: m.id,
      plan: pauseMode === "cycles"
        ? { mode: "cycles", cycles: pauseCycles }
        : pauseMode === "date" && pauseResumeOn
          ? { mode: "date", resumeOn: new Date(`${pauseResumeOn}T00:00:00+10:00`) }
          : { mode: "manual" },
    },
    { enabled: confirming === "pause" },
  );

  const pausePreview = useMemo(() => {
    if (pauseMode !== "cycles") return null;
    const resolved = resolvePauseResumesAt(
      { mode: "cycles", cycles: pauseCycles },
      {
        nextBillingDate: m.nextBillingDate ? new Date(m.nextBillingDate) : null,
        billingCycle: m.billingCycle === "monthly" ? "monthly" : "weekly",
        billingCycleWeeks: m.billingCycleWeeks ?? 1,
        now: new Date(),
      },
    );
    return resolved?.toLocaleDateString("en-AU", {
      day: "numeric", month: "long", timeZone: "Australia/Brisbane",
    }) ?? null;
  }, [pauseMode, pauseCycles, m.nextBillingDate, m.billingCycle, m.billingCycleWeeks]);

  const cycle = billingCycleFromWeeks(m.billingCycleWeeks);
  const clientName = [m.clientFirstName, m.clientLastName].filter(Boolean).join(" ").trim() || "this client";
  const amount = m.pricePerCycle ? `$${m.pricePerCycle}` : "the membership price";
  const cadence = cycle === "fortnightly" ? "every 2 weeks" : "every week";

  const start = trpc.stripeCards.startSubscription.useMutation({
    onSuccess: (result) => {
      toast.success(result.alreadyExisted ? "Already billing automatically" : "Automatic billing started");
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
      setConfirming(null);
      setFirstChargeOn("");
    },
    onError: (error) => { toast.error(error.message); setConfirming(null); },
  });
  const chargeNow = trpc.stripeCards.chargeNow.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message ?? "The card was declined");
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
      utils.memberships.getFailedPayments.invalidate();
      setConfirming(null);
    },
    onError: (error) => { toast.error(error.message); setConfirming(null); },
  });

  const pause = trpc.stripeCards.pauseSubscription.useMutation({
    // Says what was actually set. The old wording promised a manual
    // restart regardless of the mode chosen, so staff pausing for two
    // cycles would tell the client "not until we call you" and the
    // card would be charged anyway.
    onSuccess: (result) => {
      const resumesAt = result?.resumesAt ? new Date(result.resumesAt) : null;
      toast.success(resumesAt
        ? `Billing paused — restarts ${resumesAt.toLocaleDateString("en-AU", {
            day: "numeric", month: "long", timeZone: "Australia/Brisbane",
          })}`
        : "Billing paused — nothing will be charged until you resume it here");
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
      setConfirming(null);
    },
    onError: (error) => { toast.error(error.message); setConfirming(null); },
  });
  const resume = trpc.stripeCards.resumeSubscription.useMutation({
    onSuccess: () => { toast.success("Billing resumed"); utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate(); setConfirming(null); },
    onError: (error) => { toast.error(error.message); setConfirming(null); },
  });
  const cancelBilling = trpc.stripeCards.cancelSubscription.useMutation({
    onSuccess: () => { toast.success("Automatic billing cancelled"); utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate(); setConfirming(null); },
    onError: (error) => { toast.error(error.message); setConfirming(null); },
  });

  const busy = start.isPending || chargeNow.isPending || pause.isPending || resume.isPending || cancelBilling.isPending;

  const dialog = (
    <Dialog open={confirming !== null} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{
            confirming === "charge" ? "Retry this payment now?"
            : confirming === "pause" ? "Pause billing?"
            : confirming === "resume" ? "Resume billing?"
            : confirming === "cancel" ? "Stop automatic billing?"
            : "Start automatic billing?"
          }</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {confirming === "charge"
            ? <>This retries {clientName}&rsquo;s outstanding membership payment against their saved card, now. The amount is whatever that failed invoice is for. It cannot be undone from here &mdash; a mistake has to be refunded in Stripe.</>
            : confirming === "pause"
            ? (m.stripeSubscriptionId
                ? <>{clientName}&rsquo;s card and subscription stay in place, and nothing builds up while paused &mdash; they will not be billed for the missed weeks when they come back. Choose below when billing restarts.</>
                /* No card, no subscription: this records the hold and
                   marks the membership paused. It cannot stop an invoice
                   somebody raises by hand, or anything still running in
                   MoeGo — saying otherwise would have staff promise a
                   client something Groomigo cannot deliver. */
                : <>{clientName} is invoiced by hand, so this records the hold and marks the membership paused &mdash; it does <strong>not</strong> stop an invoice someone raises manually, or anything still billing in MoeGo. Choose below when it comes off hold.</>)
            : confirming === "resume"
            ? (m.stripeSubscriptionId
                ? <>{clientName} will be charged <strong>{amount}</strong> {cadence} again from their next billing date. Nothing is charged right now for the paused period.</>
                : <>This takes {clientName}&rsquo;s membership off hold and back to active. Nothing is charged &mdash; they are invoiced by hand, so billing them again is still something someone has to do.</>)
            : confirming === "cancel"
            ? <>This stops {clientName} being charged automatically. The membership itself stays active &mdash; this only ends the card billing. Use <strong>Pause</strong> if they are away for a while, or cancel the membership itself if they are leaving the salon.</>
            : firstChargeOn
            ? <>This bills {clientName}&rsquo;s saved card <strong>{amount}</strong> {cadence}, with the <strong>first charge on {firstChargeOn}</strong>. Nothing is taken before then.</>
            : <>This bills {clientName}&rsquo;s saved card <strong>{amount}</strong> {cadence}, starting with a charge right now. It cannot be undone from here.</>}
        {/* A shared family payment: say what the action does to the OTHER
            dogs on it, because pausing, resuming and retrying act on the
            payment, and stopping billing does not. */}
        {(m.sharedPaymentWith ?? 0) > 0 && confirming && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            {(() => {
              const n = m.sharedPaymentWith ?? 0;
              const others = `${n} other membership${n === 1 ? "" : "s"}`;
              return confirming === "cancel"
                ? <>This is one payment shared with {others} for {clientName}. Only this membership&rsquo;s line comes off; the rest keeps billing.</>
                : confirming === "pause"
                ? <>This is one payment shared with {others} for {clientName}. Pausing it pauses billing for <strong>all</strong> of them.</>
                : confirming === "resume"
                ? <>This is one payment shared with {others} for {clientName}. Resuming restarts billing for <strong>all</strong> of them.</>
                : <>This is one payment shared with {others} for {clientName}, so it acts on the whole payment.</>;
            })()}
          </p>
        )}
        {confirming === "pause" && (
          <div className="grid gap-2 pt-1">
            <Label className="text-xs">When should billing start again?</Label>
            {/* Andy, 25/11/2026: "give the option to have a manual restart
                date ... But also add the option to have 'Start again after
                1 week, 2 weeks, 3 weeks etc.'" Both were here as "certain
                cycles" and "certain date"; reworded, with the common
                lengths one tap away. */}
            {([
              { mode: "cycles", label: "Start again after…" },
              { mode: "date", label: "Start again on a date" },
              { mode: "manual", label: "Restart manually" },
            ] as const).map(({ mode, label }) => (
              <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`pause-mode-${m.id}`}
                  className="accent-primary"
                  checked={pauseMode === mode}
                  onChange={() => setPauseMode(mode)}
                />
                <span>{label}</span>
              </label>
            ))}
            {pauseMode === "cycles" && (() => {
              const unit = m.billingCycle === "monthly" ? "month" : cycle === "fortnightly" ? "fortnight" : "week";
              return (
                <div className="grid gap-2 pl-6">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Start again after">
                    {[1, 2, 3, 4].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={pauseCycles === n ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs"
                        aria-pressed={pauseCycles === n}
                        onClick={() => setPauseCycles(n)}
                      >
                        {n} {unit}{n === 1 ? "" : "s"}
                      </Button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      className="h-7 w-16 text-xs"
                      aria-label={`Other number of ${unit}s`}
                      value={pauseCycles}
                      onChange={(e) => setPauseCycles(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {pauseCycles} {unit}{pauseCycles === 1 ? "" : "s"} skipped
                    {pausePreview ? <> &mdash; starts again <strong>{pausePreview}</strong></> : null}
                  </span>
                </div>
              );
            })()}
            {pauseMode === "date" && (
              <div className="pl-6 grid gap-1">
                <DateField className="h-8"
                  aria-label="Date billing restarts"
                  value={pauseResumeOn}
                  onChange={next => setPauseResumeOn(next)} />
                <p className="text-xs text-muted-foreground">Billing starts again on this date.</p>
              </div>
            )}
            {pauseMode === "manual" && (
              <p className="pl-6 text-xs text-muted-foreground">
                Nothing is charged until somebody resumes it here. It will not restart on its own.
              </p>
            )}

            {/* The part nobody could see before.

                Coverage is decided when a booking is made and frozen
                onto it, so a groom already in the diary stays free
                through the pause while the fee is skipped. One
                full-price groom outweighs several weeks of saved fee,
                so staff get the number before they commit — and can
                move or cancel those grooms first if they would rather. */}
            {pauseImpact && pauseImpact.freeGrooms.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/40">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  {pauseImpact.freeGrooms.length} groom{pauseImpact.freeGrooms.length === 1 ? "" : "s"} already booked
                  {pauseImpact.openEnded ? " in the next 8 weeks" : " during this pause"}
                </p>
                <ul className="mt-1 space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                  {pauseImpact.freeGrooms.slice(0, 5).map((g) => (
                    <li key={g.id}>
                      {g.petName ?? "Dog"} &mdash;{" "}
                      {new Date(g.scheduledStart).toLocaleDateString("en-AU", {
                        weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane",
                      })}
                    </li>
                  ))}
                  {pauseImpact.freeGrooms.length > 5 && (
                    <li>&hellip; and {pauseImpact.freeGrooms.length - 5} more</li>
                  )}
                </ul>
                <p className="mt-1.5 text-amber-900/80 dark:text-amber-200/80">
                  {pauseImpact.freeGrooms.length === 1 ? "It stays" : "They stay"} free &mdash; the
                  membership covered {pauseImpact.freeGrooms.length === 1 ? "it" : "them"} when
                  {pauseImpact.freeGrooms.length === 1 ? " it was" : " they were"} booked, and pausing does not
                  change that. Move or cancel {pauseImpact.freeGrooms.length === 1 ? "it" : "them"} first if that
                  is not what you want.
                </p>
              </div>
            )}
          </div>
        )}
        {confirming === "start" && (
          <div className="grid gap-1.5">
            <Label htmlFor={`first-charge-${m.id}`} className="text-xs">First charge (leave blank to charge now)</Label>
            <DateField id={`first-charge-${m.id}`}
              
              value={firstChargeOn}
              onChange={next => setFirstChargeOn(next)} />
            <p className="text-xs text-muted-foreground">
              Starts at 9am Brisbane that day, so a decline lands while the salon is open.
            </p>
          </div>
        )}
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(null)}>Cancel</Button>
          <Button
            size="sm"
            // A date pause with no date would otherwise post an Invalid
            // Date and be refused by the server after the dialog closed.
            disabled={busy || (confirming === "pause" && pauseMode === "date" && !pauseResumeOn)}
            variant={confirming === "cancel" ? "destructive" : "default"}
            onClick={() => {
              if (confirming === "charge") chargeNow.mutate({ membershipId: m.id });
              else if (confirming === "pause") {
                pause.mutate({
                  membershipId: m.id,
                  plan: pauseMode === "cycles"
                    ? { mode: "cycles", cycles: pauseCycles }
                    /**
                     * Start of day Brisbane, not midday.
                     *
                     * Subscriptions started with a chosen first charge
                     * are anchored at 09:00 Brisbane, so a midday
                     * restart let that morning's invoice be raised
                     * while collection was still paused. Stripe voids
                     * it, and the client silently skips a whole extra
                     * cycle. Midnight puts the restart ahead of any
                     * invoice raised that day.
                     */
                    : pauseMode === "date"
                      ? { mode: "date", resumeOn: new Date(`${pauseResumeOn}T00:00:00+10:00`) }
                      : { mode: "manual" },
                });
              }
              else if (confirming === "resume") resume.mutate({ membershipId: m.id });
              else if (confirming === "cancel") cancelBilling.mutate({ membershipId: m.id });
              else start.mutate({ membershipId: m.id, firstChargeOn: firstChargeOn || null });
            }}
          >
            {busy ? "Working…"
              : confirming === "charge" ? "Retry the payment"
              : confirming === "pause" ? (m.stripeSubscriptionId ? "Pause billing" : "Put on hold")
              : confirming === "resume" ? "Resume billing"
              : confirming === "cancel" ? "Stop billing"
              : firstChargeOn ? `Bill ${amount} ${cadence} from ${firstChargeOn}` : `Bill ${amount} ${cadence}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (m.stripeSubscriptionId) {
    // A deliberate pause and a failed-payment suspension share the status
    // "paused", so tell them apart by whether a payment actually failed.
    const failing = (m.failedPaymentCount ?? 0) > 0;
    const pausedByStaff = m.status === "paused" && !failing;
    /**
     * When a paused membership starts paying again.
     *
     * "Billing paused" on its own was the whole of the old badge, and
     * it is the thing staff actually ask about — a client rings to
     * check and nobody can answer without opening Stripe.
     */
    const pauseRestartLabel = pausedByStaff && m.pauseResumesAt
      ? `Paused till ${new Date(m.pauseResumesAt).toLocaleDateString("en-AU", {
          day: "numeric", month: "short", timeZone: "Australia/Brisbane",
        })}`
      : pausedByStaff && m.pauseMode === "manual"
        ? "Paused — manual restart"
        : null;

    return (
      <div className="flex flex-col items-stretch gap-1">
        <Badge
          /**
           * The full story on hover. The badge has room for "Paused
           * till 3 Nov" and not for the difference between a holiday
           * and a debt, which is the thing staff most need to know
           * before they ring a client about it.
           */
          title={describePause(
            {
              status: m.status,
              pauseMode: m.pauseMode ?? null,
              pauseResumesAt: m.pauseResumesAt ? new Date(m.pauseResumesAt) : null,
              failedPaymentCount: m.failedPaymentCount ?? 0,
              bookingSuspended: m.bookingSuspended ?? false,
            },
            (date) => date.toLocaleDateString("en-AU", {
              day: "numeric", month: "long", timeZone: "Australia/Brisbane",
            }),
          )}
          className={`block text-center text-[10px] ${
          pausedByStaff
            ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            : cycle
              ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300"
        }`}>
          {pausedByStaff
            ? pauseRestartLabel ?? "Billing paused"
            : cycle === "fortnightly" ? "Stripe fortnightly"
            : cycle === "weekly" ? "Stripe weekly"
            : "Stripe — cycle unclear"}
        </Badge>

        {failing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-full gap-1.5 whitespace-nowrap px-2 text-[11px] font-semibold"
            disabled={busy}
            onClick={() => setConfirming("charge")}
          >
            <RefreshCw className="h-3 w-3 shrink-0" />
            {chargeNow.isPending ? "Retrying…" : "Retry payment"}
          </Button>
        )}

        <div className="flex items-center gap-1">
          {pausedByStaff ? (
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 gap-1.5 whitespace-nowrap px-2 text-[11px] font-semibold"
              disabled={busy}
              onClick={() => setConfirming("resume")}
            >
              <PlayCircle className="h-3 w-3 shrink-0" />
              {resume.isPending ? "Resuming…" : "Resume"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 gap-1.5 whitespace-nowrap px-2 text-[11px] font-semibold"
              disabled={busy}
              onClick={() => setConfirming("pause")}
            >
              <PauseCircle className="h-3 w-3 shrink-0" />
              {pause.isPending ? "Pausing…" : "Pause"}
            </Button>
          )}
          {/* Cancel membership in place of Stop billing (Andy, 25/11/2026:
              "Pause | Cancel Membership (replace Stop Billing)"). Cancelling
              stops the billing too; stopping billing alone left a live
              membership nobody was charging for. */}
          <MembershipCancelControl m={m} variant="button" />
        </div>
        {dialog}
      </div>
    );
  }

  // An unrecognised cycle must not silently bill weekly — see
  // billingCycleFromWeeks. Ask a human instead of guessing the cadence.
  if (!cycle) {
    return (
      <span
        className="text-[10px] font-medium text-muted-foreground"
        title={`This membership bills every ${m.billingCycleWeeks ?? "?"} weeks, which Stripe billing doesn't cover yet. Change it to weekly or fortnightly first.`}
      >
        Cycle not supported
      </span>
    );
  }

  /**
   * Hand-billed: no Stripe subscription, invoiced by the salon.
   *
   * Most of the book is still this while it migrates off MoeGo, and
   * they are the clients most likely to ask for a pause — so the
   * button belongs here too, not only on the Stripe rows. The server
   * has accepted it all along; only this branch was missing.
   *
   * A paused one deliberately does NOT offer "Set Weekly Billing".
   * Starting a subscription charges immediately, and doing that to a
   * client who was just told their billing was on hold is the worst
   * outcome this screen can produce. The server refuses it too.
   */
  const handBilledPaused = m.status === "paused" && (m.failedPaymentCount ?? 0) === 0;
  if (handBilledPaused) {
    return (
      <div className="flex flex-col items-stretch gap-1">
        <Badge
          title={describePause(
            {
              status: m.status,
              pauseMode: m.pauseMode ?? null,
              pauseResumesAt: m.pauseResumesAt ? new Date(m.pauseResumesAt) : null,
              failedPaymentCount: m.failedPaymentCount ?? 0,
              bookingSuspended: m.bookingSuspended ?? false,
            },
            (date) => date.toLocaleDateString("en-AU", {
              day: "numeric", month: "long", timeZone: "Australia/Brisbane",
            }),
          )}
          className="block text-center text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          {m.pauseResumesAt
            ? `Paused till ${new Date(m.pauseResumesAt).toLocaleDateString("en-AU", {
                day: "numeric", month: "short", timeZone: "Australia/Brisbane",
              })}`
            : "Paused — manual restart"}
        </Badge>
        <Button
          type="button"
          size="sm"
          className="h-7 w-full gap-1.5 whitespace-nowrap px-2 text-[11px] font-semibold"
          disabled={busy}
          onClick={() => setConfirming("resume")}
        >
          <PlayCircle className="h-3 w-3 shrink-0" />
          {resume.isPending ? "Resuming…" : "Resume"}
        </Button>
        {dialog}
      </div>
    );
  }

  return (
    <>
      {/* A real button, not a 10px text link: this is the action that puts a
          client onto automatic billing, and staff could not find it.

          Pastel BLUE, deliberately off-brand. Every other action on this
          row is the salon's primary colour, so a dark pink "Set Weekly
          Billing" sat among dark pink links and the one button that
          starts taking money was the hardest to pick out. Blue is not
          one of the ramps the brand theme rewrites (violet and pink
          are), so it stays blue whatever colour a salon chooses — which
          is the point, though a salon whose own brand is blue would
          want this revisited. */}
      <Button
        type="button"
        size="sm"
        className="h-7 w-full gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold border border-blue-300 bg-blue-100 text-blue-900 hover:bg-blue-200 hover:text-blue-950 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100 dark:hover:bg-blue-900"
        disabled={busy}
        onClick={() => setConfirming("start")}
      >
        <CreditCard className="h-3 w-3 shrink-0" />
        {start.isPending
          ? "Starting…"
          : cadence === "every week"
            ? "Set Weekly Billing"
            : "Set Fortnightly Billing"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-1 h-7 w-full gap-1.5 whitespace-nowrap px-2 text-[11px] font-semibold"
        disabled={busy}
        onClick={() => setConfirming("pause")}
      >
        <PauseCircle className="h-3 w-3 shrink-0" />
        {pause.isPending ? "Pausing…" : "Pause"}
      </Button>
      {dialog}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const MEMBERSHIPS_VIEW_KEY = "memberships:view";
const MEMBERSHIP_TABS = ["active", "to_migrate", "pending_payment", "paused", "cancelled", "failed_payments", "accounts_receivable", "receivable"];
const MEMBERSHIP_SORT_KEYS: SortKey[] = ["client", "membership", "tier", "price", "nextBilling", "status"];

/**
 * Where the list was left: page, tab, filters and sort, kept for this
 * browser tab so going to a client and coming back lands on the same page
 * (shared/listPaging.ts). A deep link's ?tab= still wins, and starts on
 * page 1 of that tab.
 */
function initialMembershipsView(): SavedListView {
  const defaults: SavedListView = { page: 1, tab: "active", tier: "all", search: "", sortKey: "client", sortDir: "asc" };
  if (typeof window === "undefined") return defaults;
  let raw: string | null = null;
  try { raw = window.sessionStorage.getItem(MEMBERSHIPS_VIEW_KEY); } catch { /* storage blocked: start fresh */ }
  const saved = readSavedListView(raw, defaults, {
    tabs: MEMBERSHIP_TABS,
    tiers: TIER_OPTIONS.map((t) => t.value),
    sortKeys: MEMBERSHIP_SORT_KEYS,
  });
  // Deep link target for the notification bell: /memberships?tab=failed_payments
  // lands straight on the failed payments it was telling you about.
  const requested = new URLSearchParams(window.location.search).get("tab");
  if (requested && MEMBERSHIP_TABS.includes(requested) && requested !== saved.tab) {
    return { ...saved, tab: requested, page: 1 };
  }
  return saved;
}

export default function Memberships() {
  const [initialView] = useState(initialMembershipsView);
  const [search, setSearch] = useState(initialView.search);
  const [tierFilter, setTierFilter] = useState<string>(initialView.tier);
  const [activeTab, setActiveTab] = useState(initialView.tab);
  const [page, setPage] = useState(initialView.page);
  const [sortKey, setSortKey] = useState<SortKey>(initialView.sortKey as SortKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialView.sortDir);
  useEffect(() => {
    const view: SavedListView = { page, tab: activeTab, tier: tierFilter, search, sortKey, sortDir };
    try { window.sessionStorage.setItem(MEMBERSHIPS_VIEW_KEY, JSON.stringify(view)); } catch { /* storage blocked: nothing to keep */ }
  }, [page, activeTab, tierFilter, search, sortKey, sortDir]);
  const listTopRef = useRef<HTMLDivElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: currentUser } = trpc.auth.me.useQuery();
  const isAdmin = currentUser?.role === "admin";

  const tierParam = tierFilter === "all" ? undefined : tierFilter as "diamond" | "platinum" | "gold" | "silver" | "bronze";
  const listFilter = membershipListFilter(activeTab);
  const statusParam = listFilter.status as "active" | "paused" | "cancelled" | "pending_payment" | "expired" | undefined;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.memberships.list.useQuery({
    status: statusParam,
    billing: listFilter.billing,
    tier: tierParam,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortKey,
    sortDir,
  }, { enabled: isAdmin });

  const { data: failedPayments } = trpc.memberships.getFailedPayments.useQuery({}, { enabled: isAdmin });
  // ── Failed payment mutations & state ──────────────────────────────────────
  const recordFailureMutation = trpc.memberships.recordPaymentFailure.useMutation({
    onSuccess: (res) => {
      const strike = (res as { failedPaymentCount?: number }).failedPaymentCount ?? 1;
      toast.success((res as { suspended?: boolean }).suspended
        ? `Strike ${strike}: bookings suspended. Client emailed.`
        : strike >= 2
          ? `Strike ${strike} recorded. Client emailed; retry on the next business day.`
          : `Strike 1 recorded. Client sees a notice in their portal; retry on the next business day.`);
      setConfirmRecordFailure(null);
      setFailureReason("");
      utils.memberships.getFailedPayments.invalidate();
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const resolveFailureMutation = trpc.memberships.resolvePaymentFailure.useMutation({
    onSuccess: () => {
      toast.success("Payment failure cleared — membership restored to active.");
      setConfirmResolve(null);
      utils.memberships.getFailedPayments.invalidate();
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  /* "Retry payment": Stripe tries the open payment again, now. The same
     procedure as Charge now on the membership itself. */
  const [confirmRetry, setConfirmRetry] = useState<{ id: number; clientName: string; petName: string | null; failedCount: number; reason: string | null } | null>(null);
  const retryPaymentMutation = trpc.stripeCards.chargeNow.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success("Payment taken. The membership is active again.");
      else toast.error(result.message ?? "The payment was declined again.", { duration: 10000 });
      setConfirmRetry(null);
      utils.memberships.getFailedPayments.invalidate();
      utils.memberships.list.invalidate(); utils.clients.getProfile.invalidate();
    },
    onError: (e) => { toast.error(e.message, { duration: 10000 }); setConfirmRetry(null); },
  });
  const [confirmRecordFailure, setConfirmRecordFailure] = useState<{ id: number; clientName: string; petName: string | null; membershipName: string | null; failedCount: number } | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [confirmResolve, setConfirmResolve] = useState<{ id: number; clientName: string; petName: string | null } | null>(null);
  /** Retry / Record Failure / Resolve for one failed payment: the table and the phone cards share these. */
  const failedPaymentActions = (fp: NonNullable<typeof failedPayments>[number]) => (
    <>
      {/* Andy, 19/11/2026: a "retry payment" button
          here that has Stripe try the payment again.
          Only where Stripe bills the membership, so
          there is something to retry. */}
      {fp.stripeBilled && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-7"
          disabled={retryPaymentMutation.isPending}
          onClick={() => setConfirmRetry({
            id: fp.membershipId,
            clientName: `${fp.clientFirstName ?? ""} ${fp.clientLastName ?? ""}`.trim(),
            petName: fp.petName,
            failedCount: fp.failedCount,
            reason: fp.failureReason,
          })}
        >
          <CheckCircle2 className="h-3 w-3" /> Retry payment
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-xs h-7 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
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
    </>
  );
  const items: MembershipItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // The list above is every membership on Failed Payments and Accounts
  // Receivable, so the heading and pager follow the tab instead
  // (shared/membershipTabCount.ts, Andy 25/11/2026).
  const tabCount = membershipTabCount({ tab: activeTab, listTotal: total, failedPaymentCount: failedPayments?.length ?? 0 });
  // A remembered page can be past the end once plans have been cancelled.
  useEffect(() => {
    if (data && page > totalPages) setPage(totalPages);
  }, [data, page, totalPages]);
  /** Jump to a page and bring the top of the list into view. */
  const goToPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), totalPages));
    listTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

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
              {tabCount.heading}
              {tabCount.showPager && tierFilter !== "all" ? ` · ${tierFilter} tier` : ""}
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Membership
          </Button>
        </div>

        {failedPayments && failedPayments.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {failedPayments.length} Failed Payment{failedPayments.length > 1 ? "s" : ""} Require Attention
                  </p>
                  <div className="mt-2 space-y-1">
                    {failedPayments.map(fp => (
                      <div key={fp.membershipId} className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
                        <span>{fp.clientFirstName} {fp.clientLastName} — {fp.petName} ({fp.membershipName})</span>
                        <div className="flex items-center gap-2">
                          {fp.clientPhone && (
                            <a href={`tel:${fp.clientPhone}`} className="flex items-center gap-0.5 hover:underline">
                              <Phone className="h-3 w-3" />{fp.clientPhone}
                            </a>
                          )}
                          <Badge className="bg-amber-200 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-[10px]">{fp.failedCount}x failed</Badge>
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

        <MembershipSignupRequests />
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* Tabs are an inline-flex row: on a phone they ran past the
              right edge and took the page with them. They wrap onto a
              second line on a phone (25/11/2026: scrolling hid "Cancelled"
              and the rest with no hint they were there), and scroll on a
              wider screen. */}
          <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 sm:flex-nowrap sm:overflow-x-auto">
            {STATUS_TABS.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
            ))}
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
              <div ref={tab.key === activeTab ? listTopRef : undefined} className="mb-3 flex scroll-mt-4 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Showing {total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
                <PageNumbers page={page} totalPages={totalPages} onPage={goToPage} label="Membership pages, top" />
              </div>
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
              <>
              {/* Phones: one card per failed payment, buttons full width.
                  Andy, 25/11/2026: "Alignment is out on mobile view. Can't
                  scroll sideways to hit the buttons." The table needed
                  sideways scrolling to reach Retry, Record and Resolve. */}
              <div className="grid gap-3 md:hidden" data-testid="failed-payments-cards">
                {failedPayments!.map(fp => (
                  <div key={fp.membershipId} className="space-y-3 rounded-xl border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
                        <Dog className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{fp.clientFirstName} {fp.clientLastName}</p>
                        <p className="text-sm text-muted-foreground">{fp.petName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fp.membershipName}
                          {fp.lastFailedAt
                            ? ` · failed ${new Date(fp.lastFailedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: getActiveTimeZone() })}`
                            : ""}
                        </p>
                      </div>
                      <Badge className={`shrink-0 text-xs font-bold ${
                        fp.failedCount >= 2 ? "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300" : "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300"
                      }`}>
                        {fp.failedCount}x
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {fp.suspended ? (
                        <Badge className="text-xs bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300">Suspended</Badge>
                      ) : (
                        <Badge className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">Pending Retry</Badge>
                      )}
                      {fp.failureReason && <span className="text-xs text-muted-foreground">{fp.failureReason}</span>}
                    </div>
                    {describeDeclineHistory(fp.declineHistory, getActiveTimeZone()) && (
                      <p className="text-xs font-medium text-red-700 dark:text-red-400" data-testid="decline-history">
                        {describeDeclineHistory(fp.declineHistory, getActiveTimeZone())}
                      </p>
                    )}
                    <div className="grid gap-2 [&_button]:h-11 [&_button]:w-full [&_button]:justify-center [&_button]:text-sm [&_button_svg]:h-4 [&_button_svg]:w-4">
                      {failedPaymentActions(fp)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden bg-card rounded-xl border overflow-hidden md:block">
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
                            <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center flex-shrink-0">
                              <Dog className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{fp.clientFirstName} {fp.clientLastName}</p>
                              <p className="text-xs text-muted-foreground">{fp.petName}</p>
                              {/* Which plan failed, and when. A phone saw
                                  only the client and a count. */}
                              <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                                {fp.membershipName}
                                {fp.lastFailedAt
                                  ? ` · last ${new Date(fp.lastFailedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: getActiveTimeZone() })}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <p className="text-sm">{fp.membershipName}</p>
                        </td>
                        <td className="p-3">
                          <Badge className={`text-xs font-bold ${
                            fp.failedCount >= 2 ? "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300" : "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300"
                          }`}>
                            {fp.failedCount}x
                          </Badge>
                        </td>
                        <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
                          {fp.lastFailedAt ? new Date(fp.lastFailedAt).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone() }) : "—"}
                          {/* Every decline on record, not just this run
                              (Lauren, 26/11/2026: "record how many times it
                              happens"). The strike count resets on a success. */}
                          {describeDeclineHistory(fp.declineHistory, getActiveTimeZone()) && (
                            <p className="mt-1 font-medium text-red-700 dark:text-red-400">
                              {describeDeclineHistory(fp.declineHistory, getActiveTimeZone())}
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          {fp.suspended ? (
                            <Badge className="text-xs bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300">Suspended</Badge>
                          ) : (
                            <Badge className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">Pending Retry</Badge>
                          )}
                          {/* Stripe's own reason (Andy, 19/11/2026: "Pull the
                              data from Stripe for the real reason"). Every row
                              used to say only "Card declined". */}
                          {fp.failureReason && (
                            <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">{fp.failureReason}</p>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {failedPaymentActions(fp)}
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
        </Tabs>

        {/* Below the list, not above it. Andy, 28/10/2026: "Swap the
            missing dogs underneath the active memberships." It sat above
            the tabs on the reasoning that it needs a decision — but it
            pushed the 151 live plans down the page for the sake of a
            handful of exceptions, and the plans are what the page is
            for. It still renders nothing when every plan covers as many
            dogs as its name says. */}
        <MembershipPetAssignment />

        <div className={`flex items-center justify-between text-sm text-muted-foreground pt-1 ${FLOATING_BUTTON_CLEARANCE} ${tabCount.showPager ? "" : "invisible"}`}>
          <span>Showing {total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <PageNumbers page={page} totalPages={totalPages} onPage={goToPage} label="Membership pages, bottom" />
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
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
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
                  {/* Weekly ladder (Andy, 25/11/2026): portal notice, then
                      email, then suspension on the third. */}
                  {confirmRecordFailure.failedCount >= 2 ? (
                    <span className="block mt-1 text-red-600 dark:text-red-400 font-medium">⚠ This is Strike {confirmRecordFailure.failedCount + 1}. Bookings will be suspended and the client emailed.</span>
                  ) : confirmRecordFailure.failedCount === 1 ? (
                    <span className="block mt-1 text-amber-700 dark:text-amber-400 font-medium">This is Strike 2. The client will be emailed and a retry set for the next business day.</span>
                  ) : (
                    <span className="block mt-1">This is Strike 1. The client sees a notice in their portal and a retry is set for the next business day.</span>
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

      {/* ── Retry Payment Dialog ── */}
      <Dialog open={!!confirmRetry} onOpenChange={open => { if (!open) setConfirmRetry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retry this payment now?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Stripe will try the payment again for <strong className="text-foreground">{confirmRetry?.clientName}</strong>
              {confirmRetry?.petName ? ` (${confirmRetry.petName})` : ""}, on the card they have saved.
            </p>
            {confirmRetry?.reason && <p>Last time: {confirmRetry.reason}.</p>}
            <p>{retryWarning(confirmRetry?.failedCount ?? 0)}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRetry(null)}>Not now</Button>
            <Button
              disabled={retryPaymentMutation.isPending}
              onClick={() => { if (confirmRetry) retryPaymentMutation.mutate({ membershipId: confirmRetry.id }); }}
            >
              {retryPaymentMutation.isPending ? "Trying..." : "Retry payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Payment Failure Dialog ── */}
      <Dialog open={!!confirmResolve} onOpenChange={open => { if (!open) setConfirmResolve(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
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
          {/* Two outcomes, because they are not the same thing. One is money
              that arrived; the other is money given up on, and only the
              second writes a credit adjustment to the ledger. */}
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={resolveFailureMutation.isPending}
              onClick={() => {
                if (!confirmResolve) return;
                resolveFailureMutation.mutate({ membershipId: confirmResolve.id, outcome: "paid" });
              }}
            >
              {resolveFailureMutation.isPending ? "Saving…" : "Payment received"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={resolveFailureMutation.isPending}
              onClick={() => {
                if (!confirmResolve) return;
                resolveFailureMutation.mutate({ membershipId: confirmResolve.id, outcome: "written_off" });
              }}
            >
              {resolveFailureMutation.isPending ? "Saving…" : "Write off — not collecting"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setConfirmResolve(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
