import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Plus, Search, User, Phone, Mail,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, Download, Dog, Calendar,
} from "lucide-react";
import { useState, useCallback } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { getClientPreviewSide } from "../lib/clientPreviewPosition";

const STATUS_COLOURS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-100 text-slate-600",
  lapsed: "bg-amber-100 text-amber-800",
  blocked: "bg-red-100 text-red-800",
};

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom",
  styled_groom: "Styled Groom",
  bath_only: "Bath / Tidy",
  nail_trim: "Nail Trim",
  daycare: "Daycare",
  deshed: "Deshed",
  other: "Other",
};

type SortBy = "firstName" | "lastName" | "email" | "phone" | "status" | "createdAt";
type SortDir = "asc" | "desc";
type StatusFilter = "active" | "inactive" | "lapsed" | "blocked" | "all";

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const;
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

function SortIcon({ col, sortBy, sortDir }: { col: SortBy; sortBy: SortBy; sortDir: SortDir }) {
  if (col !== sortBy) return <ChevronsUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 ml-1 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 ml-1 text-primary" />;
}

// Hover card that lazy-loads client context and stays beside the hovered name.
function ClientHoverCard({
  clientId,
  client,
  children,
}: {
  clientId: number;
  client: { fullName: string; email?: string | null; phone?: string | null };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const { data, isLoading } = trpc.clients.quickPreview.useQuery(
    { clientId },
    { enabled: open, staleTime: 60_000 }
  );

  const positionPreview = useCallback((element: HTMLElement) => {
    if (typeof window === "undefined") return;
    setSide(getClientPreviewSide(element.getBoundingClientRect().right, window.innerWidth));
  }, []);

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={400} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span
          className="inline-flex max-w-max"
          onPointerEnter={(event) => positionPreview(event.currentTarget)}
          onFocus={(event) => positionPreview(event.currentTarget)}
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        className="z-[70] w-80 overflow-hidden rounded-xl border border-primary/15 bg-popover p-0 shadow-xl shadow-black/15"
        side={side}
        align="center"
        sideOffset={14}
        collisionPadding={16}
      >
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="divide-y">
            <div className="bg-primary/[0.06] px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{client.fullName}</p>
              {(client.phone || client.email) ? (
                <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {client.phone && (
                    <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="flex w-fit items-center gap-1.5 hover:text-primary">
                      <Phone className="h-3 w-3" /> {client.phone}
                    </a>
                  )}
                  {client.email && (
                    <a href={`mailto:${client.email}`} className="flex w-fit max-w-full items-center gap-1.5 hover:text-primary">
                      <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{client.email}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No contact details on file</p>
              )}
            </div>
            {/* Pets section */}
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Dog className="h-3 w-3" /> Pets
              </p>
              {data?.pets.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pets on file</p>
              ) : (
                <div className="space-y-1">
                  {data?.pets.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Dog className="h-3 w-3 text-amber-600" />
                      </div>
                      <div>
                        <span className="text-xs font-medium">{p.name}</span>
                        {p.breed && <span className="text-xs text-muted-foreground ml-1">· {p.breed}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Recent appointments section */}
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Recent Appointments
              </p>
              {data?.appointments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No appointments yet</p>
              ) : (
                <div className="space-y-1.5">
                  {data?.appointments.map(a => (
                    <div key={a.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium">{a.petName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {SERVICE_LABELS[a.serviceType] ?? a.serviceType}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.scheduledStart).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })}
                        </p>
                        <Badge className={`text-[10px] px-1 py-0 ${a.workflowState === "complete" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {a.workflowState}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// Download helper — triggers a browser file download from a string
function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Clients() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(50);
  const [sortBy, setSortBy] = useState<SortBy>("firstName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showAdd, setShowAdd] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [newClientId, setNewClientId] = useState<number | null>(null);
  const [savedPets, setSavedPets] = useState<Array<{ name: string; breed: string }>>([]);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", notes: "", referralSource: "",
  });
  const [petForm, setPetForm] = useState({
    name: "", breed: "", species: "dog", gender: "unknown",
    weightKg: "", coatType: "", colour: "", desexed: false,
    behaviourNotes: "", groomingNotes: "",
  });

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
    clearTimeout((window as any).__clientSearchTimer);
    (window as any).__clientSearchTimer = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const queryParams = {
    tenantId: 1,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    pageSize,
    sortBy,
    sortDir,
  };

  const { data, refetch, isLoading } = trpc.clients.list.useQuery(queryParams);

  // CSV export — fetches all matching rows then triggers download
  const exportQuery = trpc.clients.exportCsv.useQuery(
    { tenantId: 1, search: debouncedSearch || undefined, status: statusFilter !== "all" ? statusFilter : undefined, sortBy, sortDir },
    { enabled: false }
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportQuery.refetch();
      const rows = result.data?.rows ?? [];
      const header = ["ID", "First Name", "Last Name", "Email", "Phone", "Address", "Status", "Referral Source", "Member Since"];
      const csvRows = rows.map(r => [
        r.id,
        `"${(r.firstName ?? "").replace(/"/g, '""')}"`,
        `"${(r.lastName ?? "").replace(/"/g, '""')}"`,
        `"${(r.email ?? "").replace(/"/g, '""')}"`,
        `"${(r.phone ?? "").replace(/"/g, '""')}"`,
        `"${(r.address ?? "").replace(/"/g, '""')}"`,
        r.status,
        `"${(r.referralSource ?? "").replace(/"/g, '""')}"`,
        new Date(r.createdAt).toLocaleDateString("en-AU"),
      ].join(","));
      const csv = [header.join(","), ...csvRows].join("\n");
      const label = statusFilter !== "all" ? `_${statusFilter}` : "";
      const q = debouncedSearch ? `_${debouncedSearch.replace(/\s+/g, "_")}` : "";
      downloadCsv(csv, `clients${label}${q}_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${rows.length.toLocaleString()} clients`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const [addAnotherPet, setAddAnotherPet] = useState(false);
  const createPetMutation = trpc.pets.create.useMutation({
    onSuccess: (_, vars) => {
      setSavedPets(prev => [...prev, { name: vars.name, breed: vars.breed ?? "" }]);
      if (addAnotherPet) {
        // Stay on step 2, clear form for next pet
        setPetForm({ name: "", breed: "", species: "dog", gender: "unknown", weightKg: "", coatType: "", colour: "", desexed: false, behaviourNotes: "", groomingNotes: "" });
        setAddAnotherPet(false);
        toast.success(`Pet added! Add another or click Done.`);
      } else {
        toast.success("Client and pets saved");
        setShowAdd(false);
        setAddStep(1);
        setNewClientId(null);
        setSavedPets([]);
        refetch();
        setForm({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", referralSource: "" });
        setPetForm({ name: "", breed: "", species: "dog", gender: "unknown", weightKg: "", coatType: "", colour: "", desexed: false, behaviourNotes: "", groomingNotes: "" });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.clients.create.useMutation({
    onSuccess: (data) => {
      if (data?.id) {
        setNewClientId(data.id);
        setAddStep(2);
      } else {
        toast.success("Client added");
        setShowAdd(false);
        refetch();
        setForm({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", referralSource: "" });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSort = (col: SortBy) => {
    if (col === sortBy) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const SortTh = ({ col, label, className = "" }: { col: SortBy; label: string; className?: string }) => (
    <th
      className={`text-left p-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
      </span>
    </th>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold font-display">Clients</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : `${total.toLocaleString()} clients`}
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Client
          </Button>
        </div>

        {/* Search + filter toolbar */}
        <div className="flex gap-2 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email or phone…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={v => { setStatusFilter(v as StatusFilter); setPage(1); }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="lapsed">Lapsed</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          {/* CSV export */}
          <Button variant="outline" className="gap-2 flex-shrink-0" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b sticky top-0 z-10">
              <tr>
                <SortTh col="firstName" label="First Name" />
                <SortTh col="lastName" label="Last Name" />
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                <SortTh col="status" label="Status" className="hidden lg:table-cell" />
                <SortTh col="createdAt" label="Since" className="hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">Loading clients…</td>
                </tr>
              )}
              {!isLoading && data?.clients.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">No clients found.</td>
                </tr>
              )}
              {data?.clients.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  {/* First name with hover card */}
                  <td className="p-3">
                    <ClientHoverCard clientId={c.id} client={{ fullName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), email: c.email, phone: c.phone }}>
                      <Link href={`/clients/${c.id}`}>
                        <span className="inline-flex items-center gap-2 cursor-pointer group">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium group-hover:text-primary group-hover:underline transition-colors">
                            {c.firstName}
                          </span>
                        </span>
                      </Link>
                    </ClientHoverCard>
                  </td>
                  {/* Last name with hover card */}
                  <td className="p-3">
                    <ClientHoverCard clientId={c.id} client={{ fullName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), email: c.email, phone: c.phone }}>
                      <Link href={`/clients/${c.id}`}>
                        <span className="font-medium hover:text-primary hover:underline transition-colors cursor-pointer">
                          {c.lastName}
                        </span>
                      </Link>
                    </ClientHoverCard>
                  </td>
                  {/* Contact */}
                  <td className="p-3 hidden md:table-cell">
                    <div className="space-y-0.5">
                      {c.phone && (
                        <p className="flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3" />{c.phone}
                        </p>
                      )}
                      {c.email && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />{c.email}
                        </p>
                      )}
                    </div>
                  </td>
                  {/* Status */}
                  <td className="p-3 hidden lg:table-cell">
                    <Badge className={`text-xs ${STATUS_COLOURS[c.status]}`}>{c.status}</Badge>
                  </td>
                  {/* Since */}
                  <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("en-AU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between flex-shrink-0 text-sm text-muted-foreground">
          <span>
            {total === 0
              ? "0 results"
              : `Showing ${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Rows per page:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => { setPageSize(Number(v) as PageSizeOption); setPage(1); }}
              >
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Add Client Dialog — 2-step */}
      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) { setAddStep(1); setNewClientId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {addStep === 1 ? (
                <><User className="h-4 w-4 text-primary" /> Add New Client <span className="text-xs text-muted-foreground font-normal ml-1">Step 1 of 2</span></>
              ) : (
                <><Dog className="h-4 w-4 text-primary" /> Add Pet Details <span className="text-xs text-muted-foreground font-normal ml-1">Step 2 of 2</span></>
              )}
            </DialogTitle>
          </DialogHeader>

          {addStep === 1 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>First Name *</Label><Input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Last Name *</Label><Input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Referral Source</Label><Input placeholder="e.g. Instagram, Word of mouth" value={form.referralSource} onChange={e => setForm(p => ({ ...p, referralSource: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate({ tenantId: 1, ...form })}
                  disabled={createMutation.isPending || !form.firstName || !form.lastName}
                >
                  {createMutation.isPending ? "Saving…" : "Next: Add Pet →"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Add the first pet for <strong>{form.firstName} {form.lastName}</strong>. You can add more pets from their client profile later.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Pet Name *</Label><Input placeholder="e.g. Buddy" value={petForm.name} onChange={e => setPetForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Species</Label>
                  <Select value={petForm.species} onValueChange={v => setPetForm(p => ({ ...p, species: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dog">Dog</SelectItem>
                      <SelectItem value="cat">Cat</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Breed</Label><Input placeholder="e.g. Cavoodle" value={petForm.breed} onChange={e => setPetForm(p => ({ ...p, breed: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={petForm.gender} onValueChange={v => setPetForm(p => ({ ...p, gender: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Weight (kg)</Label><Input type="number" step="0.1" placeholder="e.g. 8.5" value={petForm.weightKg} onChange={e => setPetForm(p => ({ ...p, weightKg: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Coat Type</Label><Input placeholder="e.g. Curly, Straight" value={petForm.coatType} onChange={e => setPetForm(p => ({ ...p, coatType: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Colour</Label><Input placeholder="e.g. Apricot, Black" value={petForm.colour} onChange={e => setPetForm(p => ({ ...p, colour: e.target.value }))} /></div>
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={petForm.desexed} onChange={e => setPetForm(p => ({ ...p, desexed: e.target.checked }))} className="rounded" />
                    <span className="text-sm">Desexed</span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Behaviour Notes</Label><Input placeholder="e.g. Anxious, needs extra time" value={petForm.behaviourNotes} onChange={e => setPetForm(p => ({ ...p, behaviourNotes: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Grooming Notes</Label><Input placeholder="e.g. #7f blade, teddy bear face" value={petForm.groomingNotes} onChange={e => setPetForm(p => ({ ...p, groomingNotes: e.target.value }))} /></div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setAddStep(1)}>← Back</Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    toast.success("Client added (no pet)");
                    setShowAdd(false); setAddStep(1); setNewClientId(null);
                    refetch();
                    setForm({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", referralSource: "" });
                  }}
                >
                  Skip pet for now
                </Button>
                <Button
                  onClick={() => {
                    if (!petForm.name.trim()) { toast.error("Pet name is required"); return; }
                    createPetMutation.mutate({
                      tenantId: 1,
                      clientId: newClientId!,
                      name: petForm.name.trim(),
                      breed: petForm.breed || undefined,
                      gender: petForm.gender as "male" | "female" | "unknown",
                      weightKg: petForm.weightKg || undefined,
                      coatType: petForm.coatType || undefined,
                      colour: petForm.colour || undefined,
                      desexed: petForm.desexed,
                      behaviourNotes: petForm.behaviourNotes || undefined,
                      groomingNotes: petForm.groomingNotes || undefined,
                    });
                  }}
                  disabled={createPetMutation.isPending}
                >
                  {createPetMutation.isPending ? "Saving…" : "Save Client & Pet"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
