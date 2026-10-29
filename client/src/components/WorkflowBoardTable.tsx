import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKFLOW_STAGE_COLOURS } from "@shared/workflowStageColours";
import { afternoonSessionRowIndex, AFTERNOON_SESSION_LABEL } from "@shared/sessionDivider";
import { workflowStateLabel, workflowStateShortLabel } from "@shared/workflowStateLabels";
import { PetAvatar } from "@/components/PetAvatar";
import { StaffAvatar } from "@/components/StaffAvatar";
import { formatLiveStageElapsed, getLiveStageElapsedSeconds } from "@/lib/workflowStageTimer";
import { BATH_PRIORITY_META, BATH_PRIORITY_VALUES, isBathPriorityMutable } from "@shared/bathPriorityQueue";
import { collectByStatus, collectByTone } from "@shared/collectBy";
import { shortAddOnLabel } from "@shared/addOnBoardLabel";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { DogBoardHoverCard } from "@/components/DogBoardHoverCard";
import { parsePetCodes } from "@shared/petCodes";
import { PetCodeChips } from "@/components/PetCodeChips";
import { joinedContactBadge } from "@shared/appointmentContact";
import { PetAlertButton } from "@/components/PetAlertButton";
import { describePetCode } from "@shared/petCodeMeanings";
import { formatAestTime } from "@shared/auditTimestamp";
import { Check, CheckCircle2, Clock, FileText, Link2, Star, Unlink } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

/**
 * The grooming-room board table.
 *
 * Rendered in three places: the staff board, the TV preview overlay on that
 * board, and the standalone wall display at /workflow/display. It used to be
 * three separate tables. They drifted — the wall display ended up with seven
 * columns against the board's fifteen, missing the dog photos, family links,
 * cage and tag numbers and bath priority that staff rely on — so
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
  /**
   * Tick an extra off, or untick it. Lauren, 27/10/2026 — the board
   * showed which extras a dog needed but not whether any were done.
   */
  toggleAddOnDone: (addOnId: number, done: boolean) => void;
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
  /**
   * Show who to ring about the dog.
   *
   * Off by default, deliberately. Two of the three surfaces using this
   * table are screens on a wall — WorkflowDisplay and the board's tvMode —
   * and a client's daughter's name hanging over the waiting area is not
   * something to have to opt OUT of. The interactive staff board opts in;
   * anything added later is private until somebody decides otherwise.
   */
  showContact?: boolean;
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
  { key: "scheduled",   label: "Waiting",    short: "WAIT",  colour: WORKFLOW_STAGE_COLOURS.scheduled },
  { key: "checked_in",  label: "Checked In", short: "IN",    colour: WORKFLOW_STAGE_COLOURS.checked_in },
  { key: "waiting_for_bath", label: workflowStateLabel("waiting_for_bath"), short: workflowStateShortLabel("waiting_for_bath"), colour: WORKFLOW_STAGE_COLOURS.waiting_for_bath },
  { key: "bathing",     label: "Bath",       short: "BATH",  colour: WORKFLOW_STAGE_COLOURS.bathing },
  { key: "waiting_for_dry", label: "Wait for Dry", short: "WAIT DRY", colour: WORKFLOW_STAGE_COLOURS.waiting_for_dry },
  { key: "drying",      label: "Drying",     short: "DRY",   colour: WORKFLOW_STAGE_COLOURS.drying },
  { key: "waiting_for_groom", label: "Wait for Groom", short: "WAIT GROOM", colour: WORKFLOW_STAGE_COLOURS.waiting_for_groom },
  { key: "grooming",    label: "Groom",      short: "GROOM", colour: WORKFLOW_STAGE_COLOURS.grooming },
  { key: "ready",       label: "Ready",      short: "READY", colour: WORKFLOW_STAGE_COLOURS.ready },
  { key: "complete",    label: "Out",        short: "OUT",   colour: WORKFLOW_STAGE_COLOURS.complete },
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
    ? "border-blue-300 dark:border-blue-800 bg-blue-100/90 dark:bg-blue-950/90 text-blue-950 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-900/50 focus:border-blue-600 focus:ring-blue-300"
    : "border-violet-300 dark:border-violet-800 bg-violet-100/90 dark:bg-violet-950/90 text-violet-950 dark:text-violet-100 hover:bg-violet-200 dark:hover:bg-violet-900/50 focus:border-violet-600 focus:ring-violet-300";
  // The TV board shows the same cage and tag numbers in the same coloured pill,
  // just without the click target — a wall display has nobody to click it.
  if (readOnly) {
    return (
      <div className={`w-full text-center font-mono text-sm font-bold min-h-[34px] rounded-md border shadow-sm px-1 flex items-center justify-center ${toneClasses}`}>
        {value ?? <span className="text-muted-foreground font-semibold text-xs">{placeholder}</span>}
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
        {value ?? <span className="text-muted-foreground font-semibold text-xs">{placeholder}</span>}
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
        ) : <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
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
          ) : (
            // Was text-white/40 — white at 40% on a light row, so the Bath
            // and Dry columns read as empty rather than as unassigned.
            <span className="text-muted-foreground">{placeholder ?? "—"}</span>
          )}
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
          <div className="flex w-full items-center justify-center gap-1 rounded border border-violet-200 dark:border-violet-900/50 bg-card px-1 py-0.5 text-[9px] font-semibold text-violet-800 dark:text-violet-300">
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
      <button type="button" onClick={onManageGroup} disabled={disabled} className="flex w-full items-center justify-center gap-1 rounded border border-violet-200 dark:border-violet-900/50 bg-card px-1 py-0.5 text-[9px] font-semibold text-violet-800 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-60" title="Coordinate one bathing priority across selected dogs">
        <Link2 className="h-2.5 w-2.5" /> {coordinated ? "Together" : "Group dogs"}
      </button>
    </div>
  );
}

/**
 * The afternoon session, drawn between two rows.
 *
 * Lauren, 29/10/2026, after the same line landed on the calendar:
 * "Red line to show up in the workflow too pretty please. After
 * pepper... before peaches."
 *
 * A table cannot take the calendar's positioned line, so the divider
 * is a row of its own. It spans every column so the eye cannot slip
 * past it, which is the whole job.
 */
function SessionDividerRowTr() {
  return (
    <tr aria-hidden="true" className="border-t-0">
      <td colSpan={13} className="p-0">
        <div className="flex items-center gap-2 bg-red-50/70 px-2 py-1 dark:bg-red-950/40">
          <span className="h-[3px] flex-1 rounded-full bg-red-500" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            {AFTERNOON_SESSION_LABEL}
          </span>
          <span className="h-[3px] flex-1 rounded-full bg-red-500" />
        </div>
      </td>
    </tr>
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
  showContact = false,
  actions,
  onRestoreCompleted,
  restorePending = false,
}: WorkflowBoardTableProps) {
  /* Where the afternoon session begins, measured by each dog's family
     cohort rather than its own slot — see afternoonSessionRowIndex. */
  const afternoonStartsAt = afternoonSessionRowIndex(rows);
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
    toggleAddOnDone: noop,
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
                <th className="px-2 py-2.5 text-left w-36">Breed</th>
                <th className="px-2 py-2.5 text-left min-w-[100px]">Service</th>
                <th className="px-2 py-2.5 text-center w-24">Bath</th>
                <th className="px-2 py-2.5 text-center w-24 bg-slate-800 text-slate-50 border-x border-slate-600">Bath priority</th>
                <th className="px-2 py-2.5 text-center w-24">Dry</th>
                <th className="px-2 py-2.5 text-center w-24">Groomer</th>
                <th className="px-2 py-2.5 text-center min-w-[400px]">Stage</th>
                <th className="px-2 py-2.5 text-center w-16">Out</th>
              </tr>
              {/* Drag-drop target row */}
              {!readOnly && (
              <tr className="bg-slate-800/60">
                <td colSpan={13} className="px-2 py-1">
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground italic">
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
                  <td colSpan={13} className="text-center py-16 text-muted-foreground">
                    {isLoading ? "Loading..." : "No appointments for this day"}
                  </td>
                </tr>
              )}
              {rows.map((appt, idx) => {
                const startsAfternoon = idx === afternoonStartsAt;
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
                const rowBg = isComplete ? "bg-muted opacity-60"
                  : timerAlert ? "bg-red-50/40 dark:bg-red-950/40"
                  : timerWarn ? "bg-amber-50/30 dark:bg-amber-950/30"
                  : idx % 2 === 0 ? "bg-card" : "bg-muted/50";

                return (
                  <Fragment key={appt.id}>
                  {startsAfternoon && <SessionDividerRowTr />}
                  <tr
                    id={`workflow-appointment-${appt.id}`}
                    data-review-focused={isReviewFocused ? "true" : undefined}
                    className={`${rowBg} ${isReviewFocused ? "bg-amber-100/80 dark:bg-amber-950/80 shadow-[inset_0_0_0_2px_rgb(245_158_11)]" : ""} border-t transition-colors ${readOnly ? "" : "hover:bg-primary/5 cursor-grab active:cursor-grabbing"}`}
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : () => { dragApptId.current = appt.id; }}
                    onDragEnd={readOnly ? undefined : () => { dragApptId.current = null; }}
                  >
                    {/* Time */}
                    <td className="px-2 py-1.5 text-center">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        {fmtTime(appt.scheduledStart)}
                      </span>
                      {appt.checkedInAt && (
                        <div className="text-[10px] text-violet-600 dark:text-violet-400 font-mono">In {fmtTime(appt.checkedInAt)}</div>
                      )}
                      {totalMinutes !== null && (
                        <div className="text-[10px] font-mono text-muted-foreground" title="Total time in salon">
                          Total {formatDuration(totalMinutes)}
                        </div>
                      )}
                    </td>

                    {/* Cage # */}
                    <td className="px-1 py-1.5 bg-blue-50/90 dark:bg-blue-950/90 border-x border-blue-200/80 dark:border-blue-900/80">
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
                    <td className="px-1 py-1.5 bg-violet-50/90 dark:bg-violet-950/90 border-r border-violet-200/80 dark:border-violet-900/80">
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
                          {/* Hovering the name shows the whole dog: alert,
                              out-time, add-ons, grooming notes, today's
                              notes. Same source as the click-through
                              dialog — see shared/dogBoardSummary.ts. */}
                          <HoverCard openDelay={150} closeDelay={80}>
                          <HoverCardTrigger asChild>
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
                                // Everything the hover shows, so the dialog
                                // can show the same and more.
                                serviceType: appt.serviceType,
                                collectBy: appt.collectBy ?? null,
                                petSizeBand: (appt as any).petSizeBand ?? null,
                                addOns: (appt as any).addOns ?? [],
                                groomStyleNote: (appt as any).groomStyleNote ?? null,
                                groomStyleWarnings: (appt as any).groomStyleWarnings ?? null,
                                workflowAddOns: appt.workflowAddOns ?? null,
                                petMoegoCodeLabels: (appt as any).petMoegoCodeLabels ?? null,
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
                          </HoverCardTrigger>
                          <HoverCardContent side="right" align="start" className="w-auto p-2">
                            <DogBoardHoverCard row={appt as any} />
                          </HoverCardContent>
                          </HoverCard>
                          <p className="text-[11px] text-muted-foreground truncate">{appt.clientLastName}</p>
                          {(() => {
                            // "Tx + Rochelle" in green marker on the
                            // whiteboard, now on the card. Only when it is
                            // NOT the owner, or every row would repeat the
                            // name directly above it.
                            if (!showContact) return null;
                            const contact = joinedContactBadge(appt as {
                              contactId?: number | null;
                              contactName?: string | null;
                              contactRelationship?: string | null;
                            });
                            if (!contact) return null;
                            const phone = (appt as { contactPhone?: string | null }).contactPhone;
                            return (
                              <p
                                className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 truncate"
                                title={phone ? `Contact ${contact} on ${phone}` : `Contact ${contact} — no number on file`}
                              >
                                ☎ {contact}
                              </p>
                            );
                          })()}
                          <PetAlertButton
                            pet={{ alertLevel: appt.petAlertLevel, warnings: appt.petWarnings }}
                            petName={appt.petName}
                          />
                          {(() => {
                            // MoeGo's own tags for this dog, shown exactly as
                            // MoeGo shows them: "✂5f, #7f, No cologne,
                            // SENSITIVE". They mix clip specs, style shorthand
                            // and genuine safety flags, and are deliberately
                            // not classified — "PLUCK EARS" and "DONT PLUCK
                            // EARS" are both real codes, one word apart, so a
                            // parser deciding what matters would eventually
                            // get one of them backwards. A human reads them.
                            const codes = parsePetCodes(appt.petMoegoCodeLabels);
                            if (codes.length === 0) return null;
                            // Through the shared chips, so a colour set in
                            // the catalogue reaches the board. These used to
                            // be drawn grey here whatever the catalogue said,
                            // which made colouring a code pointless in the
                            // one place a groomer actually reads it.
                            return <PetCodeChips codes={codes} size="xs" className="mt-0.5" />;
                          })()}
                          {(() => {
                            // When the dog has to be gone by, and whether it
                            // is going to make it. Beside the caution badge
                            // because that is where a bather already looks.
                            const status = collectByStatus({
                              collectBy: appt.collectBy,
                              workflowState: appt.workflowState,
                              sizeBand: appt.petSizeBand ?? null,
                            });
                            if (status.risk === "none") return null;
                            // Red whatever the risk — see collectByTone.
                            const tone = collectByTone(status.risk);
                            const why =
                              status.risk === "overdue" ? "Past the time this dog had to leave"
                              : status.risk === "at_risk" ? `About ${status.minutesNeeded} min of work left and ${status.minutesLeft} min to do it in`
                              : status.risk === "tight" ? `About ${status.minutesNeeded} min of work left, ${status.minutesLeft} min to go`
                              : "Has a collection time, comfortably on track";
                            return (
                              <span
                                className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tracking-tight shadow-sm ${tone}`}
                                title={why}
                                aria-label={`${status.label}. ${why}`}
                              >
                                <Clock className="h-3 w-3" /> {status.label}
                                {status.risk === "overdue" && " LATE"}
                              </span>
                            );
                          })()}
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
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-950/50 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
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
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-dashed border-slate-400 text-muted-foreground text-[10px] font-bold hover:border-violet-400 hover:text-violet-500 transition-colors">+</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Wraps instead of truncating: "West Highland White
                        Terrier" read as "West Highland ..." and a groomer
                        cannot tell two Maltese crosses apart from that. */}
                    <td className="px-2 py-1.5 text-xs leading-tight text-muted-foreground">
                      <span className="block max-w-[140px]" title={appt.petBreed ?? undefined}>
                        {appt.petBreed ?? "—"}
                      </span>
                    </td>

                    {/* Service */}
                    <td className="px-2 py-1.5">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-tight"
                        style={{ background: SERVICE_COLOUR[appt.serviceType] ?? "#64748b" }}
                      >
                        {SERVICE_LABEL[appt.serviceType] ?? appt.serviceType}
                      </span>
                      {/* The extras, under the service, where Lauren asked
                          for them: "show any add-ons on the workflow so
                          groomers can see what else needs to be done at a
                          glance." Amber, so they read as work to do rather
                          than as another label — and distinct from the red
                          out-time, which is the only thing on this row
                          that should shout. */}
                      {appt.addOns?.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {appt.addOns.map((addOn: { id?: number; name: string; quantity: number; completedAt?: string | Date | null }, i: number) => {
                            const done = Boolean(addOn.completedAt);
                            /**
                             * Lauren, 27/10/2026: "We have to go out the
                             * back to make sure the bathers have seen the
                             * add on note. We need them to be able to put
                             * a tick next to it so we know it's checked
                             * off & completed."
                             *
                             * Amber means still to do, green with a tick
                             * means done. It stays on the row rather than
                             * disappearing: the groom was still charged
                             * for it, and a line that vanishes when ticked
                             * looks like a mistake.
                             */
                            return (
                            <button
                              key={addOn.id ?? `${addOn.name}-${i}`}
                              type="button"
                              disabled={readOnly || !addOn.id}
                              onClick={() => addOn.id && a.toggleAddOnDone(addOn.id, !done)}
                              className={`inline-flex items-center rounded px-1 py-px text-[10px] font-semibold leading-tight ring-1 ${
                                done
                                  ? "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-800"
                                  : "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800"
                              } ${readOnly ? "" : "hover:brightness-95"}`}
                              title={done
                                ? `${addOn.name} — done. Tap to undo.`
                                : `Add-on: ${addOn.name}${addOn.quantity > 1 ? ` ×${addOn.quantity}` : ""} — tap when done`}
                            >
                              {done && <Check className="mr-0.5 h-2.5 w-2.5" />}
                              <span className={done ? "line-through decoration-1" : ""}>
                                {shortAddOnLabel(addOn.name)}
                              </span>
                              {addOn.quantity > 1 && <span className="ml-0.5">×{addOn.quantity}</span>}
                            </button>
                            );
                          })}
                        </div>
                      )}
                      {/* A free-text note staff can type on the board. Kept
                          separate from the booked add-ons above: one is what
                          was sold, the other is what somebody scribbled. */}
                      {appt.workflowAddOns && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{appt.workflowAddOns}</p>
                      )}
                    </td>

                    {/* Bath */}
                    <td className="px-1 py-1.5 bg-blue-50/50 dark:bg-blue-950/50">
                      <StaffCell
                        value={appt.bathStaffId}
                        staffList={bathers}
                        onSave={v => update(appt.id, { bathStaffId: v })}
                        placeholder="Bath"
                        readOnly={readOnly}
                      />
                    </td>

                    {/* Bath priority */}
                    <td className="px-1 py-1.5 bg-violet-50/80 dark:bg-violet-950/80 border-x border-violet-100 dark:border-violet-950/50">
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
                    <td className="px-1 py-1.5 bg-violet-50/50 dark:bg-violet-950/50">
                      <StaffCell
                        value={appt.dryStaffId}
                        staffList={bathers}
                        onSave={v => update(appt.id, { dryStaffId: v })}
                        placeholder="Dry"
                        readOnly={readOnly}
                      />
                    </td>

                    {/* Groomer */}
                    <td className="px-1 py-1.5 bg-amber-50/50 dark:bg-amber-950/50">
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
                        {/* Fixed width, so every row's dropdown and advance
                            button start at the same x. This was the only
                            content-sized element before a flex-1 button, so
                            "GROOM 17:59" and "WAIT" pushed the rest of the
                            row to different places and nothing lined up
                            down the board. 136px fits the widest case,
                            "WAIT GROOM" with a running timer. */}
                        <span
                          className="inline-flex w-[136px] flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
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
                          {/* Carries the stage's own colour, the same one the
                              summary bar and the legend use above. A board of
                              identical white dropdowns made you read every row
                              to find the dogs actually being worked on; now the
                              waiting greys and the in-progress blues, purples
                              and ambers separate at a glance. Colours come from
                              STAGES, so the bar, the legend, the advance button
                              and this control cannot drift apart. */}
                          <SelectTrigger
                            /* 128px and 11px: "Wait for Groom" is the
                               longest label and was being cut to "Wait for
                               Groo" at the old size. */
                            className="h-7 w-[128px] flex-shrink-0 whitespace-nowrap border-0 px-2 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 focus:ring-2 focus:ring-offset-1"
                            style={{ background: stageColour(appt.workflowState) }}
                            aria-label={`Manually change ${appt.petName ?? "pet"} workflow stage`}
                            title="Change stage, pause between stages, or record a cancelled or no-show outcome. Timing is updated automatically."
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_STAGE_OPTIONS.map((option) => (
                              <SelectItem key={option.key} value={option.key} className="text-xs">
                                <span className="flex items-center gap-1.5">
                                  {/* The same swatch as the legend, so picking
                                      a stage from the list matches what the
                                      row will turn. */}
                                  <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: option.colour }}
                                    aria-hidden="true"
                                  />
                                  {option.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Advance button. The slot is always there, even
                            at the end of the line, so a completed row does
                            not collapse and pull its neighbours out of
                            line. */}
                        {!nextStage && <span className="flex-1" aria-hidden="true" />}
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
                        {/* Revert arrow, same idea: a dog at the first
                            stage has nothing to go back to, and the gap
                            used to shift that row's button 24px right. */}
                        {!prevStage && <span className="w-6 flex-shrink-0" aria-hidden="true" />}
                        {prevStage && (
                          <button
                            className="w-6 flex-shrink-0 rounded py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
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
                            <span className="text-[10px] text-muted-foreground font-mono">{fmtTime(appt.pickedUpAt)}</span>
                          )}
                          {onRestoreCompleted && (
                            <button
                              type="button"
                              onClick={() => onRestoreCompleted(appt.id)}
                              disabled={restorePending}
                              className="rounded border border-amber-300 dark:border-amber-800 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50"
                              title="Return this dog to Ready so staff can correct its workflow status"
                            >
                              {restorePending ? "…" : "Undo"}
                            </button>
                          )}
                        </div>
                      ) : isReady ? (
                        readOnly ? (
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 px-2 py-1 rounded border border-emerald-300 dark:border-emerald-800">READY</span>
                        ) : (
                        <button
                          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 px-2 py-1 rounded border border-emerald-300 dark:border-emerald-800 transition-colors"
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
  );
}
