import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { isActiveStaffValue } from "@/lib/staffStatus";
import { formatAustralianAuditTimestamp } from "@shared/auditTimestamp";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  Phone, Mail, MapPin, User, UserCog, Plus, Pencil, X,
  CalendarDays, TrendingUp, AlertCircle, AlertTriangle, ShieldCheck, Smartphone, Send, CheckCircle2, Ban, Globe2, Download, ArrowLeft, ArrowUpRight
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", groomer: "Groomer", bather: "Bather",
  receptionist: "Receptionist", manager: "Manager",
};
const ROLE_COLOURS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 border-purple-200",
  groomer: "bg-teal-100 text-teal-800 border-teal-200",
  bather: "bg-blue-100 text-blue-800 border-blue-200",
  receptionist: "bg-amber-100 text-amber-800 border-amber-200",
  manager: "bg-rose-100 text-rose-800 border-rose-200",
};
const PORTAL_STATUS_META: Record<string, { label: string; className: string }> = {
  not_invited: { label: "Uninvited", className: "bg-slate-100 text-slate-700 border-slate-200" },
  invited: { label: "Invited", className: "bg-sky-50 text-sky-700 border-sky-200" },
  awaiting_approval: { label: "Awaiting approval", className: "bg-amber-50 text-amber-800 border-amber-200" },
  approved: { label: "Mobile access", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  revoked: { label: "Access revoked", className: "bg-rose-50 text-rose-700 border-rose-200" },
};
const portalStatusMeta = (status?: string) => PORTAL_STATUS_META[status ?? "not_invited"] ?? PORTAL_STATUS_META.not_invited;

function formatTimingMinutes(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return "—";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function makeTimingRange(days: number, endDateInput?: string) {
  const end = endDateInput ? new Date(`${endDateInput}T12:00:00`) : new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

function formatTrendDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function csvCell(value: string | number | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

const ACTIVITY_EVENT_LABELS: Record<string, string> = {
  invited: "Invitation prepared",
  accepted: "Account setup completed",
  approved: "Access approved",
  revoked: "Access revoked",
  workflow_updated: "Workflow updated",
  bath_priority_updated: "Bath priority updated",
  grooming_card_uploaded: "Grooming card uploaded",
};

function australianDateKey(timestamp: number | string | Date | null | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function OnlineBookingControls() {
  const utils = trpc.useUtils();
  const { data } = trpc.onlineBooking.getSettings.useQuery({ tenantId: 1 });
  const [form, setForm] = useState({ enabled: false, bathLimit: "3", bathCapacity: "3", slotMinutes: "30", leadHours: "24" });
  useEffect(() => {
    if (data) setForm({ enabled: data.onlineBookingEnabled, bathLimit: String(data.onlineBathOnlyDailyLimit), bathCapacity: String(data.onlineBathCapacityPerSlot), slotMinutes: String(data.onlineBookingSlotMinutes), leadHours: String(data.onlineBookingLeadHours) });
  }, [data]);
  const save = trpc.onlineBooking.updateSettings.useMutation({
    onSuccess: () => { toast.success("Online booking controls saved"); utils.onlineBooking.getSettings.invalidate({ tenantId: 1 }); },
    onError: e => toast.error(e.message),
  });
  return <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50/40 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="rounded-xl bg-teal-600 text-white p-2"><Globe2 className="h-5 w-5" /></div><div><h2 className="font-bold">Online booking controls</h2><p className="text-sm text-muted-foreground mt-0.5">Keep public booking disabled while Groomigo remains in prototype. Internal bookings are unaffected by these limits.</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${form.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{form.enabled ? "Live" : "Prototype off"}</span></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
      <label className="flex items-center gap-2 rounded-lg border bg-white/80 px-3 py-2 text-sm font-medium cursor-pointer"><input type="checkbox" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} className="h-4 w-4 accent-teal-600" /> Enable public booking</label>
      <div><Label>Bath-only online cap/day</Label><Input className="mt-1 bg-white" type="number" min="0" max="30" value={form.bathLimit} onChange={e => setForm(p => ({ ...p, bathLimit: e.target.value }))} /></div>
      <div><Label>Bath stations per slot</Label><Input className="mt-1 bg-white" type="number" min="1" max="20" value={form.bathCapacity} onChange={e => setForm(p => ({ ...p, bathCapacity: e.target.value }))} /></div>
      <div><Label>Slot interval (minutes)</Label><Input className="mt-1 bg-white" type="number" min="15" step="15" value={form.slotMinutes} onChange={e => setForm(p => ({ ...p, slotMinutes: e.target.value }))} /></div>
      <div><Label>Minimum notice (hours)</Label><Input className="mt-1 bg-white" type="number" min="0" value={form.leadHours} onChange={e => setForm(p => ({ ...p, leadHours: e.target.value }))} /></div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Set each groomer’s profile, services and capacity in their Staff profile before switching public booking on.</p><Button size="sm" onClick={() => save.mutate({ tenantId: 1, onlineBookingEnabled: form.enabled, onlineBathOnlyDailyLimit: Math.max(0, Number(form.bathLimit) || 0), onlineBathCapacityPerSlot: Math.max(1, Number(form.bathCapacity) || 1), onlineBookingSlotMinutes: Math.max(15, Number(form.slotMinutes) || 30), onlineBookingLeadHours: Math.max(0, Number(form.leadHours) || 0) })} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save controls"}</Button></div>
  </section>;
}

function StaffProfilePanel({ staffId, onClose, initialTimingRange }: { staffId: number; onClose: () => void; initialTimingRange?: { start: string; end: string } }) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [timingRange, setTimingRange] = useState(() => initialTimingRange ?? makeTimingRange(7));
  const { data, isLoading } = trpc.staff.getProfile.useQuery({ staffId, tenantId: 1, dateFrom: timingRange.start, dateTo: timingRange.end });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalEmail, setPortalEmail] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [activityScope, setActivityScope] = useState<"selected_dates" | "all_time">("selected_dates");
  const [activitySort, setActivitySort] = useState<"newest" | "oldest">("newest");
  const { data: invitations = [] } = trpc.staff.listPortalInvitations.useQuery({ tenantId: 1 });
  const { data: accessHistory = [] } = trpc.staff.getAccessHistory.useQuery({ staffId });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => {
      toast.success("Staff member updated");
      utils.staff.list.invalidate();
      utils.staff.getProfile.invalidate({ staffId });
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const invitePortalMutation = trpc.staff.invitePortalAccount.useMutation({
    onSuccess: (result) => {
      toast.success(result.emailSent ? `Invitation emailed to ${result.email}` : `Invitation prepared for ${result.email}. Email delivery needs attention.`);
      utils.staff.list.invalidate();
      utils.staff.getProfile.invalidate({ staffId });
      utils.staff.listPortalInvitations.invalidate({ tenantId: 1 });
      setPortalOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const approvePortalMutation = trpc.staff.approveInvitation.useMutation({
    onSuccess: () => { toast.success("Staff access approved"); utils.staff.getProfile.invalidate({ staffId }); utils.staff.listPortalInvitations.invalidate({ tenantId: 1 }); },
    onError: (e) => toast.error(e.message),
  });
  const revokePortalMutation = trpc.staff.revokePortalAccess.useMutation({
    onSuccess: () => { toast.success("Staff portal access revoked"); utils.staff.getProfile.invalidate({ staffId }); utils.staff.listPortalInvitations.invalidate({ tenantId: 1 }); },
    onError: (e) => toast.error(e.message),
  });
  const restorePortalMutation = trpc.staff.restorePortalAccess.useMutation({
    onSuccess: () => { toast.success("Staff portal access restored"); utils.staff.getProfile.invalidate({ staffId }); utils.staff.listPortalInvitations.invalidate({ tenantId: 1 }); },
    onError: (e) => toast.error(e.message),
  });

  const exportTimingCsv = () => {
    const timing = (data as any)?.timingAnalytics;
    if (!data || !timing) return;
    const metrics = [
      ["Bath", timing.bath],
      ["Dry", timing.dry],
      ["Groom", timing.groom],
      ["Total", timing.total],
    ] as const;
    const rows: Array<Array<string | number | null | undefined>> = [
      ["Groomigo staff timing analytics"],
      ["Team member", data.name],
      ["Period start", timing.range.startDate],
      ["Period end", timing.range.endDate],
      ["Days included", timing.range.days],
      [],
      ["Metric", "Average minutes", "Completed records"],
      ...metrics.map(([label, metric]) => [label, metric.averageMinutes, metric.completedCount]),
      [],
      ["Date", "Bath avg minutes", "Bath completed", "Dry avg minutes", "Dry completed", "Groom avg minutes", "Groom completed", "Total avg minutes", "Total completed"],
      ...timing.dailyTrend.map((day: any) => [day.date, day.bathAverageMinutes, day.bathCompletedCount, day.dryAverageMinutes, day.dryCompletedCount, day.groomAverageMinutes, day.groomCompletedCount, day.totalAverageMinutes, day.totalCompletedCount]),
    ];
    const blob = new Blob([rows.map(row => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `groomigo-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-timing-${timing.range.startDate}-to-${timing.range.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const eventTimestamp = (event: any) => event.occurredAtMs ?? new Date(event.createdAt).getTime();
  const reviewFindings = (data as any)?.timingAnalytics?.reviewFindings ?? [];
  const reviewFindingsForActivity = (event: any) => {
    if (event.eventType !== "workflow_updated" || !event.appointmentId) return [];
    return reviewFindings.filter((finding: any) => {
      if (finding.appointmentId !== event.appointmentId) return false;
      if (finding.stage === "Total") return event.workflowToState === "complete";
      const activeState = finding.stage === "Bath" ? "bathing" : finding.stage === "Dry" ? "drying" : finding.stage === "Groom" ? "grooming" : null;
      return activeState !== null && event.workflowFromState === activeState && event.workflowToState !== activeState;
    });
  };
  const filteredActivity = accessHistory
    .filter((event: any) => {
      const searchText = `${ACTIVITY_EVENT_LABELS[event.eventType] ?? event.eventType} ${event.note ?? ""} ${event.actorName ?? ""} ${event.actorEmail ?? ""} ${event.appointmentId ?? ""}`.toLowerCase();
      if (activitySearch.trim() && !searchText.includes(activitySearch.trim().toLowerCase())) return false;
      if (activityType !== "all" && event.eventType !== activityType) return false;
      if (activityScope === "selected_dates") {
        const eventDate = australianDateKey(eventTimestamp(event));
        if (eventDate < timingRange.start || eventDate > timingRange.end) return false;
      }
      return true;
    })
    .sort((left: any, right: any) => activitySort === "newest" ? Number(eventTimestamp(right)) - Number(eventTimestamp(left)) : Number(eventTimestamp(left)) - Number(eventTimestamp(right)));

  const exportActivityCsv = () => {
    const rows: Array<Array<string | number | null | undefined>> = [
      ["Groomigo staff activity audit"],
      ["Team member", data?.name],
      ["Activity scope", activityScope === "selected_dates" ? `${timingRange.start} to ${timingRange.end}` : "All recorded activity"],
      ["Action filter", activityType === "all" ? "All actions" : ACTIVITY_EVENT_LABELS[activityType] ?? activityType],
      ["Search", activitySearch || "None"],
      ["Sort", activitySort === "newest" ? "Newest first" : "Oldest first"],
      [],
      ["Exact Brisbane timestamp", "Raw audit timestamp (UTC)", "Action", "Details", "Recorded by", "Appointment ID", "From workflow state", "To workflow state", "Review trigger"],
      ...filteredActivity.map((event: any) => {
        const timestamp = eventTimestamp(event);
        const triggers = reviewFindingsForActivity(event).map((finding: any) => `${finding.stage}: ${formatTimingMinutes(finding.durationMinutes)} recorded, ${formatTimingMinutes(finding.durationMinutes - finding.thresholdMinutes)} above guide`).join(" | ");
        return [formatAustralianAuditTimestamp(timestamp), new Date(timestamp).toISOString(), ACTIVITY_EVENT_LABELS[event.eventType] ?? event.eventType, event.note, event.actorName || event.actorEmail || "", event.appointmentId, event.workflowFromState, event.workflowToState, triggers || "No timing review trigger"];
      }),
    ];
    const blob = new Blob([rows.map(row => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const staffNameForFile = (data?.name ?? `staff-${staffId}`).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    anchor.download = `groomigo-${staffNameForFile}-activity-audit.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const startEdit = () => {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      address: (data as any).address ?? "",
      notes: (data as any).notes ?? "",
      dateOfBirth: (data as any).dateOfBirth ?? "",
      emergencyContact: (data as any).emergencyContact ?? "",
      emergencyPhone: (data as any).emergencyPhone ?? "",
      role: data.role ?? "groomer",
      colourHex: data.colourHex ?? "#6366f1",
      xeroEmployeeId: data.xeroEmployeeId ?? "",
      onlineBookable: String((data as any).onlineBookable ?? false),
      onlineProfilePhotoUrl: (data as any).onlineProfilePhotoUrl ?? "",
      onlineBio: (data as any).onlineBio ?? "",
      onlineServices: (() => { try { return ((data as any).onlineServices ? JSON.parse((data as any).onlineServices) : []).join(", "); } catch { return ""; } })(),
      onlineMaxDogsPerSlot: String((data as any).onlineMaxDogsPerSlot ?? 1),
      onlineMaxDogsPerDay: String((data as any).onlineMaxDogsPerDay ?? 0),
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      staffId,
      name: form.name || undefined,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      notes: form.notes || null,
      dateOfBirth: form.dateOfBirth || null,
      emergencyContact: form.emergencyContact || null,
      emergencyPhone: form.emergencyPhone || null,
      role: (form.role as any) || undefined,
      colourHex: form.colourHex || undefined,
      xeroEmployeeId: form.xeroEmployeeId || null,
      onlineBookable: form.onlineBookable === "true",
      onlineProfilePhotoUrl: form.onlineProfilePhotoUrl || null,
      onlineBio: form.onlineBio || null,
      onlineServices: JSON.stringify(form.onlineServices.split(",").map(s => s.trim()).filter(Boolean)),
      onlineMaxDogsPerSlot: Math.max(1, Number(form.onlineMaxDogsPerSlot) || 1),
      onlineMaxDogsPerDay: Math.max(0, Number(form.onlineMaxDogsPerDay) || 0),
    });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );
  if (!data) return <div className="text-center py-10 text-muted-foreground">Staff member not found.</div>;

  const initials = data.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const latestInvitation = invitations.filter(invitation => invitation.staffId === staffId)[0];
  const portalStatus = (data as any).portalStatus ?? "not_invited";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ background: data.colourHex }}>
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold">{data.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLOURS[data.role] ?? ROLE_COLOURS.groomer}`}>
                {ROLE_LABELS[data.role] ?? data.role}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${data.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {data.isActive ? "Active" : "Inactive"}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${portalStatusMeta((data as any).portalStatus).className}`}>
                {portalStatusMeta((data as any).portalStatus).label}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total appts", value: (data as any).stats?.total ?? 0 },
          { label: "Last 30 days", value: (data as any).stats?.last30 ?? 0 },
          { label: "Last 7 days", value: (data as any).stats?.last7 ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-indigo-950"><TrendingUp className="h-4 w-4 text-indigo-600" /> Timing performance</h3>
            <p className="mt-0.5 text-xs text-indigo-800">Completed workflow stages for the selected dates. Waiting time between stages is excluded from stage averages.</p>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50" onClick={exportTimingCsv} disabled={!(data as any)?.timingAnalytics} title="Download the selected timing analytics as a CSV file"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-indigo-100 bg-white/70 p-2.5">
          <div><Label htmlFor={`timing-start-${staffId}`} className="text-[11px] text-slate-600">From</Label><Input id={`timing-start-${staffId}`} type="date" className="mt-1 h-8 w-[142px] bg-white text-xs" value={timingRange.start} max={timingRange.end} onChange={event => setTimingRange(range => ({ ...range, start: event.target.value }))} /></div>
          <div><Label htmlFor={`timing-end-${staffId}`} className="text-[11px] text-slate-600">To</Label><Input id={`timing-end-${staffId}`} type="date" className="mt-1 h-8 w-[142px] bg-white text-xs" value={timingRange.end} min={timingRange.start} max={dateInputValue(new Date())} onChange={event => setTimingRange(range => ({ ...range, end: event.target.value }))} /></div>
          <div className="flex flex-wrap gap-1 pb-0.5"><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-indigo-800 hover:bg-indigo-100" onClick={() => setTimingRange(makeTimingRange(7))}>Last 7 days</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-indigo-800 hover:bg-indigo-100" onClick={() => setTimingRange(makeTimingRange(28))}>Last 4 weeks</Button></div>
          <p className="ml-auto pb-1 text-[11px] text-slate-500">{(data as any).timingAnalytics?.range?.days ?? 0} days selected</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Bath", metric: (data as any).timingAnalytics?.bath, colour: "text-blue-700" },
            { label: "Dry", metric: (data as any).timingAnalytics?.dry, colour: "text-violet-700" },
            { label: "Groom", metric: (data as any).timingAnalytics?.groom, colour: "text-amber-700" },
            { label: "Total", metric: (data as any).timingAnalytics?.total, colour: "text-indigo-700" },
          ].map(item => <div key={item.label} className="rounded-lg border border-white bg-white/85 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label} average</p>
            <p className={`mt-1 font-mono text-lg font-bold ${item.colour}`}>{formatTimingMinutes(item.metric?.averageMinutes)}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{item.metric?.completedCount ?? 0} completed record{item.metric?.completedCount === 1 ? "" : "s"}</p>
          </div>)}
        </div>
        <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="mb-2 flex items-baseline justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">Daily average timing trend</p><p className="text-[11px] text-slate-500">Average completed minutes by workflow stage. Days without recorded completed work are omitted.</p></div><span className="text-[11px] text-slate-500">Minutes</span></div>
          {(data as any).timingAnalytics?.dailyTrend?.length ? <div className="h-[260px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={(data as any).timingAnalytics.dailyTrend} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={formatTrendDate} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip labelFormatter={(label) => formatTrendDate(String(label))} formatter={value => value === null || value === undefined ? "—" : `${String(value)} min`} contentStyle={{ borderRadius: 8, borderColor: "#c7d2fe", fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="bathAverageMinutes" name="Bath avg" fill="#3b82f6" radius={[3, 3, 0, 0]} /><Bar dataKey="dryAverageMinutes" name="Dry avg" fill="#8b5cf6" radius={[3, 3, 0, 0]} /><Bar dataKey="groomAverageMinutes" name="Groom avg" fill="#f59e0b" radius={[3, 3, 0, 0]} /><Bar dataKey="totalAverageMinutes" name="Total avg" fill="#4f46e5" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="py-8 text-center"><p className="text-sm font-medium text-slate-700">No completed workflow timings were recorded in this period.</p><p className="mt-1 text-xs text-slate-500">Choose Last 7 days or Last 4 weeks to include prior completed appointments. A booking contributes only after staff record its stage timings and mark it complete.</p></div>}
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-start justify-between gap-3"><div><h4 className="flex items-center gap-1.5 text-sm font-bold text-amber-950"><AlertTriangle className="h-4 w-4 text-amber-700" /> Timing exceptions requiring review</h4><p className="mt-0.5 text-[11px] text-amber-900">Each exception exceeds Groomigo’s active-stage review guide. Use the recommendation, then open the booking to check the workflow record and decide whether follow-up, a duration change or a pricing review is needed.</p></div><span className="shrink-0 rounded-full border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-900">{(data as any).timingAnalytics?.reviewFindings?.length ?? 0} issue{(data as any).timingAnalytics?.reviewFindings?.length === 1 ? "" : "s"}</span></div>
          {(data as any).timingAnalytics?.reviewFindings?.length ? <div className="mt-3 space-y-2">{(data as any).timingAnalytics.reviewFindings.map((finding: any) => <div key={`${finding.appointmentId}-${finding.stage}`} className="rounded-lg border border-amber-200 bg-white p-3"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="font-semibold text-slate-900">{finding.petName} <span className="font-normal text-slate-500">· {finding.clientName}</span></p><p className="mt-0.5 text-xs text-slate-600"><span className="font-semibold text-amber-800">{finding.stage}: {formatTimingMinutes(finding.durationMinutes)}</span> recorded, {formatTimingMinutes(finding.durationMinutes - finding.thresholdMinutes)} above the {formatTimingMinutes(finding.thresholdMinutes)} review guide.</p><p className="mt-1 text-xs text-slate-700"><span className="font-semibold">Recommended action:</span> {finding.recommendation}</p></div><Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => navigate(`/workflow?date=${finding.date}&reviewAppointment=${finding.appointmentId}`)} title={`Open ${finding.petName}'s booking in Workflow`}><ArrowUpRight className="h-3.5 w-3.5" /> Review booking</Button></div></div>)}</div> : <p className="mt-3 rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-4 text-center text-sm text-amber-900">No recorded timing exceptions require action in the selected dates.</p>}
        </div>
      </section>

      <Separator />

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Full Name</Label><Input className="mt-1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input className="mt-1" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+61 4xx xxx xxx" /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Address</Label><Input className="mt-1" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Street, Suburb, State, Postcode" /></div>
            <div><Label>Date of Birth</Label><Input className="mt-1" type="date" value={form.dateOfBirth} onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} /></div>
            <div><Label>Salon role</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Sets the staff member’s salon role and calendar grouping. Approved mobile users retain Operations access: appointments and workflow only, with no analytics or administrator areas.</p>
            </div>
            <div><Label>Emergency Contact</Label><Input className="mt-1" value={form.emergencyContact} onChange={e => setForm(p => ({ ...p, emergencyContact: e.target.value }))} /></div>
            <div><Label>Emergency Phone</Label><Input className="mt-1" value={form.emergencyPhone} onChange={e => setForm(p => ({ ...p, emergencyPhone: e.target.value }))} /></div>
            <div><Label>Xero Employee ID</Label><Input className="mt-1" value={form.xeroEmployeeId} onChange={e => setForm(p => ({ ...p, xeroEmployeeId: e.target.value }))} /></div>
            <div><Label>Colour</Label><div className="flex items-center gap-2 mt-1"><input type="color" value={form.colourHex} onChange={e => setForm(p => ({ ...p, colourHex: e.target.value }))} className="h-9 w-16 rounded border cursor-pointer" /></div></div>
            <div className="col-span-2 mt-2 border-t pt-3"><p className="text-sm font-semibold text-teal-800">Online booking profile</p><p className="text-xs text-muted-foreground mt-0.5">Keep this disabled until this groomer is approved for customer-selected online bookings.</p></div>
            <label className="col-span-2 flex items-center gap-2 rounded-lg border bg-teal-50/50 px-3 py-2 text-sm cursor-pointer"><input type="checkbox" checked={form.onlineBookable === "true"} onChange={e => setForm(p => ({ ...p, onlineBookable: String(e.target.checked) }))} className="h-4 w-4 accent-teal-600" /><span className="font-medium">Available for online booking</span></label>
            <div className="col-span-2"><Label>Customer-facing bio</Label><textarea className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-ring" value={form.onlineBio} onChange={e => setForm(p => ({ ...p, onlineBio: e.target.value }))} placeholder="A short introduction that customers can read when choosing a groomer." /></div>
            <div className="col-span-2"><Label>Profile photo URL</Label><Input className="mt-1" value={form.onlineProfilePhotoUrl} onChange={e => setForm(p => ({ ...p, onlineProfilePhotoUrl: e.target.value }))} placeholder="Optional photo URL" /></div>
            <div className="col-span-2"><Label>Online services</Label><Input className="mt-1" value={form.onlineServices} onChange={e => setForm(p => ({ ...p, onlineServices: e.target.value }))} placeholder="classic_groom, styled_groom, bath_only" /><p className="mt-1 text-xs text-muted-foreground">Leave blank to allow every service. Use service names separated by commas.</p></div>
            <div><Label>Dogs per time slot</Label><Input className="mt-1" type="number" min="1" max="10" value={form.onlineMaxDogsPerSlot} onChange={e => setForm(p => ({ ...p, onlineMaxDogsPerSlot: e.target.value }))} /></div>
            <div><Label>Online dogs per day</Label><Input className="mt-1" type="number" min="0" max="50" value={form.onlineMaxDogsPerDay} onChange={e => setForm(p => ({ ...p, onlineMaxDogsPerDay: e.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">0 = no daily cap</p></div>
            <div className="col-span-2"><Label>Notes</Label><textarea className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Internal notes..." /></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending} className="flex-1">{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.phone && <div className="flex items-start gap-3"><Phone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Phone</p><p className="text-sm font-medium">{data.phone}</p></div></div>}
            {data.email && <div className="flex items-start gap-3"><Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Email</p><p className="text-sm font-medium break-all">{data.email}</p></div></div>}
            {(data as any).address && <div className="flex items-start gap-3 sm:col-span-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Address</p><p className="text-sm font-medium">{(data as any).address}</p></div></div>}
            {(data as any).dateOfBirth && <div className="flex items-start gap-3"><User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Date of Birth</p><p className="text-sm font-medium">{new Date((data as any).dateOfBirth).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p></div></div>}
            {(data as any).emergencyContact && <div className="flex items-start gap-3"><AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Emergency Contact</p><p className="text-sm font-medium">{(data as any).emergencyContact}</p>{(data as any).emergencyPhone && <p className="text-sm text-muted-foreground">{(data as any).emergencyPhone}</p>}</div></div>}
            {data.xeroEmployeeId && <div className="flex items-start gap-3"><ShieldCheck className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Xero Employee ID</p><p className="text-sm font-medium font-mono">{data.xeroEmployeeId}</p></div></div>}
          </div>
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Smartphone className="h-4 w-4 text-teal-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-teal-950">Groomigo mobile access</p>
                <p className="text-xs text-teal-800">{portalStatus === "approved" ? "Approved: this staff member can view assigned appointments and update workflow stages." : portalStatus === "awaiting_approval" ? "Account setup is complete and waiting for administrator approval." : portalStatus === "invited" ? "Invitation sent; waiting for the staff member to set up their account." : portalStatus === "revoked" ? "Portal access is currently revoked." : "Send a secure invitation for phone or iPad access."}</p>
              </div>
            </div>
            {portalStatus === "approved" ? <Button size="sm" variant="outline" className="gap-1.5 border-rose-200 bg-white text-rose-700 flex-shrink-0" disabled={revokePortalMutation.isPending} onClick={() => revokePortalMutation.mutate({ staffId })}><Ban className="h-3.5 w-3.5" /> Revoke</Button> : portalStatus === "revoked" && data.userId ? <Button size="sm" className="gap-1.5 flex-shrink-0" disabled={restorePortalMutation.isPending} onClick={() => restorePortalMutation.mutate({ staffId })}><CheckCircle2 className="h-3.5 w-3.5" /> Restore</Button> : portalStatus === "awaiting_approval" && latestInvitation ? <Button size="sm" className="gap-1.5 flex-shrink-0" disabled={approvePortalMutation.isPending} onClick={() => approvePortalMutation.mutate({ invitationId: latestInvitation.id })}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button> : <Button size="sm" variant="outline" className="gap-1.5 border-teal-200 bg-white flex-shrink-0" onClick={() => { setPortalEmail(data.email ?? ""); setPortalOpen(true); }}><Send className="h-3.5 w-3.5" /> Invite</Button>}
          </div>
          {portalOpen && (
            <div className="rounded-xl border p-4 space-y-3 bg-card">
              <div className="flex items-center justify-between"><p className="font-semibold text-sm">Invite staff to Groomigo</p><button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setPortalOpen(false)}>Cancel</button></div>
              <div><Label>Staff email</Label><Input className="mt-1" type="email" value={portalEmail} onChange={e => setPortalEmail(e.target.value)} placeholder="staff@example.com" /></div>
              <p className="text-xs text-muted-foreground">Groomigo emails a secure seven-day acceptance link. The staff member creates their own password, then an administrator must approve access before they can sign in.</p>
              <Button className="w-full" disabled={invitePortalMutation.isPending || !portalEmail} onClick={() => invitePortalMutation.mutate({ staffId, email: portalEmail })}>{invitePortalMutation.isPending ? "Sending…" : "Send secure invitation"}</Button>
            </div>
          )}
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Staff access activity</p><p className="mt-0.5 text-[11px] text-slate-500">Exact timestamped audit trail. Amber entries correspond to an active timing review in the selected dates.</p></div><Button type="button" size="sm" variant="outline" className="h-8 gap-1 border-slate-300 bg-white text-slate-700 hover:bg-slate-100" onClick={exportActivityCsv} disabled={filteredActivity.length === 0} title="Download the visible staff activity audit as CSV"><Download className="h-3.5 w-3.5" /> Export CSV</Button></div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label htmlFor={`activity-search-${staffId}`} className="text-[11px] text-slate-600">Search actions</Label><Input id={`activity-search-${staffId}`} className="mt-1 h-8 bg-white text-xs" value={activitySearch} onChange={event => setActivitySearch(event.target.value)} placeholder="Action, appointment or user" /></div>
              <div><Label className="text-[11px] text-slate-600">Action type</Label><Select value={activityType} onValueChange={setActivityType}><SelectTrigger className="mt-1 h-8 bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem>{Object.entries(ACTIVITY_EVENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-[11px] text-slate-600">Timeframe</Label><Select value={activityScope} onValueChange={(value: "selected_dates" | "all_time") => setActivityScope(value)}><SelectTrigger className="mt-1 h-8 bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selected_dates">Selected dates above</SelectItem><SelectItem value="all_time">All recorded activity</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[11px] text-slate-600">Sort</Label><Select value={activitySort} onValueChange={(value: "newest" | "oldest") => setActivitySort(value)}><SelectTrigger className="mt-1 h-8 bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem></SelectContent></Select></div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[11px] text-slate-500">Showing {filteredActivity.length} of {accessHistory.length} recorded event{accessHistory.length === 1 ? "" : "s"}.</p>{activityScope === "selected_dates" && <p className="text-[11px] text-slate-500">Using {timingRange.start} to {timingRange.end}</p>}</div>
            {filteredActivity.length > 0 ? <div className="mt-2 space-y-2">
              {filteredActivity.map((event: any) => {
                const timestamp = eventTimestamp(event);
                const triggerFindings = reviewFindingsForActivity(event);
                const reviewTriggered = triggerFindings.length > 0;
                return <div key={event.id} className={`rounded-lg border p-3 text-xs ${reviewTriggered ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white/80"}`}>
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-1.5"><p className="font-semibold text-slate-800">{ACTIVITY_EVENT_LABELS[event.eventType] ?? event.eventType.replaceAll("_", " ")}</p>{reviewTriggered && <span className="rounded-full border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-900">Timing review trigger</span>}</div>{event.note && <p className="mt-0.5 text-slate-600">{event.note}</p>}{(event.actorName || event.actorEmail) && <p className="mt-0.5 text-[11px] text-slate-400">Recorded by {event.actorName || event.actorEmail}</p>}</div><time className="shrink-0 text-right text-slate-500" dateTime={new Date(timestamp).toISOString()} title={`Audit timestamp: ${new Date(timestamp).toISOString()}`}>{formatAustralianAuditTimestamp(timestamp)}</time></div>
                  {reviewTriggered && <div className="mt-2 border-t border-amber-200 pt-2"><p className="text-[11px] font-semibold text-amber-950">Triggered review details</p>{triggerFindings.map((finding: any) => <p key={`${finding.appointmentId}-${finding.stage}`} className="mt-0.5 text-[11px] text-amber-900">{finding.stage}: {formatTimingMinutes(finding.durationMinutes)} recorded, {formatTimingMinutes(finding.durationMinutes - finding.thresholdMinutes)} above the {formatTimingMinutes(finding.thresholdMinutes)} guide.</p>)}{event.appointmentId && <Button type="button" size="sm" variant="outline" className="mt-2 h-7 gap-1 border-amber-300 bg-white px-2 text-[11px] text-amber-900 hover:bg-amber-100" onClick={() => navigate(`/workflow?date=${australianDateKey(timestamp)}&reviewAppointment=${event.appointmentId}`)}><ArrowUpRight className="h-3 w-3" /> Open booking</Button>}</div>}
                </div>;
              })}
            </div> : <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-5 text-center text-sm text-slate-500">No staff activity matches these filters.</p>}
          </section>
          {(data as any).notes && <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground"><p className="text-xs font-semibold uppercase tracking-wide mb-1">Notes</p>{(data as any).notes}</div>}
          {!data.phone && !data.email && !(data as any).address && <p className="text-sm text-muted-foreground text-center py-4">No contact details on file. Click Edit to add them.</p>}
        </div>
      )}
    </div>
  );
}

export function StaffReviewProfile() {
  const params = useParams<{ staffId: string }>();
  const [, navigate] = useLocation();
  const staffId = Number(params.staffId);
  const reviewDate = new URLSearchParams(window.location.search).get("date");
  const initialTimingRange = reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(reviewDate) ? makeTimingRange(7, reviewDate) : undefined;
  const isValidStaffId = Number.isInteger(staffId) && staffId > 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Workflow timing review</p>
            <h1 className="mt-1 text-2xl font-bold">Team member performance</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Review one team member’s recorded timing exceptions and recommended actions.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/staff")} className="shrink-0 gap-1.5"><ArrowLeft className="h-4 w-4" /> Back to staff</Button>
        </div>
        {isValidStaffId ? <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6"><StaffProfilePanel staffId={staffId} onClose={() => navigate("/staff")} initialTimingRange={initialTimingRange} /></div> : <div className="rounded-2xl border bg-card p-8 text-center"><p className="font-semibold">Team member not found</p><p className="mt-1 text-sm text-muted-foreground">Return to Staff and choose a valid team member.</p></div>}
      </div>
    </DashboardLayout>
  );
}

export default function Staff() {
  const utils = trpc.useUtils();
  const { data: staffList, isLoading } = trpc.staff.list.useQuery({ tenantId: 1 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "groomer", colourHex: "#6366f1" });

  const closeStaffProfile = () => {
    setSelectedId(null);
  };

  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => {
      toast.success("Staff member added");
      utils.staff.list.invalidate();
      setAddOpen(false);
      setForm({ name: "", email: "", phone: "", role: "groomer", colourHex: "#6366f1" });
    },
    onError: (e) => toast.error(e.message),
  });
  const quickInviteMutation = trpc.staff.invitePortalAccount.useMutation({
    onSuccess: (result) => {
      toast.success(result.emailSent ? `Invitation emailed to ${result.email}` : `Invitation prepared for ${result.email}. Email delivery needs attention.`);
      utils.staff.list.invalidate();
      utils.staff.listPortalInvitations.invalidate({ tenantId: 1 });
    },
    onError: (e) => toast.error(e.message),
  });

  // Old migrated records may omit isActive in an outdated cached response.
  // Only an explicit false/zero value means a staff member is inactive.
  const activeStaff = staffList?.filter(s => isActiveStaffValue(s.isActive)) ?? [];
  const inactiveStaff = staffList?.filter(s => !isActiveStaffValue(s.isActive)) ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="h-6 w-6 text-primary" /> Staff</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{activeStaff.length} active team members</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add Staff Member</Button>
        </div>

        <OnlineBookingControls />

        {isLoading && <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>}

        {activeStaff.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Active</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeStaff.map(s => {
                const portalStatus = (s as any).portalStatus ?? "not_invited";
                const status = portalStatusMeta(portalStatus);
                const canQuickInvite = portalStatus === "not_invited" && Boolean(s.email);
                return <div key={s.id} role="button" tabIndex={0} onClick={() => setSelectedId(s.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(s.id); } }}
                  className="text-left bg-card border rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 transition-transform group-hover:scale-105"
                      style={{ background: s.colourHex }}>
                      {s.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{s.name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ROLE_COLOURS[s.role] ?? ROLE_COLOURS.groomer}`}>{ROLE_LABELS[s.role] ?? s.role}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${status.className}`}>{status.label}</span>
                      </div>
                    </div>
                  </div>
                  {s.email && <p className="text-xs text-muted-foreground mt-2 truncate flex items-center gap-1"><Mail className="h-3 w-3 flex-shrink-0" />{s.email}</p>}
                  {s.phone && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Phone className="h-3 w-3 flex-shrink-0" />{s.phone}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-primary/60 font-medium group-hover:text-primary transition-colors">View profile →</p>
                    {portalStatus === "not_invited" && <Button size="sm" variant={canQuickInvite ? "outline" : "secondary"} className="h-8 gap-1.5" disabled={quickInviteMutation.isPending && canQuickInvite} onClick={(event) => { event.stopPropagation(); if (canQuickInvite) quickInviteMutation.mutate({ staffId: s.id, email: s.email! }); else setSelectedId(s.id); }}><Send className="h-3.5 w-3.5" />{canQuickInvite ? "Send invite" : "Add email"}</Button>}
                  </div>
                </div>;
              })}
            </div>
          </div>
        )}

        {inactiveStaff.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Inactive / Former</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveStaff.map(s => (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  className="text-left bg-card border rounded-2xl p-4 opacity-60 hover:opacity-90 hover:border-primary/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 grayscale" style={{ background: s.colourHex }}>
                      {s.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div><p className="font-medium text-sm truncate">{s.name}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[s.role] ?? s.role}</p></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <Dialog open={selectedId !== null} onOpenChange={open => { if (!open) closeStaffProfile(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&>[data-slot=dialog-close]]:hidden">
            {selectedId !== null && <StaffProfilePanel staffId={selectedId} onClose={closeStaffProfile} />}
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Full Name *</Label><Input className="mt-1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Sarah Jones" /></div>
              <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input className="mt-1" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Bathers and groomers have the same approved operational access to appointment details and Workflow. Administration, payments, memberships, analytics and settings remain restricted.</p>
              </div>
              <div><Label>Colour</Label><div className="flex items-center gap-2 mt-1"><input type="color" value={form.colourHex} onChange={e => setForm(p => ({ ...p, colourHex: e.target.value }))} className="h-9 w-16 rounded border cursor-pointer" /><span className="text-sm text-muted-foreground">{form.colourHex}</span></div></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                if (!form.name.trim()) { toast.error("Name is required"); return; }
                createMutation.mutate({ tenantId: 1, name: form.name, email: form.email || undefined, phone: form.phone || undefined, role: form.role as any, colourHex: form.colourHex });
              }} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Staff Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
