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
import { formatAestTime, formatAestDate } from "@shared/auditTimestamp";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Clock, Dog, ExternalLink, FileText, Filter, GripVertical, Link2, Moon, Plus, RefreshCw, Save, Star, Sun, Tv2, Unlink, UserPlus, X } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { StaffAvatar } from "@/components/StaffAvatar";
import { useDisplayTheme } from "@/lib/displayTheme";
import {
  WorkflowBoardTable, formatDuration, fmtTime, stageColour,
  STAGES, TERMINAL_STAGES, ALL_STAGE_OPTIONS, NEXT_STAGE, PREV_STAGE,
  SERVICE_COLOUR, SERVICE_LABEL, type StageKey,
} from "@/components/WorkflowBoardTable";


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

  // Shared with the standalone TV display page, so a device keeps one choice
  // across both. Light by default — staff asked for the white background.
  const { theme: tvTheme, toggle: toggleTvTheme, isDark: tvIsDark } = useDisplayTheme();
  useEffect(() => {
    const root = document.documentElement;
    // Only while the TV overlay is up; the board itself follows the app theme.
    root.classList.toggle("dark", tvMode && tvTheme === "dark");
    return () => root.classList.remove("dark");
  }, [tvMode, tvTheme]);
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

  const update = useCallback((appointmentId: number, fields: Omit<Parameters<typeof updateStage.mutate>[0], 'appointmentId'>, options?: { petName?: string | null }) => {
    updateStage.mutate({ appointmentId, ...fields }, {
      onSuccess: () => {
        // Send the "ready for pickup" text prompt the moment a dog actually
        // becomes ready — not after they've already been marked OUT, since
        // by then they may already be gone.
        if (fields.workflowState === "ready") {
          setPickupMessageAppointment({ id: appointmentId, petName: options?.petName ?? "this dog" });
          setSelectedPickupRecipientId("");
        }
      },
    });
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
      onSuccess: () => refetch(),
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
    if (next === "ready") timeFields.readyAt = now;
    if (next === "complete") timeFields.completedAt = now;
    update(appt.id, { workflowState: next, ...timeFields }, { petName: appt.petName });
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
  // ── One table, two modes ────────────────────────────────────────────────────
  // TV mode renders exactly this markup with every control swapped for static
  // text: same columns, same pet photos, same colours. It used to be a separate,
  // thinner table, and the two drifted until the wall display looked like a
  // different product from the board standing next to it. Keeping one copy is
  // what stops that happening again — a column added here appears on the TV.

  if (tvMode) {
    return (
      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-auto z-50">
        <div className="p-4">
          {/* TV Header */}
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <img src="/barkin_beautiful_logo.png" alt="Barkin Beautiful" className="h-10 object-contain shrink-0 dark:brightness-0 dark:invert" />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">Live Workflow Board</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{formatAestDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-sm text-slate-500 dark:text-slate-400">{rows.length} dogs today</span>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTvTheme}
                className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 shrink-0 gap-1.5"
                title={tvIsDark ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={tvIsDark}
              >
                {tvIsDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {tvIsDark ? "Light" : "Dark"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTvMode(false)} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 shrink-0">
                Exit TV Mode
              </Button>
            </div>
          </div>

          {/* Stage summary pills */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {STAGES.filter(s => s.key !== "scheduled").map(stage => {
              const count = rows.filter(r => r.workflowState === stage.key).length;
              return (
                <div key={stage.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold" style={{ background: stage.colour + "33", color: tvIsDark ? stage.colour : `color-mix(in oklch, ${stage.colour} 78%, black)`, border: `1px solid ${stage.colour}55` }}>
                  <span style={{ background: stage.colour }} className="h-2 w-2 rounded-full" />
                  {stage.label}: {count}
                </div>
              );
            })}
          </div>

          <WorkflowBoardTable
            rows={rows}
            now={now}
            bathers={bathers}
            groomers={groomers}
            bathQueueByAppointmentId={bathQueueByAppointmentId}
            readOnly
          />
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 text-right">Auto-refreshes every 20s</p>
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
              {isToday ? "Today" : formatAestDate(boardDate + "T12:00:00Z", { weekday: "long", day: "numeric", month: "long" })}
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
            <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setWalkInOpen(true)}>
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
          <section className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-violet-50 px-3 py-2.5" aria-label="Bathing priority queue">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-violet-950">Bath queue</h2><p className="text-xs text-violet-800">Drag a group to reorder it. Priority changes do not move the appointment or change its workflow stage.</p></div><span className="rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">1 = next</span></div>
            <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label="Draggable bath queue">
              {bathQueue.map((item, index) => {
                const representativeId = item.rows[0]!.id;
                const meta = BATH_PRIORITY_META[item.priority];
                const isDragging = bathQueueDragId === representativeId;
                return <div key={`${item.priority}-${item.rows.map((row) => row.id).join("-")}`} data-bath-queue-item={representativeId} role="listitem" tabIndex={0} draggable={!reorderBathQueue.isPending} aria-grabbed={isDragging} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setBathQueueDragId(representativeId); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (bathQueueDragId) reorderBathQueueByRepresentative(bathQueueDragId, representativeId); }} onDragEnd={() => setBathQueueDragId(null)} onTouchStart={() => setBathQueueDragId(representativeId)} onTouchEnd={(event) => { const touch = event.changedTouches[0]; const target = touch ? document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-bath-queue-item]") as HTMLElement | null : null; const targetId = Number(target?.dataset.bathQueueItem); if (bathQueueDragId && Number.isFinite(targetId)) reorderBathQueueByRepresentative(bathQueueDragId, targetId); else setBathQueueDragId(null); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveBathQueueItem(representativeId, -1); } if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveBathQueueItem(representativeId, 1); } }} className={`touch-none group flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-xs text-violet-950 outline-none transition-[transform,opacity] duration-150 focus:ring-2 focus:ring-violet-500 ${isDragging ? "scale-95 opacity-50" : "cursor-grab active:cursor-grabbing"}`} style={{ borderColor: meta.colour, background: meta.softColour }} title="Drag to reorder. Use arrow keys when focused for a keyboard alternative."><GripVertical className="h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" /><span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: meta.colour }}>{item.priority}</span><span className="font-semibold">{item.petNames.join(" & ")}</span>{item.isCoordinatedBooking && <span className="text-[10px] font-semibold text-violet-700">together</span>}<span className="sr-only">Bath priority {item.priority}, {meta.label}. Position {index + 1} of {bathQueue.length}.</span><div className="ml-0.5 hidden gap-0.5 group-focus-within:flex group-hover:flex"><button type="button" className="rounded p-0.5 text-violet-800 hover:bg-white" disabled={index === 0 || reorderBathQueue.isPending} onClick={() => moveBathQueueItem(representativeId, -1)} aria-label={`Move ${item.petNames.join(" and ")} earlier in bath queue`}><ArrowUp className="h-3 w-3" /></button><button type="button" className="rounded p-0.5 text-violet-800 hover:bg-white" disabled={index === bathQueue.length - 1 || reorderBathQueue.isPending} onClick={() => moveBathQueueItem(representativeId, 1)} aria-label={`Move ${item.petNames.join(" and ")} later in bath queue`}><ArrowDown className="h-3 w-3" /></button></div></div>;
              })}
            </div>
          </section>
        )}

        {/* Main whiteboard table */}
        <WorkflowBoardTable
            rows={rows}
            now={now}
            bathers={bathers}
            groomers={groomers}
            bathQueueByAppointmentId={bathQueueByAppointmentId}
            isLoading={isLoading}
            hasReviewAppointmentFocus={hasReviewAppointmentFocus}
            reviewAppointmentId={reviewAppointmentId}
            actions={{
              update,
              updateStagePending: updateStage.isPending,
              advanceStage,
              revertStage,
              dragApptId,
              boardData,
              completeAppointment,
              setPetPopup,
              setEditingNotes,
              setOutConfirm,
              familyFilter,
              setFamilyFilter,
              setFamilyLinkPopup,
              setFamilySearch,
              setBathPriority,
              bathGroupCandidates,
              setBathGroupPopup,
              setBathGroupSelectedIds,
              setBathGroupPriority,
            }}
          />

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
          <span className="ml-auto text-slate-400">Auto-refreshes every 20s</span>
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
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
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
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-slate-50 transition-colors"
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
                <UserPlus className="h-5 w-5 text-violet-600" /> Add Walk-in
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
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-slate-50 transition-colors"
                onClick={() => setWalkInOpen(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-colors"
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
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-violet-700" /> Coordinate bathing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the dogs that need to be bathed together with <strong>{bathGroupPopup?.petName}</strong>. They share one bath priority for this day only. This does not change family links, appointment times or workflow stages.</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-violet-100 bg-violet-50/40 p-2">
              {bathGroupCandidates.map((candidate) => {
                const selected = bathGroupSelectedIds.includes(candidate.id);
                return <label key={candidate.id} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${selected ? "border-violet-500 bg-white" : "border-transparent hover:border-violet-200 hover:bg-white/70"}`}><input type="checkbox" checked={selected} onChange={() => setBathGroupSelectedIds((current) => selected ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} className="h-4 w-4 accent-violet-700" /><span className="min-w-0 flex-1"><span className="font-semibold">{candidate.petName}</span><span className="ml-2 text-xs text-muted-foreground">{fmtTime(candidate.scheduledStart)} · {candidate.clientLastName}</span></span>{candidate.bathPriority && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: BATH_PRIORITY_META[candidate.bathPriority as typeof BATH_PRIORITY_VALUES[number]]?.colour ?? "#0f766e" }}>{candidate.bathPriority}</span>}</label>;
              })}
            </div>
            <div className="space-y-1.5"><label className="text-sm font-semibold">Shared bath priority</label><Select value={bathGroupPriority} onValueChange={setBathGroupPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__keep__">Keep current priority</SelectItem><SelectItem value="__none__">No priority</SelectItem>{BATH_PRIORITY_VALUES.map((priority) => <SelectItem key={priority} value={String(priority)}><span className="inline-flex items-center gap-2"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: BATH_PRIORITY_META[priority].colour }}>{priority}</span>{BATH_PRIORITY_META[priority].label}</span></SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between"><Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={setBathGroup.isPending} onClick={() => { if (!bathGroupPopup) return; setBathGroup.mutate({ appointmentId: bathGroupPopup.appointmentId, date: boardDate, linkedAppointmentIds: [], bathPriority: undefined }); }}>Remove coordination</Button><div className="flex gap-2"><Button variant="outline" disabled={setBathGroup.isPending} onClick={() => { setBathGroupPopup(null); setBathGroupSelectedIds([]); }}>Cancel</Button><Button disabled={!bathGroupPopup || bathGroupSelectedIds.length < 2 || setBathGroup.isPending} className="bg-violet-700 text-white hover:bg-violet-800" onClick={() => { if (!bathGroupPopup) return; setBathGroup.mutate({ appointmentId: bathGroupPopup.appointmentId, date: boardDate, linkedAppointmentIds: bathGroupSelectedIds.filter((id) => id !== bathGroupPopup.appointmentId), bathPriority: bathGroupPriority === "__keep__" ? undefined : bathGroupPriority === "__none__" ? null : Number(bathGroupPriority) as typeof BATH_PRIORITY_VALUES[number] }); }}>{setBathGroup.isPending ? "Saving…" : `Coordinate ${bathGroupSelectedIds.length} dogs`}</Button></div></div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Family Link Popup ── */}
      {familyLinkPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFamilyLinkPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">🔗 Family Link — {familyLinkPopup.petName}</h3>
              <button onClick={() => setFamilyLinkPopup(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded"><X className="h-4 w-4" /></button>
            </div>

            {/* Current family members */}
            {familyLinkPopup.petFamilyGroupId && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently linked with</p>
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
                  {Array.from(new Set((boardData?.find(row => row.id === familyLinkPopup.apptId) as any)?.familyPetNames ?? rows.filter(row => (row as any).petFamilyGroupId === familyLinkPopup.petFamilyGroupId).map(row => row.petName))).join(", ")}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs text-red-900">Need separate processing? Remove {familyLinkPopup.petName} from this family group. Appointments and workflow history are not changed.</p>
                  <Button size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100" disabled={unlinkPetMutation.isPending} onClick={() => unlinkPetMutation.mutate({ petId: familyLinkPopup.petId })}>{unlinkPetMutation.isPending ? "Unlinking…" : "Unlink dog"}</Button>
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
                      <span className="text-xs text-slate-400 ml-1">(not on board today)</span>
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
