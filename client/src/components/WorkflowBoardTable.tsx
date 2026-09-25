import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PetAvatar } from "@/components/PetAvatar";
import { StaffAvatar } from "@/components/StaffAvatar";
import { formatLiveStageElapsed, getLiveStageElapsedSeconds } from "@/lib/workflowStageTimer";
import { BATH_PRIORITY_META, BATH_PRIORITY_VALUES, isBathPriorityMutable } from "@shared/bathPriorityQueue";
import { formatAestTime } from "@shared/auditTimestamp";
import { AlertTriangle, CheckCircle2, Clock, FileText, Link2, Star, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The grooming-room board table.
 *
 * Rendered in three places: the staff board, the TV preview overlay on that
 * board, and the standalone wall display at /workflow/display. It used to be
 * three separate tables. They drifted — the wall display ended up with seven
 * columns against the board's fifteen, missing the dog photos, family links,
 * cage and tag numbers, bath priority and membership that staff rely on — so
 * the screen on the wall no longer resembled the screen they worked from.
 *
 * One table now serves all three. A column added here appears everywhere.
 *
 * `readOnly` is what the two display surfaces pass. It keeps every cell's
 * appearance and drops only the ability to change anything: no drag, no
 * pickers, no popups, no stage buttons. Interactive callers pass `actions`.
 */

export type StaffLite = { id: number; name: string; role: string; photoUrl?: string | null; colourHex?: string | null };

export type BoardActions = {
  update: (id: number, patch: Record<string, unknown>, meta?: { petName?: string | null }) => void;
  updateStagePending: boolean;
  advanceStage: (appt: any) => void;
  revertStage: (appt: any) => void;
  dragApptId: { current: number | null };
  boardData: any[] | undefined;
  completeAppointment: (appt: any) => void;
  setPetPopup: (p: any) => void;
  setEditingNotes: (s: string) => void;
  setOutConfirm: (o: { id: number; petName: string }) => void;
  familyFilter: number | null;
  setFamilyFilter: (id: number | null) => void;
  setFamilyLinkPopup: (p: any) => void;
  setFamilySearch: (s: string) => void;
  setBathPriority: { isPending: boolean; mutate: (input: any) => void };
  bathGroupCandidates: any[];
  setBathGroupPopup: (p: any) => void;
  setBathGroupSelectedIds: (ids: number[]) => void;
  setBathGroupPriority: (p: string) => void;
};

export type WorkflowBoardTableProps = {
  rows: any[];
  now: number;
  bathers: StaffLite[];
  groomers: StaffLite[];
  bathQueueByAppointmentId: Map<number, { isCoordinatedBooking?: boolean; rows: { id: number }[] }>;
  isLoading?: boolean;
  hasReviewAppointmentFocus?: boolean;
  reviewAppointmentId?: number | null;
  readOnly?: boolean;
  actions?: BoardActions;
  /**
   * Lets a read-only surface put a completed dog back to `ready`. The wall
   * display has always offered this: it is the only way to undo a mis-tapped
   * "OUT" from the floor, and dropping it would strand the dog as collected.
   */
  onRestoreCompleted?: (appointmentId: number) => void;
  restorePending?: boolean;
};

export function formatDuration(minutes: number | null) {
  if (minutes === null || minutes < 0 || !Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Stage definitions ────────────────────────────────────────────────────────
export const STAGES = [
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
export const TERMINAL_STAGES = [
  { key: "cancelled", label: "Cancelled", short: "CANCEL", colour: "#dc2626" },
  { key: "no_show", label: "No show", short: "NO SHOW", colour: "#ea580c" },
] as const;
export const ALL_STAGE_OPTIONS = [...STAGES, ...TERMINAL_STAGES] as const;
export type StageKey = typeof ALL_STAGE_OPTIONS[number]["key"];

export const NEXT_STAGE: Record<StageKey, StageKey | null> = {
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

export const PREV_STAGE: Record<StageKey, StageKey | null> = {
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

export const SERVICE_COLOUR: Record<string, string> = {
  classic_groom: "#22c55e",
  styled_groom: "#22c55e",
  bath_only: "#3b82f6",
  deshed: "#f97316",
  tidy: "#ec4899",
  nail_trim: "#a78bfa",
  daycare: "#f59e0b",
  other: "#94a3b8",
};

export const SERVICE_LABEL: Record<string, string> = {
  classic_groom: "Classic Groom",
  styled_groom: "Styled Groom",
  bath_only: "Bath & Blow Dry",
  deshed: "De-shed",
  tidy: "Tidy",
  nail_trim: "Nail Trim",
  daycare: "Daycare",
  other: "Other",
};

export function stageColour(key: string) {
  return ALL_STAGE_OPTIONS.find(s => s.key === key)?.colour ?? "#94a3b8";
}

export function fmtTime(ts: Date | number | string | null | undefined) {
  return formatAestTime(ts);
}

// ─── Inline editable cell ─────────────────────────────────────────────────────
function EditableNumber({ value, onSave, placeholder, min, max, label, tone, readOnly }: {
  value: number | null | undefined;
  onSave: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  label: string;
  tone: "cage" | "tag";
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const toneClasses = tone === "cage"
    ? "border-blue-300 bg-blue-100/90 text-blue-950 hover:bg-blue-200 focus:border-blue-600 focus:ring-blue-300"
    : "border-violet-300 bg-violet-100/90 text-violet-950 hover:bg-violet-200 focus:border-violet-600 focus:ring-violet-300";
  // The TV board shows the same cage and tag numbers in the same coloured pill,
  // just without the click target — a wall display has nobody to click it.
  if (readOnly) {
    return (
      <div className={`w-full text-center font-mono text-sm font-bold min-h-[34px] rounded-md border shadow-sm px-1 flex items-center justify-center ${toneClasses}`}>
        {value ?? <span className="text-slate-500 font-semibold text-xs">{placeholder}</span>}
      </div>
    );
  }
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
function StaffCell({ value, staffList, onSave, placeholder, readOnly }: {
  value: number | null | undefined;
  staffList: { id: number; name: string; role: string; photoUrl?: string | null; colourHex?: string | null }[];
  onSave: (v: number | null) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const selected = staffList.find(s => s.id === value);
  if (readOnly) {
    return (
      <div className="flex h-8 items-center gap-1.5 px-1 text-xs font-semibold min-w-0">
        {selected ? (
          <>
            <StaffAvatar photoUrl={selected.photoUrl} name={selected.name} colourHex={selected.colourHex} className="h-5 w-5" ring={false} />
            <span className="truncate">{selected.name.split(" ")[0]}</span>
          </>
        ) : <span className="text-slate-400">{placeholder ?? "—"}</span>}
      </div>
    );
  }
  return (
    <Select value={value ? String(value) : "__none__"} onValueChange={v => onSave(v === "__none__" ? null : Number(v))}>
      <SelectTrigger className="h-8 text-xs border-0 bg-transparent focus:ring-0 focus:ring-offset-0 px-1 font-semibold">
        <SelectValue placeholder={placeholder ?? "—"}>
          {selected ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <StaffAvatar photoUrl={selected.photoUrl} name={selected.name} colourHex={selected.colourHex} className="h-5 w-5" ring={false} />
              <span className="truncate">{selected.name.split(" ")[0]}</span>
            </span>
          ) : <span className="text-white/40">{placeholder ?? "—"}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— None —</SelectItem>
        {staffList.map(s => (
          <SelectItem key={s.id} value={String(s.id)}>
            <span className="flex items-center gap-2">
              <StaffAvatar photoUrl={s.photoUrl} name={s.name} colourHex={s.colourHex} className="h-6 w-6" ring={false} />
              {s.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BathPriorityCell({ value, coordinated, onSave, onManageGroup, disabled, readOnly }: {
  value: number | null | undefined;
  coordinated: boolean;
  onSave: (priority: typeof BATH_PRIORITY_VALUES[number] | null) => void;
  onManageGroup: () => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const meta = value ? BATH_PRIORITY_META[value as typeof BATH_PRIORITY_VALUES[number]] : null;
  if (readOnly) {
    return (
      <div className="space-y-0.5">
        <div className="flex h-8 min-w-[86px] items-center justify-center rounded-md border px-1.5 text-xs font-bold" style={{ borderColor: meta?.colour ?? "#ddd6fe", background: meta?.softColour ?? "#f5f3ff", color: meta?.colour ?? "#5b21b6" }}>
          {value ?? "Queue"}
        </div>
        {coordinated && (
          <div className="flex w-full items-center justify-center gap-1 rounded border border-violet-200 bg-white px-1 py-0.5 text-[9px] font-semibold text-violet-800">
            <Link2 className="h-2.5 w-2.5" /> Together
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <Select value={value ? String(value) : "__none__"} onValueChange={(next) => onSave(next === "__none__" ? null : Number(next) as typeof BATH_PRIORITY_VALUES[number])} disabled={disabled}>
        <SelectTrigger className="h-8 min-w-[86px] px-1.5 text-xs font-bold focus:ring-violet-300" style={{ borderColor: meta?.colour ?? "#ddd6fe", background: meta?.softColour ?? "#f5f3ff", color: meta?.colour ?? "#5b21b6" }}>
          <SelectValue placeholder="Queue" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No priority</SelectItem>
          {BATH_PRIORITY_VALUES.map((priority) => <SelectItem key={priority} value={String(priority)}><span className="inline-flex items-center gap-1.5"><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: BATH_PRIORITY_META[priority].colour }}>{priority}</span>{BATH_PRIORITY_META[priority].label}</span></SelectItem>)}
        </SelectContent>
      </Select>
      <button type="button" onClick={onManageGroup} disabled={disabled} className="flex w-full items-center justify-center gap-1 rounded border border-violet-200 bg-white px-1 py-0.5 text-[9px] font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60" title="Coordinate one bathing priority across selected dogs">
        <Link2 className="h-2.5 w-2.5" /> {coordinated ? "Together" : "Group dogs"}
      </button>
    </div>
  );
}

export function WorkflowBoardTable({
  rows,
  now,
  bathers,
  groomers,
  bathQueueByAppointmentId,
  isLoading = false,
  hasReviewAppointmentFocus = false,
  reviewAppointmentId = null,
  readOnly = false,
  actions,
  onRestoreCompleted,
  restorePending = false,
}: WorkflowBoardTableProps) {
  // A read-only board never reaches these, so a no-op keeps the JSX identical
  // rather than sprinkling `actions?.` through four hundred lines of markup.
  const noop = () => {};
  const a: BoardActions = actions ?? {
    update: noop,
    updateStagePending: false,
    advanceStage: noop,
    revertStage: noop,
    dragApptId: { current: null },
    boardData: undefined,
    completeAppointment: noop,
    setPetPopup: noop,
    setEditingNotes: noop,
    setOutConfirm: noop,
    familyFilter: null,
    setFamilyFilter: noop,
    setFamilyLinkPopup: noop,
    setFamilySearch: noop,
    setBathPriority: { isPending: false, mutate: noop },
    bathGroupCandidates: [],
    setBathGroupPopup: noop,
    setBathGroupSelectedIds: noop,
    setBathGroupPriority: noop,
  };
  const {
    update, advanceStage, revertStage, dragApptId, boardData, completeAppointment,
    setPetPopup, setEditingNotes, setOutConfirm, familyFilter, setFamilyFilter,
    setFamilyLinkPopup, setFamilySearch, setBathPriority, bathGroupCandidates,
    setBathGroupPopup, setBathGroupSelectedIds, setBathGroupPriority,
  } = a;
  const updateStage = { isPending: a.updateStagePending };

  return (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full text-sm border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-slate-900 text-slate-100 text-xs uppercase tracking-wider">
                <th className="px-2 py-2.5 text-center w-20">Time</th>
                <th className="px-2 py-2.5 text-center w-12 bg-blue-900 text-blue-50 border-x border-blue-700">Cage</th>
                <th className="px-2 py-2.5 text-center w-12 bg-violet-900 text-violet-50 border-r border-violet-700">Tag</th>
                <th className="px-2 py-2.5 text-left min-w-[140px]">Dog / Owner</th>
                <th className="px-2 py-2.5 text-center w-14">Family</th>
                <th className="px-2 py-2.5 text-left w-28">Breed</th>
                <th className="px-2 py-2.5 text-center w-16">Mem</th>
                <th className="px-2 py-2.5 text-center w-14">Paid</th>
                <th className="px-2 py-2.5 text-left min-w-[100px]">Service</th>
                <th className="px-2 py-2.5 text-center w-24">Bath</th>
                <th className="px-2 py-2.5 text-center w-24 bg-slate-800 text-slate-50 border-x border-slate-600">Bath priority</th>
                <th className="px-2 py-2.5 text-center w-24">Dry</th>
                <th className="px-2 py-2.5 text-center w-24">Groomer</th>
                <th className="px-2 py-2.5 text-center min-w-[160px]">Stage</th>
                <th className="px-2 py-2.5 text-center w-16">Out</th>
              </tr>
              {/* Drag-drop target row */}
              {!readOnly && (
              <tr className="bg-slate-800/60">
                <td colSpan={15} className="px-2 py-1">
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400 italic">
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
                          if (s.key === "ready") timeFields.readyAt = Date.now();
                          update(id, { workflowState: s.key, ...timeFields }, { petName: appt.petName });
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
              )}
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
                const rowBg = isComplete ? "bg-slate-50 opacity-60"
                  : timerAlert ? "bg-red-50/40"
                  : timerWarn ? "bg-amber-50/30"
                  : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50";

                return (
                  <tr
                    key={appt.id}
                    id={`workflow-appointment-${appt.id}`}
                    data-review-focused={isReviewFocused ? "true" : undefined}
                    className={`${rowBg} ${isReviewFocused ? "bg-amber-100/80 shadow-[inset_0_0_0_2px_rgb(245_158_11)]" : ""} border-t transition-colors ${readOnly ? "" : "hover:bg-primary/5 cursor-grab active:cursor-grabbing"}`}
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : () => { dragApptId.current = appt.id; }}
                    onDragEnd={readOnly ? undefined : () => { dragApptId.current = null; }}
                  >
                    {/* Time */}
                    <td className="px-2 py-1.5 text-center">
                      <span className="font-mono text-xs font-semibold text-slate-600">
                        {fmtTime(appt.scheduledStart)}
                      </span>
                      {appt.checkedInAt && (
                        <div className="text-[10px] text-violet-600 font-mono">In {fmtTime(appt.checkedInAt)}</div>
                      )}
                      {totalMinutes !== null && (
                        <div className="text-[10px] font-mono text-slate-500" title="Total time in salon">
                          Total {formatDuration(totalMinutes)}
                        </div>
                      )}
                    </td>

                    {/* Cage # */}
                    <td className="px-1 py-1.5 bg-blue-50/90 border-x border-blue-200/80">
                      <EditableNumber
                        value={appt.cageNumber}
                        onSave={v => update(appt.id, { cageNumber: v })}
                        placeholder="—"
                        min={1}
                        max={16}
                        label="Cage"
                        tone="cage"
                        readOnly={readOnly}
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
                        readOnly={readOnly}
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
                            className={`font-semibold text-sm leading-tight truncate text-left transition-colors flex items-center gap-1 ${readOnly ? "cursor-default" : "hover:text-primary hover:underline"}`}
                            onClick={readOnly ? undefined : () => {
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
                            {!readOnly && <FileText className="h-3 w-3 text-muted-foreground opacity-50" />}
                            {(appt as any).isVipMember && (
                              <span
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-950 shadow-sm"
                                title="Active VIP member"
                              >
                                <Star className="h-2.5 w-2.5 fill-amber-950" /> VIP
                              </span>
                            )}
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
                          {(() => {
                            const petCodes = (appt as any).petMoeGoPetCodes as Array<{ codeId: string; abbreviation: string; color?: string; description?: string }> | null | undefined;
                            if (!Array.isArray(petCodes) || petCodes.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {petCodes.map((code) => (
                                  <span
                                    key={code.codeId}
                                    className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold text-white leading-none"
                                    style={{ background: code.color ?? "#6b7280" }}
                                    title={code.description ? `${code.abbreviation}: ${code.description}` : code.abbreviation}
                                  >
                                    {code.abbreviation}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
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
                                  onClick={readOnly ? undefined : () => setFamilyFilter(familyFilter === familyGroupId ? null : familyGroupId)}
                                >
                                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${familyFilter === familyGroupId ? "bg-violet-800 text-white ring-2 ring-violet-400" : "bg-violet-600 text-white group-hover:bg-violet-700"}`}><Link2 className="h-3.5 w-3.5" /></span>
                                </button>
                                {!readOnly && <button
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-500 hover:bg-violet-100 hover:text-violet-700 transition-colors"
                                  title={`${familyTooltip}. Manage or unlink this dog`}
                                  aria-label={`Manage or unlink ${appt.petName} from family: ${linkedPetNames.join(", ")}`}
                                  onClick={() => { setFamilyLinkPopup({ apptId: appt.id, petId: appt.petId, petName: appt.petName ?? "", petFamilyGroupId: familyGroupId ?? null }); setFamilySearch(""); }}
                                >
                                  <Unlink className="h-3 w-3" />
                                </button>}
                                <span className="sr-only">{familyTooltip}</span>
                              </div>
                            ) : readOnly ? null : (
                              <button
                                className="transition-all hover:scale-110"
                                title="Link to family"
                                onClick={() => { setFamilyLinkPopup({ apptId: appt.id, petId: appt.petId, petName: appt.petName ?? "", petFamilyGroupId: null }); setFamilySearch(""); }}
                              >
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-dashed border-slate-400 text-slate-400 text-[10px] font-bold hover:border-violet-400 hover:text-violet-500 transition-colors">+</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td className="px-2 py-1.5 text-xs text-slate-600 truncate max-w-[112px]">
                      {appt.petBreed ?? "—"}
                    </td>

                    {/* Membership */}
                    <td className="px-2 py-1.5 text-center">
                      {appt.membershipId ? (
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-300" title="Member">M</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Paid */}
                    <td className="px-2 py-1.5 text-center">
                      <span className="text-xs text-slate-400">—</span>
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
                        readOnly={readOnly}
                      />
                    </td>

                    {/* Bath priority */}
                    <td className="px-1 py-1.5 bg-violet-50/80 border-x border-violet-100">
                      <BathPriorityCell
                        value={appt.bathPriority}
                        coordinated={Boolean(bathQueueItem?.isCoordinatedBooking)}
                        disabled={setBathPriority.isPending || !isBathPriorityMutable(appt.workflowState)}
                        readOnly={readOnly}
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
                    <td className="px-1 py-1.5 bg-violet-50/50">
                      <StaffCell
                        value={appt.dryStaffId}
                        staffList={bathers}
                        onSave={v => update(appt.id, { dryStaffId: v })}
                        placeholder="Dry"
                        readOnly={readOnly}
                      />
                    </td>

                    {/* Groomer */}
                    <td className="px-1 py-1.5 bg-amber-50/50">
                      <StaffCell
                        value={appt.staffId}
                        staffList={groomers}
                        onSave={v => update(appt.id, { staffId: v })}
                        placeholder="Groomer"
                        readOnly={readOnly}
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
                        {!readOnly && (<>
                        <Select
                          value={appt.workflowState}
                          onValueChange={(nextState) => {
                            if (nextState === appt.workflowState) return;
                            const now = Date.now();
                            const timeFields: Record<string, number | null> = {};
                            if (nextState === "checked_in") timeFields.checkedInAt = now;
                            if (nextState === "ready") timeFields.readyAt = now;
                            if (nextState === "complete") timeFields.completedAt = now;
                            update(appt.id, { workflowState: nextState as StageKey, ...timeFields }, { petName: appt.petName });
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
                            className="text-[10px] text-slate-400 hover:text-slate-600 px-1 py-1 rounded hover:bg-slate-100 transition-colors"
                            onClick={() => revertStage(appt)}
                            disabled={updateStage.isPending}
                            title="Go back one stage"
                          >
                            ↩
                          </button>
                        )}
                        </>)}
                      </div>
                    </td>

                    {/* Out / Picked Up */}
                    <td className="px-2 py-1.5 text-center">
                      {isComplete ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          {appt.pickedUpAt && (
                            <span className="text-[10px] text-slate-400 font-mono">{fmtTime(appt.pickedUpAt)}</span>
                          )}
                          {onRestoreCompleted && (
                            <button
                              type="button"
                              onClick={() => onRestoreCompleted(appt.id)}
                              disabled={restorePending}
                              className="rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              title="Return this dog to Ready so staff can correct its workflow status"
                            >
                              {restorePending ? "…" : "Undo"}
                            </button>
                          )}
                        </div>
                      ) : isReady ? (
                        readOnly ? (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded border border-emerald-300">READY</span>
                        ) : (
                        <button
                          className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded border border-emerald-300 transition-colors"
                          onClick={() => setOutConfirm({ id: appt.id, petName: appt.petName ?? "this dog" })}
                        >
                          OUT
                        </button>
                        )
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Family Link */}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
  );
}
