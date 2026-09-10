import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PetAvatar } from "@/components/PetAvatar";
import { shiftDateKey } from "@/lib/workflowDates";
import { formatLiveStageElapsed, getLiveStageElapsedSeconds } from "@/lib/workflowStageTimer";
import { workflowBoardRefreshOptions } from "@/lib/workflowBoardRefresh";
import { shouldShowWorkflowRow } from "@/lib/workflowTerminalStates";
import { resolveTimingReviewThreshold } from "@shared/workflowTimingReviewThresholds";
import { groupFamilyWorkflowRows } from "@shared/familyWorkflowGrouping";
import { BATH_PRIORITY_META, BATH_PRIORITY_VALUES, buildBathPriorityQueue, isBathPriorityMutable } from "@shared/bathPriorityQueue";
import { RefreshCw, Tv2, AlertTriangle, CheckCircle2, Clock, Dog, X, FileText, Filter, Save, Plus, UserPlus, ChevronLeft, ChevronRight, ExternalLink, Link2, Unlink, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function formatDuration(minutes: number | null) {
  if (minutes === null || minutes < 0 || !Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  { key: "scheduled",   label: "Waiting",    short: "WAIT",  colour: "#94a3b8" },
  { key: "checked_in",  label: "Checked In", short: "IN",    colour: "#06b6d4" },
  { key: "waiting_for_bath", label: "Wait for Bath", short: "WAIT BATH", colour: "#64748b" },
  { key: "bathing",     label: "Bath",       short: "BATH",  colour: "#3b82f6" },
  { key: "waiting_for_dry", label: "Wait for Dry", short: "WAIT DRY", colour: "#7c3aed" },
  { key: "drying",      label: "Drying",     short: "DRY",   colour: "#8b5cf6" },
  { key: "waiting_for_groom", label: "Wait for Groom", short: "WAIT GROOM", colour: "#b45309" },
  { key: "grooming",    label: "Groom",      short: "GROOM", colour: "#f59e0b" },
  { key: "ready",       label: "Ready",      short: "READY", colour: "#10b981" },
  { key: "complete",    label: "Out",        short: "OUT",   colour: "#64748b" },
] as const;
const TERMINAL_STAGES = [
  { key: "cancelled", label: "Cancelled", short: "CANCEL", colour: "#dc2626" },
  { key: "no_show", label: "No show", short: "NO SHOW", colour: "#ea580c" },
] as const;
const ALL_STAGE_OPTIONS = [...STAGES, ...TERMINAL_STAGES] as const;
type StageKey = typeof ALL_STAGE_OPTIONS[number]["key"];

const NEXT_STAGE: Record<StageKey, StageKey | null> = {
  scheduled: "checked_in",
  checked_in: "waiting_for_bath",
  waiting_for_bath: "bathing",
  bathing: "waiting_for_dry",
  waiting_for_dry: "drying",
  drying: "waiting_for_groom",
  waiting_for_groom: "grooming",
  grooming: "ready",
  ready: "complete",
  complete: null,
  cancelled: null,
  no_show: null,
};

const PREV_STAGE: Record<StageKey, StageKey | null> = {
  scheduled: null,
  checked_in: "scheduled",
  waiting_for_bath: "checked_in",
  bathing: "waiting_for_bath",
  waiting_for_dry: "bathing",
  drying: "waiting_for_dry",
  waiting_for_groom: "drying",
  grooming: "waiting_for_groom",
  ready: "grooming",
  complete: "ready",
  cancelled: null,
  no_show: null,
};

const SERVICE_COLOUR: Record<string, string> = {
  classic_groom: "#22c55e",
  styled_groom: "#22c55e",
  bath_only: "#3b82f6",
  deshed: "#f97316",
  tidy: "#ec4899",
  nail_trim: "#a78bfa",
  daycare: "#f59e0b",
  other: "#94a3b8",
};

const SERVICE_LABEL: Record<string, string> = {
  classic_groom: "Classic Groom",
  styled_groom: "Styled Groom",
  bath_only: "Bath & Blow Dry",
  deshed: "De-shed",
  tidy: "Tidy",
  nail_trim: "Nail Trim",
  daycare: "Daycare",
  other: "Other",
};

function stageColour(key: string) {
  return ALL_STAGE_OPTIONS.find(s => s.key === key)?.colour ?? "#94a3b8";
}

function fmtTime(ts: Date | number | string | null | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ─── Inline editable cell ─────────────────────────────────────────────────────
function EditableNumber({ value, onSave, placeholder, min, max, label, tone }: {
  value: number | null | undefined;
  onSave: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  label: string;
  tone: "cage" | "tag";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const toneClasses = tone === "cage"
    ? "border-cyan-300 bg-cyan-100/90 text-cyan-950 hover:bg-cyan-200 focus:border-cyan-600 focus:ring-cyan-300"
    : "border-violet-300 bg-violet-100/90 text-violet-950 hover:bg-violet-200 focus:border-violet-600 focus:ring-violet-300";
  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Enter ${label} number`}
        title={`Click to enter ${label} number`}
        className={`w-full text-center font-mono text-sm font-bold min-h-[34px] rounded-md border shadow-sm transition-colors px-1 ${toneClasses}`}
        onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
      >
        {value ?? <span className="text-slate-500 font-semibold text-xs">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      min={min}
      max={max}
      aria-label={`Enter ${label} number`}
      className={`w-full text-center font-mono text-sm font-bold rounded-md border px-1 py-1 outline-none ring-2 ${toneClasses}`}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); const n = parseInt(draft); onSave(isNaN(n) ? null : n); }}
      onKeyDown={e => { if (e.key === "Enter") { setEditing(false); const n = parseInt(draft); onSave(isNaN(n) ? null : n); } if (e.key === "Escape") setEditing(false); }}
    />
  );
}

// ─── Staff picker cell ────────────────────────────────────────────────────────
function StaffCell({ value, staffList, onSave, placeholder }: {
  value: number | null | undefined;
  staffList: { id: number; name: string; role: string }[];
  onSave: (v: number | null) => void;
  placeholder?: string;
}) {
  const selected = staffList.find(s => s.id === value);
  return (
    <Select value={value ? String(value) : "__none__"} onValueChange={v => onSave(v === "__none__" ? null : Number(v))}>
      <SelectTrigger className="h-8 text-xs border-0 bg-transparent focus:ring-0 focus:ring-offset-0 px-1 font-semibold">
        <SelectValue placeholder={placeholder ?? "—"}>
          {selected ? selected.name.split(" ")[0] : <span className="text-white/40">{placeholder ?? "—"}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— None —</SelectItem>
        {staffList.map(s => (
          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BathPriorityCell({ value, coordinated, onSave, onManageGroup, disabled }: {
  value: number | null | undefined;
  coordinated: boolean;
  onSave: (priority: typeof BATH_PRIORITY_VALUES[number] | null) => void;
  onManageGroup: () => void;
  disabled?: boolean;
}) {
  const meta = value ? BATH_PRIORITY_META[value as typeof BATH_PRIORITY_VALUES[number]] : null;
  return (
    <div className="space-y-0.5">
      <Select value={value ? String(value) : "__none__"} onValueChange={(next) => onSave(next === "__none__" ? null : Number(next) as typeof BATH_PRIORITY_VALUES[number])} disabled={disabled}>
        <SelectTrigger className="h-8 min-w-[86px] px-1.5 text-xs font-bold focus:ring-teal-300" style={{ borderColor: meta?.colour ?? "#99f6e4", background: meta?.softColour ?? "#f0fdfa", color: meta?.colour ?? "#115e59" }}>
          <SelectValue placeholder="Queue" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No priority</SelectItem>
          {BATH_PRIORITY_VALUES.map((priority) => <SelectItem key={priority} value={String(priority)}><span className="inline-flex items-center gap-1.5"><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black text-white" style={{ background: BATH_PRIORITY_META[priority].colour }}>{priority}</span>{BATH_PRIORITY_META[priority].label}</span></SelectItem>)}
        </SelectContent>
      </Select>
      <button type="button" onClick={onManageGroup} disabled={disabled} className="flex w-full items-center justify-center gap-1 rounded border border-teal-200 bg-white px-1 py-0.5 text-[9px] font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60" title="Coordinate one bathing priority across selected dogs">
        <Link2 className="h-2.5 w-2.5" /> {coordinated ? "Together" : "Group dogs"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorkflowBoard() {
  const [location, navigate] = useLocation();
  const reviewParams = new URLSearchParams(location.split("?")[1] ?? "");
  const reviewDate = reviewParams.get("date");
  const reviewAppointmentId = Number(reviewParams.get("reviewAppointment"));
  const hasReviewAppointmentFocus = Number.isInteger(reviewAppointmentId) && reviewAppointmentId > 0;
  const [boardDate, setBoardDate] = useState(() => {
    if (reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) return reviewDate;
    const d = new Date(Date.now() + 10 * 3600000);
    return d.toISOString().slice(0, 10);
  });
  const [tvMode, setTvMode] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("__all__");
  const [groomerFilter, setGroomerFilter] = useState<string>("__all__");
  const [familyFilter, setFamilyFilter] = useState<number | null>(null);
  const [bathGroupPopup, setBathGroupPopup] = useState<{ appointmentId: number; petName: string; bathPriority: number | null } | null>(null);
  const [bathGroupSelectedIds, setBathGroupSelectedIds] = useState<number[]>([]);
  const [bathGroupPriority, setBathGroupPriority] = useState<string>("__keep__");
  const [bathQueueDragId, setBathQueueDragId] = useState<number | null>(null);
  const [petPopup, setPetPopup] = useState<null | {
    id: number; petName: string; petBreed: string | null; petAlertLevel: string | null;
    petWarnings: string | null; staffName: string | null; notes: string | null;
    workflowState: string; checkedInAt: number | null; stageStartedAt: number | null;
    bathingStartedAt: number | null; bathingCompletedAt: number | null;
    dryingStartedAt: number | null; dryingCompletedAt: number | null;
    groomingStartedAt: number | null; groomingCompletedAt: number | null;
    readyAt: number | null; completedAt: number | null; scheduledStart: Date | string | number;
  }>(null);
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [now, setNow] = useState(Date.now());
  const dragApptId = useRef<number | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInClient, setWalkInClient] = useState("");
  const [walkInPet, setWalkInPet] = useState("");
  const [walkInBreed, setWalkInBreed] = useState("");
  const [walkInService, setWalkInService] = useState("classic_groom");
  const [walkInStaffId, setWalkInStaffId] = useState<string>("");
  const [walkInTime, setWalkInTime] = useState(() => {
    const now = new Date(Date.now() + 10 * 3600000);
    return `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  });
  const [outConfirm, setOutConfirm] = useState<{ id: number; petName: string } | null>(null);
  const [pickupMessageAppointment, setPickupMessageAppointment] = useState<{ id: number; petName: string } | null>(null);
  const [selectedPickupRecipientId, setSelectedPickupRecipientId] = useState<string>("");
  // Family link state
  const [familyLinkPopup, setFamilyLinkPopup] = useState<{ apptId: number; petId: number; petName: string; petFamilyGroupId: number | null } | null>(null);
  const [familySearch, setFamilySearch] = useState("");
  const { data: familySearchResults } = trpc.family.searchPets.useQuery(
    { query: familySearch, excludePetId: familyLinkPopup?.petId },
    { enabled: !!familyLinkPopup && familySearch.length >= 2 }
  );
  const linkPetsMutation = trpc.family.linkPets.useMutation({
    onSuccess: () => { toast.success("Dogs linked as family!"); setFamilyLinkPopup(null); setFamilySearch(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unlinkPetMutation = trpc.family.unlinkPet.useMutation({
    onSuccess: () => { toast.success("Family link removed"); setFamilyLinkPopup(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
    const [outMarkPaid, setOutMarkPaid] = useState(false);
  const [walkInClientSearch, setWalkInClientSearch] = useState("");
  const [walkInClientId, setWalkInClientId] = useState<number | null>(null);
  const { data: walkInClientResults } = trpc.memberships.searchClients.useQuery(
    { search: walkInClientSearch },
    { enabled: walkInClientSearch.length >= 2 }
  );

  // Tick each second so every active stage tracker is visibly live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(reviewDate) && reviewDate !== boardDate) setBoardDate(reviewDate);
  }, [boardDate, reviewDate]);

  const { data: boardData, refetch, isLoading } = trpc.workflow.getBoard.useQuery(
    { tenantId: 1, date: boardDate },
    workflowBoardRefreshOptions,
  );
  const { data: staffList } = trpc.workflow.getStaff.useQuery({ tenantId: 1 });
  const { data: timingReviewThresholds } = trpc.workflowReview.getBoardThresholds.useQuery({ tenantId: 1 });
  const { data: pickupRecipients, isLoading: pickupRecipientsLoading, error: pickupRecipientsError } = trpc.sms.getPickupRecipients.useQuery(
    { appointmentId: pickupMessageAppointment?.id ?? 0 },
    { enabled: Boolean(pickupMessageAppointment), retry: false },
  );

  useEffect(() => {
    if (!pickupRecipients?.recipients.length) return;
    if (!pickupRecipients.recipients.some(recipient => String(recipient.id) === selectedPickupRecipientId)) {
      setSelectedPickupRecipientId(String(pickupRecipients.recipients[0]!.id));
    }
  }, [pickupRecipients, selectedPickupRecipientId]);

  useEffect(() => {
    if (!hasReviewAppointmentFocus || !boardData?.some(appointment => appointment.id === reviewAppointmentId)) return;
    const timer = window.setTimeout(() => document.getElementById(`workflow-appointment-${reviewAppointmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    return () => window.clearTimeout(timer);
  }, [boardData, hasReviewAppointmentFocus, reviewAppointmentId]);

  const updateStage = trpc.workflow.updateStage.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });
  const setBathPriority = trpc.workflow.setBathPriority.useMutation({
    onSuccess: ({ updated }) => {
      toast.success(updated > 1 ? `Bath priority updated for ${updated} linked dogs` : "Bath priority updated");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const setBathGroup = trpc.workflow.setBathGroup.useMutation({
    onSuccess: ({ updated, groupId }) => {
      toast.success(groupId ? `${updated} dogs will share the same bath priority` : "Bath coordination removed");
      setBathGroupPopup(null);
      setBathGroupSelectedIds([]);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const reorderBathQueue = trpc.workflow.reorderBathQueue.useMutation({
    onSuccess: () => { toast.success("Bath queue reordered"); setBathQueueDragId(null); refetch(); },
    onError: (error) => { setBathQueueDragId(null); toast.error(error.message); },
  });

  const update = useCallback((appointmentId: number, fields: Omit<Parameters<typeof updateStage.mutate>[0], 'appointmentId'>) => {
    updateStage.mutate({ appointmentId, ...fields });
  }, [updateStage]);

  const sendPickupMessage = trpc.sms.sendPickupMessage.useMutation({
    onSuccess: result => {
      toast.success(`Pickup message sent to ${result.recipientName}`);
      setPickupMessageAppointment(null);
      setSelectedPickupRecipientId("");
    },
    onError: error => toast.error(error.message),
  });

  const completeAppointment = useCallback((appointment: { id: number; petName?: string | null }, extraFields: Record<string, unknown> = {}) => {
    updateStage.mutate({
      appointmentId: appointment.id,
      workflowState: "complete",
      completedAt: Date.now(),
      ...extraFields,
    } as Parameters<typeof updateStage.mutate>[0], {
      onSuccess: () => {
        refetch();
        setPickupMessageAppointment({ id: appointment.id, petName: appointment.petName ?? "this dog" });
        setSelectedPickupRecipientId("");
      },
    });
  }, [refetch, updateStage]);

  const advanceStage = useCallback((appt: { id: number; petName?: string | null; workflowState: string }) => {
    const next = NEXT_STAGE[appt.workflowState as StageKey];
    if (!next) return;
    if (appt.workflowState === "ready") {
      completeAppointment(appt);
      return;
    }
    const now = Date.now();
    const timeFields: Record<string, number | null> = {};
    if (next === "checked_in") timeFields.checkedInAt = now;
    if (next === "complete") timeFields.completedAt = now;
    update(appt.id, { workflowState: next, ...timeFields });
  }, [completeAppointment, update]);

  const revertStage = useCallback((appt: { id: number; workflowState: string }) => {
    const prev = PREV_STAGE[appt.workflowState as StageKey];
    if (!prev) return;
    update(appt.id, { workflowState: prev });
  }, [update]);

  const rows = groupFamilyWorkflowRows((boardData ?? []).filter(a =>
    shouldShowWorkflowRow({ state: a.workflowState, showCompleted, stageFilter }) &&
    (groomerFilter === "__all__" || String(a.staffId) === groomerFilter) &&
    (stageFilter === "__all__" || a.workflowState === stageFilter) &&
    (familyFilter === null || (a as any).petFamilyGroupId === familyFilter)
  ));
  const bathQueue = useMemo(() => buildBathPriorityQueue(boardData ?? []), [boardData]);
  const bathQueueByAppointmentId = useMemo(() => {
    const queueItems = new Map<number, (typeof bathQueue)[number]>();
    for (const item of bathQueue) for (const itemRow of item.rows) queueItems.set(itemRow.id, item);
    return queueItems;
  }, [bathQueue]);
  const bathQueueRepresentativeIds = useMemo(() => bathQueue.map((item) => item.rows[0]!.id), [bathQueue]);
  const bathGroupCandidates = useMemo(() => (boardData ?? []).filter((appointment) => isBathPriorityMutable(appointment.workflowState)), [boardData]);
  const reorderBathQueueByRepresentative = useCallback((draggedId: number, targetId: number) => {
    if (draggedId === targetId || reorderBathQueue.isPending) return;
    const nextIds = [...bathQueueRepresentativeIds];
    const fromIndex = nextIds.indexOf(draggedId);
    const targetIndex = nextIds.indexOf(targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    nextIds.splice(fromIndex, 1);
    nextIds.splice(targetIndex, 0, draggedId);
    reorderBathQueue.mutate({ date: boardDate, orderedQueueRepresentativeIds: nextIds });
  }, [bathQueueRepresentativeIds, boardDate, reorderBathQueue]);
  const moveBathQueueItem = useCallback((representativeId: number, direction: -1 | 1) => {
    const index = bathQueueRepresentativeIds.indexOf(representativeId);
    const nextId = bathQueueRepresentativeIds[index + direction];
    if (index < 0 || !nextId) return;
    reorderBathQueueByRepresentative(representativeId, nextId);
  }, [bathQueueRepresentativeIds, reorderBathQueueByRepresentative]);

  const popupStageTimer = petPopup ? formatLiveStageElapsed(getLiveStageElapsedSeconds(petPopup, now)) : null;
  const selectedPickupRecipient = pickupRecipients?.recipients.find(recipient => String(recipient.id) === selectedPickupRecipientId) ?? null;
  const pickupMessagePreview = selectedPickupRecipient && pickupMessageAppointment
    ? `Hi ${selectedPickupRecipient.name.split(" ")[0] || "there"}! ${pickupMessageAppointment.petName} is all done and looking fabulous at Barkin' Beautiful. Come pick them up whenever you're ready! 🐾✨`
    : null;

  const groomers = staffList?.filter(s => s.role !== "bather") ?? [];
  const bathers = staffList?.filter(s => s.role === "bather" || s.role === "groomer") ?? [];

  const performanceSnapshot = useMemo(() => {
    type Metric = { total: number; count: number; reviews: number };
    type Person = { staffId: number; name: string; bath: Metric; dry: Metric; groom: Metric; total: Metric };
    const people = new Map<number, Person>();
    const ensure = (id: number | null | undefined) => {
      if (!id) return null;
      const known = people.get(id);
      if (known) return known;
      const entry: Person = {
        staffId: id,
        name: staffList?.find(s => s.id === id)?.name ?? "Unassigned",
        bath: { total: 0, count: 0, reviews: 0 },
        dry: { total: 0, count: 0, reviews: 0 },
        groom: { total: 0, count: 0, reviews: 0 },
        total: { total: 0, count: 0, reviews: 0 },
      };
      people.set(id, entry);
      return entry;
    };
    const add = (metric: Metric, minutes: number, reviewAfter: number) => {
      if (minutes < 0) return;
      metric.total += minutes;
      metric.count += 1;
      if (minutes > reviewAfter) metric.reviews += 1;
    };

    for (const appointment of boardData ?? []) {
      const bath = appointment.bathingStartedAt && appointment.bathingCompletedAt
        ? Math.floor((appointment.bathingCompletedAt - appointment.bathingStartedAt) / 60000) : null;
      const dry = appointment.dryingStartedAt && appointment.dryingCompletedAt
        ? Math.floor((appointment.dryingCompletedAt - appointment.dryingStartedAt) / 60000) : null;
      const groom = appointment.groomingStartedAt && appointment.groomingCompletedAt
        ? Math.floor((appointment.groomingCompletedAt - appointment.groomingStartedAt) / 60000) : null;
      const total = appointment.checkedInAt && appointment.completedAt
        ? Math.floor((appointment.completedAt - appointment.checkedInAt) / 60000) : null;
      const bather = ensure(appointment.bathStaffId);
      const dryer = ensure(appointment.dryStaffId);
      const groomer = ensure(appointment.staffId);
      const threshold = resolveTimingReviewThreshold({ breed: appointment.petBreed, weightKg: appointment.petWeightKg, weight: appointment.petWeight }, timingReviewThresholds?.rules ?? []);
      if (bath !== null && bather) add(bather.bath, bath, threshold.thresholds.bathMinutes);
      if (dry !== null && dryer) add(dryer.dry, dry, threshold.thresholds.dryMinutes);
      if (groom !== null && groomer) add(groomer.groom, groom, threshold.thresholds.groomMinutes);
      if (total !== null && groomer) add(groomer.total, total, threshold.thresholds.totalMinutes);
    }
    return Array.from(people.values()).filter(person => person.bath.count + person.dry.count + person.groom.count + person.total.count > 0);
  }, [boardData, staffList, timingReviewThresholds]);

  const today = new Date(Date.now() + 10 * 3600000).toISOString().slice(0, 10);
  const isToday = boardDate === today;

  // ─── TV Mode ────────────────────────────────────────────────────────────────
  if (tvMode) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-white overflow-auto z-50">
        <div className="p-4">
          {/* TV Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img src="/barkin_beautiful_logo.png" alt="Barkin Beautiful" className="h-10 object-contain brightness-0 invert" />
              <div>
                <h1 className="text-2xl font-bold">Live Workflow Board</h1>
                <p className="text-sm text-gray-400">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">{rows.length} dogs today</span>
              <Button variant="outline" size="sm" onClick={() => setTvMode(false)} className="border-gray-600 text-gray-300">
                Exit TV Mode
              </Button>
            </div>
          </div>

          {/* Stage summary pills */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {STAGES.filter(s => s.key !== "scheduled").map(stage => {
              const count = rows.filter(r => r.workflowState === stage.key).length;
              return (
                <div key={stage.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold" style={{ background: stage.colour + "33", color: stage.colour, border: `1px solid ${stage.colour}55` }}>
                  <span style={{ background: stage.colour }} className="h-2 w-2 rounded-full" />
                  {stage.label}: {count}
                </div>
              );
            })}
          </div>

          {/* TV table */}
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-center">Cage</th>
                  <th className="px-3 py-2 text-center">Tag</th>
                  <th className="px-3 py-2 text-left">Dog</th>
                  <th className="px-3 py-2 text-left">Breed</th>
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-center">Bath</th>
                  <th className="px-3 py-2 text-center">Dry</th>
                  <th className="px-3 py-2 text-center">Groom</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((appt, idx) => {
                  const stage = STAGES.find(s => s.key === appt.workflowState);
                  const bathStaff = staffList?.find(s => s.id === appt.bathStaffId);
                  const dryStaff = staffList?.find(s => s.id === appt.dryStaffId);
                  const tvStageSeconds = getLiveStageElapsedSeconds({
                    workflowState: appt.workflowState,
                    stageStartedAt: appt.stageStartedAt,
                    checkedInAt: appt.checkedInAt,
                    scheduledStart: appt.scheduledStart,
                  }, now);
                  const tvStageTimer = formatLiveStageElapsed(tvStageSeconds);
                  return (
                    <tr key={appt.id} className={`border-t border-gray-800 ${idx % 2 === 0 ? "bg-gray-900/50" : ""}`}>
                      <td className="px-3 py-2 font-mono text-gray-300">{fmtTime(appt.scheduledStart)}</td>
                      <td className="px-3 py-2 text-center font-bold text-white">{appt.cageNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-center font-bold text-white">{appt.tagNumber ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold text-white">
                        {appt.petName} <span className="text-gray-400 font-normal">{appt.clientLastName}</span>
                        {appt.membershipId && <span className="ml-1 text-xs text-amber-400">M</span>}
                        {appt.petAlertLevel === "danger" && <AlertTriangle className="inline h-3.5 w-3.5 text-red-400 ml-1" />}
                        {appt.petAlertLevel === "caution" && <AlertTriangle className="inline h-3.5 w-3.5 text-yellow-400 ml-1" />}
                        {appt.groomStyleNote && <span title={appt.groomStyleNote}><FileText className="inline h-3.5 w-3.5 text-teal-400 ml-1" /></span>}
                      </td>
                      <td className="px-3 py-2 text-gray-300">{appt.petBreed ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ background: SERVICE_COLOUR[appt.serviceType] ?? "#64748b" }}>
                          {SERVICE_LABEL[appt.serviceType] ?? appt.serviceType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-300 text-xs">{bathStaff?.name.split(" ")[0] ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-300 text-xs">{dryStaff?.name.split(" ")[0] ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-300 text-xs">{appt.staffName?.split(" ")[0] ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: stage?.colour ?? "#64748b" }}>
                          {stage?.short ?? appt.workflowState}
                          {tvStageTimer && <span className="border-l border-white/35 pl-1.5 font-mono text-[10px]">{tvStageTimer}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600 mt-3 text-right">Auto-refreshes every 20s</p>
        </div>
      </div>
    );
  }

  // ─── Main Board View ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Dog className="h-6 w-6 text-primary" />
              Workflow Board
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isToday ? "Today" : new Date(boardDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}{rows.length} dogs
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Prev / Next day + Today */}
            <div className="flex items-center">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-r-none border-r-0" title="Previous day"
                onClick={() => setBoardDate(current => shiftDateKey(current, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input type="date" value={boardDate} onChange={e => setBoardDate(e.target.value)} className="w-36 h-9 text-sm rounded-none border-x-0" />
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-l-none border-l-0" title="Next day"
                onClick={() => setBoardDate(current => shiftDateKey(current, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isToday && (
                <Button variant="outline" size="sm" className="h-9 ml-1 text-sm" onClick={() => setBoardDate(today)}>Today</Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowCompleted(v => !v)}>
              {showCompleted ? "Hide Completed" : "Show Completed"}
            </Button>
            {/* Groomer filter */}
            <Select value={groomerFilter} onValueChange={setGroomerFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All groomers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All groomers</SelectItem>
                {staffList?.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Stage filter */}
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All stages</SelectItem>
                {ALL_STAGE_OPTIONS.map(s => (
                  <SelectItem key={s.key} value={s.key}>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.colour }} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href="/workflow/display" target="_blank" rel="noreferrer" title="Open a separate read-only workflow screen for a TV or back-room iPad. This does not change this controller board.">
                <ExternalLink className="h-4 w-4" /> Open TV Screen
              </a>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTvMode(true)} title="Preview the TV layout in this tab. Use Open TV Screen to keep a separate controller view.">
              <Tv2 className="h-4 w-4" /> TV Preview
            </Button>
            <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setWalkInOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add Walk-in
            </Button>
          </div>
        </div>

        {/* Family filter active banner */}
        {familyFilter !== null && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-sm text-violet-800">
            <span>🐾</span>
            <span className="font-medium">Showing family group only</span>
            <button
              className="ml-auto text-xs text-violet-600 hover:text-violet-800 font-medium underline"
              onClick={() => setFamilyFilter(null)}
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Stage progress bar */}
        <div className="flex gap-1 h-8 rounded-lg overflow-hidden border">
          {STAGES.map(stage => {
            const count = rows.filter(r => r.workflowState === stage.key).length;
            const total = rows.length || 1;
            const pct = Math.round((count / total) * 100);
            return (
              <div
                key={stage.key}
                className="flex items-center justify-center text-white text-[10px] font-bold transition-all duration-500 overflow-hidden"
                style={{ background: stage.colour, width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, minWidth: count > 0 ? "32px" : "0" }}
                title={`${stage.label}: ${count}`}
              >
                {count > 0 && count}
              </div>
            );
          })}
        </div>

        {bathQueue.length > 0 && (
          <section className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-cyan-50 px-3 py-2.5" aria-label="Bathing priority queue">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-teal-950">Bath queue</h2><p className="text-xs text-teal-800">Drag a group to reorder it. Priority changes do not move the appointment or change its workflow stage.</p></div><span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">1 = next</span></div>
            <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label="Draggable bath queue">
              {bathQueue.map((item, index) => {
                const representativeId = item.rows[0]!.id;
                const meta = BATH_PRIORITY_META[item.priority];
                const isDragging = bathQueueDragId === representativeId;
                return <div key={`${item.priority}-${item.rows.map((row) => row.id).join("-")}`} data-bath-queue-item={representativeId} role="listitem" tabIndex={0} draggable={!reorderBathQueue.isPending} aria-grabbed={isDragging} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setBathQueueDragId(representativeId); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (bathQueueDragId) reorderBathQueueByRepresentative(bathQueueDragId, representativeId); }} onDragEnd={() => setBathQueueDragId(null)} onTouchStart={() => setBathQueueDragId(representativeId)} onTouchEnd={(event) => { const touch = event.changedTouches[0]; const target = touch ? document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-bath-queue-item]") as HTMLElement | null : null; const targetId = Number(target?.dataset.bathQueueItem); if (bathQueueDragId && Number.isFinite(targetId)) reorderBathQueueByRepresentative(bathQueueDragId, targetId); else setBathQueueDragId(null); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveBathQueueItem(representativeId, -1); } if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveBathQueueItem(representativeId, 1); } }} className={`touch-none group flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-xs text-teal-950 outline-none transition-[transform,opacity] duration-150 focus:ring-2 focus:ring-teal-500 ${isDragging ? "scale-95 opacity-50" : "cursor-grab active:cursor-grabbing"}`} style={{ borderColor: meta.colour, background: meta.softColour }} title="Drag to reorder. Use arrow keys when focused for a keyboard alternative."><GripVertical className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" /><span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ background: meta.colour }}>{item.priority}</span><span className="font-semibold">{item.petNames.join(" & ")}</span>{item.isCoordinatedBooking && <span className="text-[10px] font-semibold text-teal-700">together</span>}<span className="sr-only">Bath priority {item.priority}, {meta.label}. Position {index + 1} of {bathQueue.length}.</span><div className="ml-0.5 hidden gap-0.5 group-focus-within:flex group-hover:flex"><button type="button" className="rounded p-0.5 text-teal-800 hover:bg-white" disabled={index === 0 || reorderBathQueue.isPending} onClick={() => moveBathQueueItem(representativeId, -1)} aria-label={`Move ${item.petNames.join(" and ")} earlier in bath queue`}><ArrowUp className="h-3 w-3" /></button><button type="button" className="rounded p-0.5 text-teal-800 hover:bg-white" disabled={index === bathQueue.length - 1 || reorderBathQueue.isPending} onClick={() => moveBathQueueItem(representativeId, 1)} aria-label={`Move ${item.petNames.join(" and ")} later in bath queue`}><ArrowDown className="h-3 w-3" /></button></div></div>;
              })}
            </div>
          </section>
        )}

        {/* Main whiteboard table */}
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full text-sm border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-gray-900 text-gray-100 text-xs uppercase tracking-wider">
                <th className="px-2 py-2.5 text-center w-20">Time</th>
                <th className="px-2 py-2.5 text-center w-12 bg-cyan-900 text-cyan-50 border-x border-cyan-700">Cage</th>
                <th className="px-2 py-2.5 text-center w-12 bg-violet-900 text-violet-50 border-r border-violet-700">Tag</th>
                <th className="px-2 py-2.5 text-left min-w-[140px]">Dog / Owner</th>
                <th className="px-2 py-2.5 text-center w-14">Family</th>
                <th className="px-2 py-2.5 text-left w-28">Breed</th>
                <th className="px-2 py-2.5 text-center w-16">Mem</th>
                <th className="px-2 py-2.5 text-center w-14">Paid</th>
                <th className="px-2 py-2.5 text-left min-w-[100px]">Service</th>
                <th className="px-2 py-2.5 text-center w-24">Bath</th>
                <th className="px-2 py-2.5 text-center w-24 bg-teal-900 text-teal-50 border-x border-teal-700">Bath priority</th>
                <th className="px-2 py-2.5 text-center w-24">Dry</th>
                <th className="px-2 py-2.5 text-center w-24">Groomer</th>
                <th className="px-2 py-2.5 text-center min-w-[160px]">Stage</th>
                <th className="px-2 py-2.5 text-center w-16">Out</th>
              </tr>
              {/* Drag-drop target row */}
              <tr className="bg-gray-800/60">
                <td colSpan={15} className="px-2 py-1">
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-400 italic">
                    <span>Drag a row onto a stage chip:</span>
                    {STAGES.map(s => (
                      <span
                        key={s.key}
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white cursor-pointer select-none not-italic"
                        style={{ background: s.colour }}
                        onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                        onDragLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                        onDrop={e => {
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).style.opacity = "1";
                          const id = dragApptId.current;
                          if (!id) return;
                          const appt = boardData?.find(a => a.id === id);
                          if (!appt || appt.workflowState === s.key) return;
                          if (s.key === "complete") {
                            completeAppointment(appt);
                            return;
                          }
                          const timeFields: Record<string, number | null> = {};
                          if (s.key === "checked_in") timeFields.checkedInAt = Date.now();
                          update(id, { workflowState: s.key, ...timeFields });
                          toast.success(`🐾 ${appt.petName ?? "Dog"} → ${s.label}`, {
                            description: `Stage updated successfully`,
                            duration: 2500,
                          });
                        }}
                      >
                        {s.short}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center py-16 text-muted-foreground">
                    {isLoading ? "Loading..." : "No appointments for this day"}
                  </td>
                </tr>
              )}
              {rows.map((appt, idx) => {
                const stage = ALL_STAGE_OPTIONS.find(s => s.key === appt.workflowState) ?? STAGES[0];
                const nextStage = NEXT_STAGE[appt.workflowState as StageKey];
                const prevStage = PREV_STAGE[appt.workflowState as StageKey];
                const familyGroupId = (appt as any).petFamilyGroupId as number | null | undefined;
                const bathQueueItem = bathQueueByAppointmentId.get(appt.id);
                const linkedAbove = familyGroupId != null && (rows[idx - 1] as any)?.petFamilyGroupId === familyGroupId;
                const linkedBelow = familyGroupId != null && (rows[idx + 1] as any)?.petFamilyGroupId === familyGroupId;
                const isComplete = appt.workflowState === "complete";
                const isReady = appt.workflowState === "ready";
                const stageSeconds = getLiveStageElapsedSeconds({
                  workflowState: appt.workflowState,
                  stageStartedAt: appt.stageStartedAt ?? null,
                  checkedInAt: appt.checkedInAt ?? null,
                  scheduledStart: appt.scheduledStart,
                }, now);
                const stageTimer = formatLiveStageElapsed(stageSeconds);
                const stageMinutes = stageSeconds === null ? null : Math.floor(stageSeconds / 60);
                const totalMinutes = appt.checkedInAt
                  ? Math.floor(((appt.completedAt ?? Date.now()) - appt.checkedInAt) / 60000)
                  : null;
                const timerAlert = stageMinutes !== null && stageMinutes >= 60;
                const timerWarn = stageMinutes !== null && stageMinutes >= 30 && stageMinutes < 60;
                const isReviewFocused = hasReviewAppointmentFocus && appt.id === reviewAppointmentId;
                const rowBg = isComplete ? "bg-gray-50 opacity-60"
                  : timerAlert ? "bg-red-50/40"
                  : timerWarn ? "bg-amber-50/30"
                  : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50";

                return (
                  <tr
                    key={appt.id}
                    id={`workflow-appointment-${appt.id}`}
                    data-review-focused={isReviewFocused ? "true" : undefined}
                    className={`${rowBg} ${isReviewFocused ? "bg-amber-100/80 shadow-[inset_0_0_0_2px_rgb(245_158_11)]" : ""} border-t hover:bg-primary/5 transition-colors cursor-grab active:cursor-grabbing`}
                    draggable
                    onDragStart={() => { dragApptId.current = appt.id; }}
                    onDragEnd={() => { dragApptId.current = null; }}
                  >
                    {/* Time */}
                    <td className="px-2 py-1.5 text-center">
                      <span className="font-mono text-xs font-semibold text-gray-600">
                        {fmtTime(appt.scheduledStart)}
                      </span>
                      {appt.checkedInAt && (
                        <div className="text-[10px] text-cyan-600 font-mono">In {fmtTime(appt.checkedInAt)}</div>
                      )}
                      {totalMinutes !== null && (
                        <div className="text-[10px] font-mono text-slate-500" title="Total time in salon">
                          Total {formatDuration(totalMinutes)}
                        </div>
                      )}
                    </td>

                    {/* Cage # */}
                    <td className="px-1 py-1.5 bg-cyan-50/90 border-x border-cyan-200/80">
                      <EditableNumber
                        value={appt.cageNumber}
                        onSave={v => update(appt.id, { cageNumber: v })}
                        placeholder="—"
                        min={1}
                        max={16}
                        label="Cage"
                        tone="cage"
                      />
                    </td>

                    {/* Tag # */}
                    <td className="px-1 py-1.5 bg-violet-50/90 border-r border-violet-200/80">
                      <EditableNumber
                        value={appt.tagNumber}
                        onSave={v => update(appt.id, { tagNumber: v })}
                        placeholder="—"
                        min={1}
                        max={50}
                        label="Tag"
                        tone="tag"
                      />
                    </td>

                    {/* Dog / Owner */}
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="relative h-7 w-7 shrink-0">
                          <PetAvatar petId={appt.petId} petName={appt.petName} className="h-7 w-7" />
                          <div
                            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-white"
                            style={{ background: SERVICE_COLOUR[appt.serviceType] ?? "#94a3b8" }}
                          />
                        </div>
                        <div className="min-w-0">
                          <button
                            className="font-semibold text-sm leading-tight truncate text-left hover:text-primary hover:underline transition-colors flex items-center gap-1"
                            onClick={() => {
                              const popup = {
                                id: appt.id,
                                petName: appt.petName ?? "",
                                petBreed: appt.petBreed ?? null,
                                petAlertLevel: appt.petAlertLevel ?? null,
                                petWarnings: appt.petWarnings ?? null,
                                staffName: appt.staffName ?? null,
                                notes: appt.notes ?? null,
                                workflowState: appt.workflowState,
                                checkedInAt: appt.checkedInAt ?? null,
                                stageStartedAt: appt.stageStartedAt ?? null,
                                bathingStartedAt: appt.bathingStartedAt ?? null,
                                bathingCompletedAt: appt.bathingCompletedAt ?? null,
                                dryingStartedAt: appt.dryingStartedAt ?? null,
                                dryingCompletedAt: appt.dryingCompletedAt ?? null,
                                groomingStartedAt: appt.groomingStartedAt ?? null,
                                groomingCompletedAt: appt.groomingCompletedAt ?? null,
                                readyAt: appt.readyAt ?? null,
                                completedAt: appt.completedAt ?? null,
                                scheduledStart: appt.scheduledStart,
                              };
                              setPetPopup(popup);
                              setEditingNotes(appt.notes ?? "");
                            }}
                            title="View grooming notes"
                          >
                            {appt.petName}
                            <FileText className="h-3 w-3 text-muted-foreground opacity-50" />
                          </button>
                          <p className="text-[11px] text-muted-foreground truncate">{appt.clientLastName}</p>
                          {appt.petAlertLevel === "danger" && (
                            <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white" title={appt.petWarnings ?? "Danger alert"} aria-label={`Danger alert${appt.petWarnings ? `: ${appt.petWarnings}` : ""}`}>
                              <AlertTriangle className="h-2.5 w-2.5" /> DANGER{appt.petWarnings ? ` — ${appt.petWarnings.slice(0, 20)}` : ""}
                            </span>
                          )}
                          {appt.petAlertLevel === "caution" && (
                            <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white" title={appt.petWarnings ?? "Caution alert"} aria-label={`Caution alert${appt.petWarnings ? `: ${appt.petWarnings}` : ""}`}>
                              <AlertTriangle className="h-2.5 w-2.5" /> CAUTION{appt.petWarnings ? ` — ${appt.petWarnings.slice(0, 15)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Breed */}
                    {/* Family Link */}
                    <td className="relative isolate overflow-visible px-1 py-1.5 text-center w-14">
                      {(() => {
                        const linkedPetNames: string[] = Array.from(new Set((appt as any).familyPetNames ?? []));
                        const familyTooltip = linkedPetNames.length > 0 ? `Family linked: ${linkedPetNames.join(", ")}` : "Family linked";
                        return (
                          <div className="relative flex min-h-7 flex-col items-center justify-center gap-0.5">
                            {linkedAbove && <span aria-hidden="true" data-family-bracket="above" className="pointer-events-none absolute -left-8 bottom-1/2 z-0 h-[calc(50%+1.55rem)] w-12 rounded-bl-md border-b-4 border-l-4 border-slate-800 bg-transparent shadow-[0_0_0_2px_rgba(255,255,255,0.96)]" />}
                            {linkedBelow && <span aria-hidden="true" data-family-bracket="below" className="pointer-events-none absolute -left-8 top-1/2 z-0 h-[calc(50%+1.55rem)] w-12 rounded-tl-md border-l-4 border-t-4 border-slate-800 bg-transparent shadow-[0_0_0_2px_rgba(255,255,255,0.96)]" />}
                            {familyGroupId ? (
                              <div className="relative z-10 flex items-center gap-0.5">
                                <button
                                  className="group inline-flex items-center justify-center rounded-full transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                  title={`${familyTooltip}. ${familyFilter === familyGroupId ? "Click to clear the family filter" : "Click to show this family only"}`}
                                  aria-label={`${familyTooltip}. ${familyFilter === familyGroupId ? "Clear family filter" : "Show this family only"}`}
                                  data-family-connector={linkedAbove || linkedBelow ? "connected" : "standalone"}
                                  onClick={() => setFamilyFilter(familyFilter === familyGroupId ? null : familyGroupId)}
                                >
                                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${familyFilter === familyGroupId ? "bg-violet-800 text-white ring-2 ring-violet-400" : "bg-violet-600 text-white group-hover:bg-violet-700"}`}><Link2 className="h-3.5 w-3.5" /></span>
                                </button>
                                <button
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-500 hover:bg-violet-100 hover:text-violet-700 transition-colors"
                                  title={`${familyTooltip}. Manage or unlink this dog`}
                                  aria-label={`Manage or unlink ${appt.petName} from family: ${linkedPetNames.join(", ")}`}
                                  onClick={() => { setFamilyLinkPopup({ apptId: appt.id, petId: appt.petId, petName: appt.petName ?? "", petFamilyGroupId: familyGroupId ?? null }); setFamilySearch(""); }}
                                >
                                  <Unlink className="h-3 w-3" />
                                </button>
                                <span className="sr-only">{familyTooltip}</span>
                              </div>
                            ) : (
                              <button
                                className="transition-all hover:scale-110"
                                title="Link to family"
                                onClick={() => { setFamilyLinkPopup({ apptId: appt.id, petId: appt.petId, petName: appt.petName ?? "", petFamilyGroupId: null }); setFamilySearch(""); }}
                              >
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-dashed border-gray-400 text-gray-400 text-[10px] font-bold hover:border-violet-400 hover:text-violet-500 transition-colors">+</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td className="px-2 py-1.5 text-xs text-gray-600 truncate max-w-[112px]">
                      {appt.petBreed ?? "—"}
                    </td>

                    {/* Membership */}
                    <td className="px-2 py-1.5 text-center">
                      {appt.membershipId ? (
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-300" title="Member">M</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Paid */}
                    <td className="px-2 py-1.5 text-center">
                      <span className="text-xs text-gray-400">—</span>
                    </td>

                    {/* Service */}
                    <td className="px-2 py-1.5">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-tight"
                        style={{ background: SERVICE_COLOUR[appt.serviceType] ?? "#64748b" }}
                      >
                        {SERVICE_LABEL[appt.serviceType] ?? appt.serviceType}
                      </span>
                      {appt.workflowAddOns && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{appt.workflowAddOns}</p>
                      )}
                    </td>

                    {/* Bath */}
                    <td className="px-1 py-1.5 bg-blue-50/50">
                      <StaffCell
                        value={appt.bathStaffId}
                        staffList={bathers}
                        onSave={v => update(appt.id, { bathStaffId: v })}
                        placeholder="Bath"
                      />
                    </td>

                    {/* Bath priority */}
                    <td className="px-1 py-1.5 bg-teal-50/80 border-x border-teal-100">
                      <BathPriorityCell
                        value={appt.bathPriority}
                        coordinated={Boolean(bathQueueItem?.isCoordinatedBooking)}
                        disabled={setBathPriority.isPending || !isBathPriorityMutable(appt.workflowState)}
                        onSave={(bathPriority) => setBathPriority.mutate({ appointmentId: appt.id, bathPriority, applyToLinkedDogs: true })}
                        onManageGroup={() => {
                          const existingGroupIds = appt.bathGroupId ? bathGroupCandidates.filter((candidate) => candidate.bathGroupId === appt.bathGroupId).map((candidate) => candidate.id) : bathQueueItem?.rows.map((row) => row.id) ?? [appt.id];
                          setBathGroupPopup({ appointmentId: appt.id, petName: appt.petName ?? "this dog", bathPriority: appt.bathPriority ?? null });
                          setBathGroupSelectedIds(Array.from(new Set(existingGroupIds)));
                          setBathGroupPriority(appt.bathPriority ? String(appt.bathPriority) : "__keep__");
                        }}
                      />
                    </td>

                    {/* Dry */}
                    <td className="px-1 py-1.5 bg-purple-50/50">
                      <StaffCell
                        value={appt.dryStaffId}
                        staffList={bathers}
                        onSave={v => update(appt.id, { dryStaffId: v })}
                        placeholder="Dry"
                      />
                    </td>

                    {/* Groomer */}
                    <td className="px-1 py-1.5 bg-amber-50/50">
                      <StaffCell
                        value={appt.staffId}
                        staffList={groomers}
                        onSave={v => update(appt.id, { staffId: v })}
                        placeholder="Groomer"
                      />
                    </td>

                    {/* Stage buttons */}
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        {/* Current stage badge */}
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold text-white flex-shrink-0"
                          style={{ background: stage.colour }}
                          title={stageTimer ? `${stage.label}: ${stageTimer} in this stage` : stage.label}
                        >
                          <span>{stage.short}</span>
                          {stageTimer && (
                            <span className="inline-flex items-center gap-0.5 border-l border-white/35 pl-1.5 font-mono text-[10px]" aria-label={`${stage.label} elapsed time ${stageTimer}`}>
                              <Clock className="h-2.5 w-2.5" />{stageTimer}
                            </span>
                          )}
                        </span>
                        <Select
                          value={appt.workflowState}
                          onValueChange={(nextState) => {
                            if (nextState === appt.workflowState) return;
                            update(appt.id, { workflowState: nextState as StageKey });
                          }}
                          disabled={updateStage.isPending}
                        >
                          <SelectTrigger
                            className="h-7 w-[116px] border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 shadow-sm hover:border-primary/50"
                            aria-label={`Manually change ${appt.petName ?? "pet"} workflow stage`}
                            title="Change stage, pause between stages, or record a cancelled or no-show outcome. Timing is updated automatically."
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_STAGE_OPTIONS.map((option) => (
                              <SelectItem key={option.key} value={option.key} className="text-xs">
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Advance button */}
                        {nextStage && (
                          <button
                            className="flex-1 text-[11px] font-semibold px-2 py-1 rounded border transition-colors hover:opacity-90 active:scale-95 text-white"
                            style={{ background: stageColour(nextStage), borderColor: stageColour(nextStage) }}
                            onClick={() => advanceStage(appt)}
                            disabled={updateStage.isPending}
                            title={`Move to ${STAGES.find(s => s.key === nextStage)?.label}`}
                          >
                            → {STAGES.find(s => s.key === nextStage)?.short}
                          </button>
                        )}
                        {/* Revert button */}
                        {prevStage && (
                          <button
                            className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-1 rounded hover:bg-gray-100 transition-colors"
                            onClick={() => revertStage(appt)}
                            disabled={updateStage.isPending}
                            title="Go back one stage"
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Out / Picked Up */}
                    <td className="px-2 py-1.5 text-center">
                      {isComplete ? (
                        <div className="flex flex-col items-center">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          {appt.pickedUpAt && (
                            <span className="text-[10px] text-gray-400 font-mono">{fmtTime(appt.pickedUpAt)}</span>
                          )}
                        </div>
                      ) : isReady ? (
                        <button
                          className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded border border-emerald-300 transition-colors"
                          onClick={() => setOutConfirm({ id: appt.id, petName: appt.petName ?? "this dog" })}
                        >
                          OUT
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Family Link */}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Daily production snapshot — useful for delay and pricing review */}
        {performanceSnapshot.length > 0 && (
          <section className="rounded-xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm">Daily workflow timing</h2>
                <p className="text-xs text-muted-foreground">Average completed duration by assigned bather and groomer. Amber values need a review; they may point to a delay or pricing exception.</p>
              </div>
              <Badge variant="outline" className="text-[10px]">Today only</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="text-left px-4 py-2">Team member</th><th className="text-center px-3 py-2">Bath avg</th><th className="text-center px-3 py-2">Dry avg</th><th className="text-center px-3 py-2">Groom avg</th><th className="text-center px-3 py-2">Total avg</th><th className="text-center px-3 py-2">Review</th></tr>
                </thead>
                <tbody>
                  {performanceSnapshot.map(person => {
                    const average = (metric: { total: number; count: number }) => metric.count ? Math.round(metric.total / metric.count) : null;
                    const reviews = person.bath.reviews + person.dry.reviews + person.groom.reviews + person.total.reviews;
                    return (
                      <tr key={person.staffId} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{person.name}</td>
                        {[person.bath, person.dry, person.groom, person.total].map((metric, index) => {
                          const avg = average(metric);
                          const review = metric.reviews > 0;
                          return <td key={index} className={`px-3 py-2.5 text-center font-mono ${review ? "text-amber-700 font-bold" : "text-slate-700"}`}>{formatDuration(avg)}{review ? " ⚠" : ""}</td>;
                        })}
                        <td className="px-3 py-2.5 text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant={reviews > 0 ? "outline" : "ghost"}
                            className={reviews > 0 ? "h-7 border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100" : "h-7 px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"}
                            onClick={() => navigate(`/staff/review/${person.staffId}?date=${boardDate}`)}
                            title={`Review ${person.name}'s timing exceptions and recommended actions`}
                          >
                            {reviews > 0 ? <><AlertTriangle className="mr-1 h-3 w-3" /> {reviews} review{reviews === 1 ? "" : "s"}</> : "View profile"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pb-2">
          <span className="font-medium">Service colours:</span>
          {Object.entries(SERVICE_COLOUR).map(([key, colour]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: colour }} />
              {SERVICE_LABEL[key] ?? key}
            </span>
          ))}
          <span className="flex items-center gap-1 ml-4"><span className="h-2.5 w-2.5 rounded-sm inline-block bg-amber-200" /> 30-60 min in stage</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm inline-block bg-red-200" /> 60+ min in stage</span>
          <span className="ml-auto text-gray-400">Auto-refreshes every 20s</span>
        </div>
      </div>

      {/* ── OUT Payment Confirmation ── */}
      {outConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOutConfirm(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-xs w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold">Mark {outConfirm.petName} as Out?</h3>
              <p className="text-sm text-muted-foreground mt-1">Please confirm that payment has been collected before marking this dog as picked up.</p>
            </div>
            {/* Mark as Paid toggle */}
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={outMarkPaid}
                onChange={e => setOutMarkPaid(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600"
              />
              <div>
                <p className="text-sm font-semibold">Mark as Paid</p>
                <p className="text-xs text-muted-foreground">Tick if payment has been received</p>
              </div>
            </label>
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={() => { setOutConfirm(null); setOutMarkPaid(false); }}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
                onClick={() => {
                  completeAppointment(outConfirm, { pickedUpAt: Date.now(), ...(outMarkPaid ? { isPaid: true } : {}) });
                  setOutConfirm(null);
                  setOutMarkPaid(false);
                  toast.success(`${outConfirm.petName} marked as out`);
                }}
              >
                {outMarkPaid ? "Paid & OUT" : "OUT (payment pending)"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={Boolean(pickupMessageAppointment)} onOpenChange={open => { if (!open && !sendPickupMessage.isPending) { setPickupMessageAppointment(null); setSelectedPickupRecipientId(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Send ready-for-pickup message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{pickupMessageAppointment?.petName ?? "This dog"} has been marked complete. Choose a saved client contact, review the SMS and send it only when ready.</p>
            {pickupRecipientsLoading && <p className="py-5 text-center text-sm text-muted-foreground">Loading saved contacts…</p>}
            {!pickupRecipientsLoading && pickupRecipientsError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{pickupRecipientsError.message}</p>}
            {!pickupRecipientsLoading && !pickupRecipientsError && pickupRecipients?.recipients.length === 0 && <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">No saved mobile contacts are available. Add a mobile number to the client profile before sending.</p>}
            {!pickupRecipientsLoading && (pickupRecipients?.recipients.length ?? 0) > 0 && <div className="space-y-2"><p className="text-sm font-semibold">Send to</p>{pickupRecipients!.recipients.map(recipient => <label key={`${recipient.type}-${recipient.id}`} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${String(recipient.id) === selectedPickupRecipientId ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><input type="radio" name="pickup-recipient" checked={String(recipient.id) === selectedPickupRecipientId} onChange={() => setSelectedPickupRecipientId(String(recipient.id))} className="h-4 w-4 accent-primary" /><span className="min-w-0"><span className="block text-sm font-medium">{recipient.name} {recipient.type === "primary" && <Badge variant="outline" className="ml-1">Primary</Badge>}</span><span className="block text-xs text-muted-foreground">{recipient.phone} · {recipient.relationship}</span></span></label>)}</div>}
            {pickupMessagePreview && <div className="rounded-lg border bg-muted/30 p-3"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">SMS preview</p><p className="text-sm leading-relaxed">{pickupMessagePreview}</p></div>}
            <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" disabled={sendPickupMessage.isPending} onClick={() => { setPickupMessageAppointment(null); setSelectedPickupRecipientId(""); }}>Not now</Button><Button disabled={!pickupMessageAppointment || !selectedPickupRecipient || sendPickupMessage.isPending} onClick={() => { if (!pickupMessageAppointment || !selectedPickupRecipient) return; sendPickupMessage.mutate({ appointmentId: pickupMessageAppointment.id, recipientType: selectedPickupRecipient.type, contactId: selectedPickupRecipient.type === "additional" ? selectedPickupRecipient.id : undefined }); }}>{sendPickupMessage.isPending ? "Sending…" : "Send SMS"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Walk-in Dialog ── */}
      {walkInOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setWalkInOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-teal-600" /> Add Walk-in
              </h3>
              <button onClick={() => setWalkInOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner Name *</label>
                <div className="relative mt-1">
                  <Input
                    value={walkInClientSearch || walkInClient}
                    onChange={e => {
                      setWalkInClientSearch(e.target.value);
                      setWalkInClient(e.target.value);
                      setWalkInClientId(null);
                    }}
                    placeholder="Search existing client or type new name..."
                    className="pr-8"
                  />
                  {walkInClientId && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 text-xs font-bold">✓</span>
                  )}
                </div>
                {walkInClientResults && walkInClientResults.length > 0 && !walkInClientId && (
                  <div className="border rounded-lg mt-1 overflow-hidden bg-white shadow-sm max-h-32 overflow-y-auto">
                    {walkInClientResults.map((r: any) => (
                      <button
                        key={r.clientId}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 border-b last:border-0"
                        onClick={() => {
                          setWalkInClient(`${r.firstName} ${r.lastName}`);
                          setWalkInClientId(r.clientId);
                          setWalkInClientSearch("");
                        }}
                      >
                        <span className="font-semibold">{r.firstName} {r.lastName}</span>
                        {r.phone && <span className="text-muted-foreground ml-2">{r.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dog Name *</label>
                  <Input value={walkInPet} onChange={e => setWalkInPet(e.target.value)} placeholder="e.g. Buddy" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Breed</label>
                  <Input value={walkInBreed} onChange={e => setWalkInBreed(e.target.value)} placeholder="e.g. Cavoodle" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service</label>
                  <Select value={walkInService} onValueChange={setWalkInService}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic_groom">Classic Groom</SelectItem>
                      <SelectItem value="styled_groom">Styled Groom</SelectItem>
                      <SelectItem value="bath_only">Bath &amp; Blow Dry</SelectItem>
                      <SelectItem value="deshed">De-shed</SelectItem>
                      <SelectItem value="nail_trim">Nail Trim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</label>
                  <Input type="time" value={walkInTime} onChange={e => setWalkInTime(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groomer</label>
                <Select value={walkInStaffId || "__none__"} onValueChange={v => setWalkInStaffId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any available</SelectItem>
                    {staffList?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={() => setWalkInOpen(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition-colors"
                onClick={() => {
                  if (!walkInPet.trim()) { toast.error("Dog name is required"); return; }
                  if (!walkInClient.trim()) { toast.error("Owner name is required"); return; }
                  // Add to board as a local placeholder row (no DB — walk-ins are informal)
                  toast.success(`Walk-in added: ${walkInPet} (${walkInClient}) — please create a full appointment in the calendar`);
                  setWalkInOpen(false);
                  setWalkInClient(""); setWalkInPet(""); setWalkInBreed("");
                }}
              >
                Add to Board
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pet Grooming Notes Popup ── */}
      {petPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPetPopup(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Dog className="h-5 w-5 text-primary" />
                  {petPopup.petName}
                </h3>
                {petPopup.petBreed && <p className="text-sm text-muted-foreground">{petPopup.petBreed}</p>}
              </div>
              <button onClick={() => setPetPopup(null)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Alert */}
            {(petPopup.petAlertLevel === "danger" || petPopup.petAlertLevel === "caution") && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border ${petPopup.petAlertLevel === "danger" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm capitalize">{petPopup.petAlertLevel} Alert</p>
                  {petPopup.petWarnings && <p className="text-sm mt-0.5">{petPopup.petWarnings}</p>}
                </div>
              </div>
            )}

            {/* Stage + timer */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: stageColour(petPopup.workflowState) }}>
                {STAGES.find(s => s.key === petPopup.workflowState)?.label ?? petPopup.workflowState}
              </span>
              {popupStageTimer && (
                <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
                  <Clock className="h-3 w-3" /> {popupStageTimer} in stage
                </span>
              )}
              {petPopup.staffName && (
                <span className="text-xs text-muted-foreground">Groomer: <strong>{petPopup.staffName}</strong></span>
              )}
            </div>

            {/* Workflow timing */}
            <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Workflow timing</p>
                <span className="text-xs font-bold text-slate-700">
                  Total in salon: {petPopup.checkedInAt
                    ? formatDuration(Math.floor(((petPopup.completedAt ?? Date.now()) - petPopup.checkedInAt) / 60000))
                    : "Not checked in"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-muted-foreground">Bath</span>
                <span className="text-right font-medium">{petPopup.bathingStartedAt && petPopup.bathingCompletedAt ? formatDuration(Math.floor((petPopup.bathingCompletedAt - petPopup.bathingStartedAt) / 60000)) : "—"}</span>
                <span className="text-muted-foreground">Dry</span>
                <span className="text-right font-medium">{petPopup.dryingStartedAt && petPopup.dryingCompletedAt ? formatDuration(Math.floor((petPopup.dryingCompletedAt - petPopup.dryingStartedAt) / 60000)) : "—"}</span>
                <span className="text-muted-foreground">Groom</span>
                <span className="text-right font-medium">{petPopup.groomingStartedAt && petPopup.groomingCompletedAt ? formatDuration(Math.floor((petPopup.groomingCompletedAt - petPopup.groomingStartedAt) / 60000)) : "—"}</span>
                <span className="text-muted-foreground">Ready / waiting</span>
                <span className="text-right font-medium">{petPopup.readyAt ? formatDuration(Math.floor(((petPopup.completedAt ?? Date.now()) - petPopup.readyAt) / 60000)) : "—"}</span>
              </div>
            </div>

            {/* Appointment notes */}
            {/* Editable appointment notes */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment Notes</p>
              <Textarea
                value={editingNotes}
                onChange={e => setEditingNotes(e.target.value)}
                placeholder="Add notes for this appointment..."
                rows={3}
                className="text-sm resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Tap outside to close</p>
                <Button
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  disabled={savingNotes || editingNotes === (petPopup.notes ?? "")}
                  onClick={async () => {
                    setSavingNotes(true);
                    try {
                      await update(petPopup.id, { notes: editingNotes });
                      setPetPopup(prev => prev ? { ...prev, notes: editingNotes } : null);
                      toast.success("Notes saved");
                    } finally {
                      setSavingNotes(false);
                    }
                  }}
                >
                  <Save className="h-3 w-3" />
                  {savingNotes ? "Saving..." : "Save Notes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Dialog open={Boolean(bathGroupPopup)} onOpenChange={(open) => { if (!open && !setBathGroup.isPending) { setBathGroupPopup(null); setBathGroupSelectedIds([]); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-teal-700" /> Coordinate bathing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the dogs that need to be bathed together with <strong>{bathGroupPopup?.petName}</strong>. They share one bath priority for this day only. This does not change family links, appointment times or workflow stages.</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-teal-100 bg-teal-50/40 p-2">
              {bathGroupCandidates.map((candidate) => {
                const selected = bathGroupSelectedIds.includes(candidate.id);
                return <label key={candidate.id} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${selected ? "border-teal-500 bg-white" : "border-transparent hover:border-teal-200 hover:bg-white/70"}`}><input type="checkbox" checked={selected} onChange={() => setBathGroupSelectedIds((current) => selected ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} className="h-4 w-4 accent-teal-700" /><span className="min-w-0 flex-1"><span className="font-semibold">{candidate.petName}</span><span className="ml-2 text-xs text-muted-foreground">{fmtTime(candidate.scheduledStart)} · {candidate.clientLastName}</span></span>{candidate.bathPriority && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ background: BATH_PRIORITY_META[candidate.bathPriority as typeof BATH_PRIORITY_VALUES[number]]?.colour ?? "#0f766e" }}>{candidate.bathPriority}</span>}</label>;
              })}
            </div>
            <div className="space-y-1.5"><label className="text-sm font-semibold">Shared bath priority</label><Select value={bathGroupPriority} onValueChange={setBathGroupPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__keep__">Keep current priority</SelectItem><SelectItem value="__none__">No priority</SelectItem>{BATH_PRIORITY_VALUES.map((priority) => <SelectItem key={priority} value={String(priority)}><span className="inline-flex items-center gap-2"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ background: BATH_PRIORITY_META[priority].colour }}>{priority}</span>{BATH_PRIORITY_META[priority].label}</span></SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between"><Button variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={setBathGroup.isPending} onClick={() => { if (!bathGroupPopup) return; setBathGroup.mutate({ appointmentId: bathGroupPopup.appointmentId, date: boardDate, linkedAppointmentIds: [], bathPriority: undefined }); }}>Remove coordination</Button><div className="flex gap-2"><Button variant="outline" disabled={setBathGroup.isPending} onClick={() => { setBathGroupPopup(null); setBathGroupSelectedIds([]); }}>Cancel</Button><Button disabled={!bathGroupPopup || bathGroupSelectedIds.length < 2 || setBathGroup.isPending} className="bg-teal-700 text-white hover:bg-teal-800" onClick={() => { if (!bathGroupPopup) return; setBathGroup.mutate({ appointmentId: bathGroupPopup.appointmentId, date: boardDate, linkedAppointmentIds: bathGroupSelectedIds.filter((id) => id !== bathGroupPopup.appointmentId), bathPriority: bathGroupPriority === "__keep__" ? undefined : bathGroupPriority === "__none__" ? null : Number(bathGroupPriority) as typeof BATH_PRIORITY_VALUES[number] }); }}>{setBathGroup.isPending ? "Saving…" : `Coordinate ${bathGroupSelectedIds.length} dogs`}</Button></div></div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Family Link Popup ── */}
      {familyLinkPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFamilyLinkPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">🔗 Family Link — {familyLinkPopup.petName}</h3>
              <button onClick={() => setFamilyLinkPopup(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X className="h-4 w-4" /></button>
            </div>

            {/* Current family members */}
            {familyLinkPopup.petFamilyGroupId && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently linked with</p>
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
                  {Array.from(new Set((boardData?.find(row => row.id === familyLinkPopup.apptId) as any)?.familyPetNames ?? rows.filter(row => (row as any).petFamilyGroupId === familyLinkPopup.petFamilyGroupId).map(row => row.petName))).join(", ")}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <p className="text-xs text-rose-900">Need separate processing? Remove {familyLinkPopup.petName} from this family group. Appointments and workflow history are not changed.</p>
                  <Button size="sm" variant="outline" className="shrink-0 border-rose-300 bg-white text-rose-700 hover:bg-rose-100" disabled={unlinkPetMutation.isPending} onClick={() => unlinkPetMutation.mutate({ petId: familyLinkPopup.petId })}>{unlinkPetMutation.isPending ? "Unlinking…" : "Unlink dog"}</Button>
                </div>
              </div>
            )}

            {/* Search to link */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link to another dog today</p>
              <input
                type="text"
                value={familySearch}
                onChange={e => setFamilySearch(e.target.value)}
                placeholder="Search dog or owner name..."
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                autoFocus
              />
              {familySearch.length >= 2 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {/* Dogs on the board today */}
                  {rows.filter(r =>
                    r.petId !== familyLinkPopup.petId &&
                    (r.petName?.toLowerCase().includes(familySearch.toLowerCase()) ||
                     r.clientLastName?.toLowerCase().includes(familySearch.toLowerCase()))
                  ).map(r => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-violet-50 border border-transparent hover:border-violet-200 transition-colors text-sm"
                      onClick={() => linkPetsMutation.mutate({ petIds: [familyLinkPopup.petId, r.petId] })}
                    >
                      <span className="font-medium">{r.petName}</span>
                      <span className="text-muted-foreground ml-1">({r.clientLastName}) — {r.petBreed ?? "Unknown breed"}</span>
                    </button>
                  ))}
                  {/* Also search all pets in DB */}
                  {familySearchResults?.filter(p => !rows.some(r => r.petId === p.id)).map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-violet-50 border border-transparent hover:border-violet-200 transition-colors text-sm opacity-70"
                      onClick={() => linkPetsMutation.mutate({ petIds: [familyLinkPopup.petId, p.id] })}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-1">({(p as any).clientName ?? ""}) — {p.breed ?? "Unknown breed"}</span>
                      <span className="text-xs text-gray-400 ml-1">(not on board today)</span>
                    </button>
                  ))}
                  {rows.filter(r =>
                    r.petId !== familyLinkPopup.petId &&
                    (r.petName?.toLowerCase().includes(familySearch.toLowerCase()) ||
                     r.clientLastName?.toLowerCase().includes(familySearch.toLowerCase()))
                  ).length === 0 && (!familySearchResults || familySearchResults.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-2">No dogs found</p>
                  )}
                </div>
              )}
            </div>

            {!familyLinkPopup.petFamilyGroupId && familySearch.length < 2 && (
              <p className="text-xs text-muted-foreground text-center">Type a dog or owner name to search</p>
            )}
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
