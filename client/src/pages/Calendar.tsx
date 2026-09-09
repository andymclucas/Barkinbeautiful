import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { resolveCalendarStaffColumns } from "@/lib/calendarStaffColumns";
import { toggleCalendarStaffSelection } from "@/lib/calendarStaffFilter";
import { getDayCalendarGridSizing } from "@/lib/calendarGridSizing";
import { buildAestDragSchedule } from "@/lib/calendarDragSchedule";
import { buildSharedAppointmentPriceBreakdown } from "@shared/sharedAppointmentPricing";
import { buildCalendarDragTargetMinutes, formatCalendarDragTargetTime } from "@shared/calendarDragTarget";
import { formatSharedAppointmentName } from "@shared/appointmentDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, Pencil, Filter, CalendarIcon, Ban, Trash2, AlertTriangle, Printer, Camera, X, Search,
  FileDown, Check, CheckCircle2, ImagePlus, Mail,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

// ── Constants ────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7am–7pm (13 rows)
const HOUR_HEIGHT = 72; // px per hour
const TIME_COL_W = 52; // px for the time gutter

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom",
  styled_groom:  "Styled Groom",
  bath_only:     "Bath",
  fft:           "FFT (Face, Feet & Hygiene Tidy)",
  nail_trim:     "Nail Trim",
  daycare:       "Daycare",
  deshed:        "Deshed",
  other:         "Other",
};

const SERVICE_COLOURS: Record<string, { bg: string; border: string; text: string }> = {
  classic_groom: { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" },
  styled_groom:  { bg: "#ede9fe", border: "#8b5cf6", text: "#6d28d9" },
  bath_only:     { bg: "#cffafe", border: "#06b6d4", text: "#0e7490" },
  fft:           { bg: "#fce7f3", border: "#ec4899", text: "#be185d" },
  nail_trim:     { bg: "#fef9c3", border: "#eab308", text: "#a16207" },
  daycare:       { bg: "#dcfce7", border: "#22c55e", text: "#15803d" },
  deshed:        { bg: "#fff7ed", border: "#f97316", text: "#c2410c" },
  other:         { bg: "#f1f5f9", border: "#94a3b8", text: "#475569" },
};

const WORKFLOW_COLOURS: Record<string, string> = {
  scheduled:  "bg-blue-100 text-blue-800",
  checked_in: "bg-yellow-100 text-yellow-800",
  bathing:    "bg-cyan-100 text-cyan-800",
  drying:     "bg-violet-100 text-violet-800",
  grooming:   "bg-purple-100 text-purple-800",
  ready:      "bg-green-100 text-green-800",
  complete:   "bg-gray-100 text-gray-600",
  cancelled:  "bg-red-100 text-red-700",
  no_show:    "bg-orange-100 text-orange-700",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

function toAESTDate(date: Date): Date {
  return new Date(date.getTime() + AEST_OFFSET_MS);
}

// Both functions produce a YYYY-MM-DD key in AEST so they always match
function aestDateKey(utcDate: Date): string {
  const d = toAESTDate(utcDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// dayDate is a local midnight Date (from setHours(0,0,0,0)) — treat it as AEST midnight
function dayDateKey(localMidnight: Date): string {
  // localMidnight was created with setHours(0,0,0,0) in the browser's local timezone.
  // We want the AEST calendar date for this day, which is simply the local date components.
  return `${localMidnight.getFullYear()}-${String(localMidnight.getMonth() + 1).padStart(2,'0')}-${String(localMidnight.getDate()).padStart(2,'0')}`;
}

function fmtTime(date: Date) {
  const aest = toAESTDate(date);
  const h = aest.getUTCHours();
  const m = aest.getUTCMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function fmtDateShort(date: Date) {
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// "Today" per Brisbane's calendar, not whatever timezone the device's system
// clock happens to be set to. Without this, opening the calendar or clicking
// "Today" near a day boundary could silently land on the wrong day if the
// computer isn't set to Australian time.
function getTodayAEST(): Date {
  const aest = toAESTDate(new Date());
  return new Date(aest.getUTCFullYear(), aest.getUTCMonth(), aest.getUTCDate());
}

/** Convert AEST hour+minute into a pixel offset from the top of the grid (7am = 0) */
function timeToTop(aestDate: Date): number {
  const h = aestDate.getUTCHours();
  const m = aestDate.getUTCMinutes();
  return (h - 7 + m / 60) * HOUR_HEIGHT;
}

/** Compute collision columns so overlapping appts sit side-by-side */
function computeColumns<T extends { scheduledStart: Date; scheduledEnd: Date }>(appts: T[]) {
  const sorted = [...appts].sort(
    (a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
  );
  type Layout = { appt: T; col: number; totalCols: number };
  const result: Layout[] = [];
  let clusterEnd = 0;
  let clusterCols: number[] = [];

  for (const appt of sorted) {
    const start = new Date(appt.scheduledStart).getTime();
    const end   = new Date(appt.scheduledEnd).getTime();
    if (start >= clusterEnd) { clusterCols = []; clusterEnd = 0; }
    let col = clusterCols.findIndex(e => start >= e);
    if (col === -1) { col = clusterCols.length; clusterCols.push(end); }
    else clusterCols[col] = end;
    clusterEnd = Math.max(clusterEnd, end);
    result.push({ appt, col, totalCols: 0 });
  }

  // second pass: set totalCols per cluster
  let i = 0;
  while (i < result.length) {
    let maxEnd = new Date(result[i].appt.scheduledEnd).getTime();
    let j = i;
    while (j < result.length && new Date(result[j].appt.scheduledStart).getTime() < maxEnd) {
      maxEnd = Math.max(maxEnd, new Date(result[j].appt.scheduledEnd).getTime());
      j++;
    }
    const maxCol = Math.max(...result.slice(i, j).map(r => r.col)) + 1;
    for (let k = i; k < j; k++) result[k].totalCols = maxCol;
    i = j;
  }
  return result;
}

// ── Types ────────────────────────────────────────────────────────────────────
type Appt = {
  id: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  workflowState: string;
  status: string;
  serviceType: string;
  notes: string | null;
  price: string | null;
  staffId: number | null;
  clientId: number;
  petId: number;
  membershipId: number | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientPhone: string | null;
  clientEmail?: string | null;
  petName: string | null;
  petBreed: string | null;
  staffName: string | null;
  staffColour: string | null;
  sessionId: string | null;
  nextAppointmentDate?: Date | null;
  lastAppointmentDate?: Date | null;
  reminderStatus?: string | null;
};

// ── Shared time-grid appointment card ────────────────────────────────────────
function ApptBlock({
  appt,
  col,
  totalCols,
  containerHeight,
  onClick,
  onDragStart,
  onDragEnd,
  siblings,
}: {
  appt: Appt;
  col: number;
  totalCols: number;
  containerHeight: number;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent, appt: Appt) => void;
  onDragEnd?: () => void;
  siblings?: Appt[];
}) {
  const start = toAESTDate(new Date(appt.scheduledStart));
  const top    = timeToTop(start);
  const durationMins = Math.max(
    (new Date(appt.scheduledEnd).getTime() - new Date(appt.scheduledStart).getTime()) / 60000,
    30
  );
  const height = Math.max((durationMins / 60) * HOUR_HEIGHT - 2, 22);
  const svc = SERVICE_COLOURS[appt.serviceType] ?? SERVICE_COLOURS.other;
  const widthPct  = 100 / totalCols;
  const leftPct   = col * widthPct;
  const compact   = height < 44;
  const showService = height >= 58;
  const isCancelled = appt.status === "cancelled" || appt.workflowState === "cancelled";
  const canDrag = Boolean(onDragStart) && !isCancelled;

  if (top > containerHeight || top + height < 0) return null;

  const wfLabel = appt.workflowState.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const sharedPetAppointments = (siblings && siblings.length > 0 ? [appt, ...siblings] : [appt])
    .sort((left, right) => left.id - right.id);
  const sharedAppointmentLabel = formatSharedAppointmentName({
    petNames: sharedPetAppointments.map((pet) => pet.petName),
    surname: appt.clientLastName,
  });
  const sharedPriceBreakdown = siblings && siblings.length > 0
    ? buildSharedAppointmentPriceBreakdown([appt, ...siblings])
    : [];
  const storedSharedPrices = sharedPriceBreakdown.filter((entry) => entry.formattedAmount);
  const retainedBookingTotal = storedSharedPrices.length === 1
    ? storedSharedPrices[0].formattedAmount
    : sharedPriceBreakdown[0]?.formattedTotal ?? null;

  const block = (
    <div
      draggable={canDrag}
      className={`absolute rounded-md text-[11px] group overflow-hidden select-none border border-white/80 transition-[transform,box-shadow,filter] duration-200 ease-out ${isCancelled ? "cursor-default opacity-95" : "cursor-grab active:cursor-grabbing hover:-translate-y-px hover:z-20 hover:shadow-lg hover:saturate-110"}`}
      style={{
        top,
        height,
        left:  `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
        background: isCancelled ? "linear-gradient(135deg, #fee2e2 0%, #fff7f7 180%)" : `linear-gradient(135deg, ${svc.bg} 0%, #ffffff 180%)`,
        borderLeft: `4px solid ${isCancelled ? "#dc2626" : svc.border}`,
        boxShadow: isCancelled ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px #dc2626" : `inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px ${svc.border}`,
        zIndex: 2,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onDragStart={canDrag && onDragStart ? (e) => onDragStart(e, appt) : undefined}
      onDragEnd={onDragEnd}
      aria-label={`${isCancelled ? "Cancelled " : ""}appointment for ${sharedAppointmentLabel || "pet"}`}
    >
      <div className="px-2 py-1 h-full overflow-hidden leading-tight">
        {isCancelled && <div className="mb-1 inline-flex rounded-sm bg-red-700 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white">Cancelled</div>}
        {siblings && siblings.length > 0 ? (
          <>
            <div className={`font-bold text-[12px] leading-tight tracking-[-0.01em] ${isCancelled ? "line-through decoration-2 decoration-red-700" : ""}`} style={{ color: isCancelled ? "#991b1b" : svc.border }}>
              <div className="leading-tight" title={sharedAppointmentLabel}>{sharedAppointmentLabel}</div>
              {appt.reminderStatus === "delivered" && <CheckCircle2 aria-label="Reminder delivered" className="inline ml-1 h-3 w-3 text-emerald-600" />}
            </div>
            {!compact && <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text }}>{sharedPetAppointments.length} dogs · family booking</div>}
            {!compact && (
              <div className="truncate text-[10px] mt-0.5 font-medium" style={{ color: isCancelled ? "#991b1b" : svc.text }}>
                {fmtTime(new Date(appt.scheduledStart))} – {fmtTime(new Date(appt.scheduledEnd))}
              </div>
            )}
            {showService && <div className="mt-1 inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text, backgroundColor: "rgba(255,255,255,0.72)" }}>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</div>}
          </>
        ) : (
          <>
            <div className={`font-bold text-[12px] truncate tracking-[-0.01em] ${isCancelled ? "line-through decoration-2 decoration-red-700" : ""}`} style={{ color: isCancelled ? "#991b1b" : svc.border }}>
              {appt.petName}{appt.clientLastName ? ` ${appt.clientLastName}` : ""}
              {appt.reminderStatus === "delivered" && <CheckCircle2 aria-label="Reminder delivered" className="inline ml-1 h-3 w-3 text-emerald-600" />}
            </div>
            {!compact && (
              <>
                <div className="truncate text-[10px] mt-0.5 font-medium" style={{ color: isCancelled ? "#991b1b" : svc.text }}>
                  {fmtTime(new Date(appt.scheduledStart))} – {fmtTime(new Date(appt.scheduledEnd))}
                </div>
                {showService && <div className="mt-1 inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text, backgroundColor: "rgba(255,255,255,0.72)" }}>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</div>}
                {appt.nextAppointmentDate && (
                  <div className="truncate text-[10px] mt-0.5 font-medium" style={{ color: svc.border, opacity: 0.9 }}>
                    Next: {new Date(appt.nextAppointmentDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="absolute top-1 right-1 rounded-full bg-white/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Pencil className="h-2.5 w-2.5" style={{ color: svc.border }} />
      </div>
    </div>
  );

  if (!onDragStart) return block;

  return (
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>{block}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px] text-xs space-y-1 p-3">
        <div className="font-semibold text-sm">{sharedAppointmentLabel}</div>
        {appt.petBreed && <div className="text-muted-foreground">{appt.petBreed}</div>}
          <div className="border-t pt-1 mt-1 space-y-0.5">
          <div><span className="text-muted-foreground">Client: </span>{appt.clientFirstName} {appt.clientLastName}</div>
          {appt.clientPhone && <div><span className="text-muted-foreground">Phone: </span>{appt.clientPhone}</div>}
          <div><span className="text-muted-foreground">Service: </span>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</div>
          <div><span className="text-muted-foreground">Status: </span>{wfLabel}</div>
          {sharedPriceBreakdown.length > 0 ? (
            <div className="border-t pt-1 mt-1 space-y-0.5">
              <div className="text-muted-foreground font-medium">Shared appointment pricing</div>
              {sharedPriceBreakdown.map((entry, index) => <div key={`${entry.petName}-${index}`} className="flex justify-between gap-4"><span>{entry.petName}</span><span className={entry.formattedAmount ? "font-medium" : retainedBookingTotal ? "text-emerald-700" : "text-amber-700"}>{entry.formattedAmount ?? (retainedBookingTotal ? "Included in booking total" : "Price to confirm")}</span></div>)}
              <div className="flex justify-between gap-4 border-t pt-1 mt-1 font-semibold"><span>Booking total</span><span>{retainedBookingTotal ?? "Confirm each price"}</span></div>
            </div>
          ) : appt.price && <div><span className="text-muted-foreground">Price: </span>${Number(appt.price).toFixed(2)}</div>}
          {appt.lastAppointmentDate && <div><span className="text-muted-foreground">Last appt: </span>{new Date(appt.lastAppointmentDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>}
          {appt.nextAppointmentDate && <div><span className="text-muted-foreground">Next appt: </span>{new Date(appt.nextAppointmentDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>}
          {appt.reminderStatus === "delivered" && <div className="text-emerald-700"><span className="text-muted-foreground">Reminder: </span>Delivered</div>}
          {appt.reminderStatus === "sent" && <div className="text-amber-700"><span className="text-muted-foreground">Reminder: </span>Sent; awaiting delivery update</div>}
        </div>
        <div className="text-muted-foreground text-[10px] pt-0.5">
          {fmtTime(new Date(appt.scheduledStart))} – {fmtTime(new Date(appt.scheduledEnd))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Shared time-gutter + grid lines ──────────────────────────────────────────
function TimeGutter() {
  return (
    <>
      {HOURS.map(hour => (
        <div
          key={hour}
          className="absolute left-0 flex items-start justify-end pr-2"
          style={{ top: (hour - 7) * HOUR_HEIGHT, height: HOUR_HEIGHT, width: TIME_COL_W }}
        >
          <span className="text-[11px] text-muted-foreground -mt-2">
            {hour === 12 ? "12pm" : hour < 12 ? `${hour}am` : `${hour - 12}pm`}
          </span>
        </div>
      ))}
    </>
  );
}

function GridLines({ cols }: { cols: number }) {
  return (
    <>
      {HOURS.map(hour => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border/50"
          style={{ top: (hour - 7) * HOUR_HEIGHT, gridColumn: `1 / -1` }}
        />
      ))}
    </>
  );
}

// ── Current time indicator ────────────────────────────────────────────────────
function NowLine({ totalGridWidth }: { totalGridWidth: number }) {
  const now = toAESTDate(new Date());
  const top = timeToTop(now);
  if (top < 0 || top > HOURS.length * HOUR_HEIGHT) return null;
  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top }}
    >
      <div className="h-px bg-red-500 w-full" />
      <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
    </div>
  );
}


// ── Grooming Report Panel (per pet per appointment) ────────────────────────────
const MOOD_OPTIONS = ["Happy 😊", "Well behaved 💕", "Restless 🚀", "A little shy 🐿️", "Talkative 🦜", "Anxious 😟", "Spicy 🔥", "Bitey"];
const RATING_LABELS: Record<string, string> = { pawfect: "Absolutely pawfect 🐾", great: "Great session", good: "Good", okay: "Okay", difficult: "Difficult" };
const CONDITION_LABELS: Record<string, string> = { excellent: "Excellent", good: "Good", fair: "Fair", poor: "Poor", matted: "Matted", irritated: "Irritated", flaky: "Flaky", bright_clear: "Bright & clear", mild_discharge: "Mild discharge", needs_vet: "Needs vet", clean: "Clean", mild_buildup: "Mild buildup", dirty: "Dirty", trimmed: "Trimmed", long: "Long", very_long: "Very long", broken: "Broken", mild_tartar: "Mild tartar", heavy_tartar: "Heavy tartar" };

type ReportSnapshot = {
  rating: string; moods: string[]; note: string;
  coat: string; skin: string; eyes: string; ears: string; nails: string; teeth: string;
  freqWeeks: string; groomerNotes: string;
};

function GroomingReportPanel({ appt, onCopyToAll, copyFrom, onCopyApplied }: {
  appt: Appt;
  onCopyToAll?: (snap: ReportSnapshot) => void;
  copyFrom?: ReportSnapshot | null;
  onCopyApplied?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: existing } = trpc.groomingReports.getByAppointment.useQuery({ appointmentId: appt.id });
  const upsert = trpc.groomingReports.upsert.useMutation({
    onSuccess: () => { toast.success("Grooming report saved"); utils.groomingReports.getByAppointment.invalidate({ appointmentId: appt.id }); },
    onError: (e) => toast.error(e.message),
  });
  const emailReport = trpc.groomingReports.emailReport.useMutation({
    onSuccess: () => {
      toast.success(`Grooming Card sent to ${appt.clientEmail}`);
      utils.groomingReports.getByAppointment.invalidate({ appointmentId: appt.id });
    },
    onError: (e) => toast.error(e.message),
  });
  const [rating, setRating] = useState<string>("good");
  const [moods, setMoods] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [coat, setCoat] = useState("");
  const [skin, setSkin] = useState("");
  const [eyes, setEyes] = useState("");
  const [ears, setEars] = useState("");
  const [nails, setNails] = useState("");
  const [teeth, setTeeth] = useState("");
  const [freqWeeks, setFreqWeeks] = useState("");
  const [beforePhotoUrl, setBeforePhotoUrl] = useState("");
  const [beforePhotoKey, setBeforePhotoKey] = useState("");
  const [afterPhotoUrl, setAfterPhotoUrl] = useState("");
  const [afterPhotoKey, setAfterPhotoKey] = useState("");
  const [photoUploading, setPhotoUploading] = useState<"before" | "after" | null>(null);
  const [groomerNotes, setGroomerNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Apply Copy to All when a snapshot arrives from a sibling
  useEffect(() => {
    if (copyFrom) {
      setRating(copyFrom.rating);
      setMoods(copyFrom.moods);
      setNote(copyFrom.note);
      setCoat(copyFrom.coat);
      setSkin(copyFrom.skin);
      setEyes(copyFrom.eyes);
      setEars(copyFrom.ears);
      setNails(copyFrom.nails);
      setTeeth(copyFrom.teeth);
      setFreqWeeks(copyFrom.freqWeeks);
      setGroomerNotes(copyFrom.groomerNotes);
      onCopyApplied?.();
      toast.success(`Copied to ${appt.petName}`);
    }
  }, [copyFrom]);

  useEffect(() => {
    if (existing) {
      setRating(existing.overallRating ?? "good");
      setMoods(existing.mood ? existing.mood.split(",").filter(Boolean) : []);
      setNote(existing.additionalNote ?? "");
      setCoat(existing.coatCondition ?? "");
      setSkin(existing.skinCondition ?? "");
      setEyes(existing.eyeCondition ?? "");
      setEars(existing.earCondition ?? "");
      setNails(existing.nailCondition ?? "");
      setTeeth(existing.teethCondition ?? "");
      setFreqWeeks(existing.recommendedFrequencyWeeks ? String(existing.recommendedFrequencyWeeks) : "");
      setGroomerNotes((existing as any).groomerNotes ?? "");
      setBeforePhotoUrl(existing.beforePhotoUrl ?? "");
      setBeforePhotoKey(existing.beforePhotoKey ?? "");
      setAfterPhotoUrl(existing.afterPhotoUrl ?? "");
      setAfterPhotoKey(existing.afterPhotoKey ?? "");
    }
  }, [existing]);

  const uploadPhoto = async (file: File, slot: "before" | "after") => {
    setPhotoUploading(slot);
    try {
      const resp = await fetch("/api/upload/grooming-report-photo", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        credentials: "include",
      });
      if (!resp.ok) throw new Error(await resp.text());
      const { url, key } = await resp.json();
      if (slot === "before") { setBeforePhotoUrl(url); setBeforePhotoKey(key); }
      else { setAfterPhotoUrl(url); setAfterPhotoKey(key); }
      toast.success(`${slot === "before" ? "Before" : "After"} photo uploaded`);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setPhotoUploading(null);
    }
  };

  const handleSave = (status: "draft" | "sent") => {
    upsert.mutate({
      appointmentId: appt.id, petId: appt.petId, tenantId: 1,
      overallRating: rating as "pawfect" | "great" | "good" | "okay" | "difficult",
      mood: moods.join(","), additionalNote: note || undefined,
      groomerNotes: groomerNotes || undefined,
      coatCondition: coat as "excellent" | "good" | "fair" | "poor" | "matted" || undefined,
      skinCondition: skin as "excellent" | "good" | "fair" | "irritated" | "flaky" || undefined,
      eyeCondition: eyes as "bright_clear" | "mild_discharge" | "needs_vet" || undefined,
      earCondition: ears as "clean" | "mild_buildup" | "dirty" | "needs_vet" || undefined,
      nailCondition: nails as "trimmed" | "long" | "very_long" | "broken" || undefined,
      teethCondition: teeth as "clean" | "mild_tartar" | "heavy_tartar" | "needs_vet" || undefined,
      recommendedFrequencyWeeks: freqWeeks ? parseInt(freqWeeks) : undefined,
      beforePhotoUrl: beforePhotoUrl || undefined,
      beforePhotoKey: beforePhotoKey || undefined,
      afterPhotoUrl: afterPhotoUrl || undefined,
      afterPhotoKey: afterPhotoKey || undefined,
      status,
    });
  };

  const reportPhotoSrc = (key: string, url: string) => key
    ? `/api/grooming-report-photo?key=${encodeURIComponent(key)}`
    : url;
  const escapeHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const buildCardMarkup = () => {
    const conditionRows = ([
      ["Coat", coat], ["Skin", skin], ["Eyes", eyes], ["Ears", ears], ["Nails", nails], ["Teeth", teeth],
    ] as [string, string][]).filter(([, v]) => v).map(([label, val]) =>
      `<tr><td style="padding:5px 0;color:#64748b;font-size:12px;width:88px">${label}</td><td style="padding:5px 0;font-size:12px;font-weight:600">${escapeHtml(CONDITION_LABELS[val] ?? val)}</td></tr>`
    ).join("");
    const toAbsUrl = (url: string) => url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const photoSection = (beforePhotoUrl || afterPhotoUrl) ? `
      <div style="display:flex;gap:12px;margin:20px 0">
        ${beforePhotoUrl ? `<div style="flex:1"><div style="font-size:10px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:0 0 6px">BEFORE</div><img src="${toAbsUrl(reportPhotoSrc(beforePhotoKey, beforePhotoUrl))}" style="width:100%;border-radius:12px;object-fit:cover;max-height:190px;border:1px solid #e2e8f0" /></div>` : ""}
        ${afterPhotoUrl ? `<div style="flex:1"><div style="font-size:10px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:0 0 6px">AFTER</div><img src="${toAbsUrl(reportPhotoSrc(afterPhotoKey, afterPhotoUrl))}" style="width:100%;border-radius:12px;object-fit:cover;max-height:190px;border:1px solid #e2e8f0" /></div>` : ""}
      </div>` : "";
    const serviceLabel = SERVICE_LABELS[appt.serviceType] ?? appt.serviceType.replace(/_/g, " ");
    return `<div style="font-family:Arial,sans-serif;color:#172033;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#0f766e,#14b8a6);padding:24px 28px;border-radius:18px;color:#fff">
        <div style="font-size:11px;letter-spacing:.12em;font-weight:700;opacity:.82">BARKIN BEAUTIFUL</div>
        <div style="font-size:27px;font-weight:800;margin-top:8px">${escapeHtml(appt.petName ?? "Your pet")}'s Grooming Card</div>
        <div style="font-size:13px;opacity:.9;margin-top:5px">${escapeHtml(new Date(appt.scheduledStart).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · Groomed by ${escapeHtml(appt.staffName ?? "your Groomigo groomer")}</div>
      </div>
      <div style="padding:24px 6px">
        <div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin-bottom:6px">TODAY'S SERVICE</div>
        <div style="font-size:17px;font-weight:800;color:#172033">${escapeHtml(serviceLabel)}</div>
        ${photoSection}
        <div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">OVERALL</div>
        <div style="font-size:18px;font-weight:800;color:#0f766e">${escapeHtml(RATING_LABELS[rating] ?? rating)}</div>
        ${moods.length ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">MOOD</div><div>${moods.map(m => `<span style="display:inline-block;background:#ecfdf5;border-radius:999px;padding:5px 10px;font-size:12px;margin:0 5px 5px 0;color:#115e59">${escapeHtml(m)}</span>`).join("")}</div>` : ""}
        ${note ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">A NOTE FROM YOUR GROOMER</div><div style="background:#f8fafc;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(note)}</div>` : ""}
        ${conditionRows ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">WE CHECKED</div><table style="width:100%;border-collapse:collapse">${conditionRows}</table>` : ""}
        ${freqWeeks ? `<div style="background:#ecfdf5;border-radius:12px;padding:13px 14px;margin-top:20px"><div style="font-size:10px;letter-spacing:.1em;color:#0f766e;font-weight:700">RECOMMENDED FREQUENCY</div><div style="font-size:16px;color:#115e59;font-weight:800;margin-top:3px">Every ${escapeHtml(freqWeeks)} weeks</div></div>` : ""}
        ${groomerNotes ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">GROOMER NOTES</div><div style="font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(groomerNotes)}</div>` : ""}
        <div style="border-top:1px solid #e2e8f0;margin-top:28px;padding-top:14px;font-size:10px;color:#94a3b8">This grooming card does not constitute veterinary advice. Please contact a veterinarian for professional health guidance.</div>
      </div>
    </div>`;
  };
  const buildHtml = () => {
    return `<!DOCTYPE html><html><head><title>Grooming Report — ${appt.petName}</title>
      <style>body{font-family:Arial,sans-serif;margin:28px;background:#fff}@media print{body{margin:14px}}</style>
      </head><body>${buildCardMarkup()}</body></html>`;
  };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (w) { w.document.write(buildHtml()); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
  };

  const handleEmailCard = () => {
    if (!appt.clientEmail) { toast.error("Add a client email address before sending this Grooming Card"); return; }
    if (!window.confirm(`Send ${appt.petName}'s reviewed Grooming Card to ${appt.clientEmail}?`)) return;
    emailReport.mutate({
      appointmentId: appt.id,
      reportHtml: buildCardMarkup(),
      petName: appt.petName ?? "your pet",
      clientEmail: appt.clientEmail,
      clientName: [appt.clientFirstName, appt.clientLastName].filter(Boolean).join(" ") || "there",
    });
  };

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-card">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">{(appt.petName ?? "?")[0]}</div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Grooming Card</div>
            <div className="font-semibold text-sm truncate">{appt.petName}</div>
            {appt.petBreed && <div className="text-xs text-muted-foreground truncate">{appt.petBreed}</div>}
            <div className="text-xs text-muted-foreground truncate">Groomed by <span className="font-medium text-foreground">{appt.staffName ?? "Groomer to confirm"}</span></div>
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {existing?.status === "sent" && <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 whitespace-nowrap">Sent</span>}
            {existing?.status === "draft" && <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 whitespace-nowrap">Draft</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {onCopyToAll && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-primary border-primary/30" onClick={() => onCopyToAll({ rating, moods, note, coat, skin, eyes, ears, nails, teeth, freqWeeks, groomerNotes })}>
              Copy to all
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowPreview(true)}>
            <Printer className="h-3 w-3" /> Preview
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handlePrint}>
            <FileDown className="h-3 w-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleEmailCard} disabled={emailReport.isPending || !appt.clientEmail} title={appt.clientEmail ? "Review and manually send to the saved client email" : "Client email required"}>
            <Mail className="h-3 w-3" /> {emailReport.isPending ? "Sending..." : "Email card"}
          </Button>
        </div>
      </div>

      {/* Before / After photos */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Showcase photos</Label>
        <div className="grid grid-cols-2 gap-3">
          {(["before", "after"] as const).map(slot => {
            const url = slot === "before" ? beforePhotoUrl : afterPhotoUrl;
            return (
              <div key={slot} className="space-y-1">
                <Label className="text-xs capitalize">{slot}</Label>
                {url ? (
                  <div className="relative group">
                    <img src={reportPhotoSrc(slot === "before" ? beforePhotoKey : afterPhotoKey, url)} alt={slot} className="w-full h-20 object-cover rounded-lg border" />
                    <button
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => slot === "before" ? (setBeforePhotoUrl(""), setBeforePhotoKey("")) : (setAfterPhotoUrl(""), setAfterPhotoKey(""))}
                    ><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors text-muted-foreground hover:text-primary">
                    {photoUploading === slot ? (
                      <span className="text-xs">Uploading...</span>
                    ) : (
                      <><ImagePlus className="h-5 w-5 mb-1" /><span className="text-xs">Drop image here</span></>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, slot); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rating */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How did it go?</Label>
        <Select value={rating} onValueChange={setRating}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(RATING_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Mood */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mood</Label>
        <div className="grid grid-cols-2 gap-1">
          {MOOD_OPTIONS.map(m => (
            <button key={m} type="button"
              onClick={() => setMoods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
              className={["px-2 py-1 rounded-full text-xs border transition-all text-left truncate", moods.includes(m) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"].join(" ")}>{m}</button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional note</Label>
        <Textarea rows={2} placeholder="e.g. You can tell from the wagging tail!" value={note} onChange={e => setNote(e.target.value)} className="text-sm" />
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pet conditions</Label>
        <div className="grid grid-cols-1 gap-2">
          {([
            ["Coat", coat, setCoat, ["excellent","good","fair","poor","matted"]],
            ["Skin", skin, setSkin, ["excellent","good","fair","irritated","flaky"]],
            ["Eyes", eyes, setEyes, ["bright_clear","mild_discharge","needs_vet"]],
            ["Ears", ears, setEars, ["clean","mild_buildup","dirty","needs_vet"]],
            ["Nails", nails, setNails, ["trimmed","long","very_long","broken"]],
            ["Teeth", teeth, setTeeth, ["clean","mild_tartar","heavy_tartar","needs_vet"]],
          ] as [string, string, (v: string) => void, string[]][]).map(([label, val, setter, opts]) => (
            <div key={label} className="flex items-center gap-2">
              <Label className="text-xs w-10 shrink-0">{label}</Label>
              <Select value={val || "__none__"} onValueChange={v => setter(v === "__none__" ? "" : v)}>
                <SelectTrigger className="text-xs h-7 flex-1"><SelectValue placeholder="Not assessed" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">Not assessed</SelectItem>{opts.map(o => <SelectItem key={o} value={o}>{CONDITION_LABELS[o] ?? o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Frequency */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended frequency</Label>
        <Select value={freqWeeks || "__none__"} onValueChange={v => setFreqWeeks(v === "__none__" ? "" : v)}>
          <SelectTrigger className="text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent><SelectItem value="__none__">Not specified</SelectItem>{[2,4,6,8,10,12].map(w => <SelectItem key={w} value={String(w)}>Every {w} weeks</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Groomer Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groomer notes</Label>
        <Textarea rows={3} placeholder="Any additional observations, special handling notes, or comments for next visit..." value={groomerNotes} onChange={e => setGroomerNotes(e.target.value)} className="text-sm" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={upsert.isPending} className="flex-1">Save draft</Button>
        <Button size="sm" onClick={() => handleSave("sent")} disabled={upsert.isPending} className="flex-1">{upsert.isPending ? "Saving..." : "Mark as sent"}</Button>
      </div>

      {/* PDF Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[680px] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">Preview — {appt.petName}'s Grooming Report</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={handlePrint} className="gap-1.5"><FileDown className="h-3.5 w-3.5" /> Download PDF</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <iframe
              className="flex-1 w-full rounded-b-xl"
              srcDoc={buildHtml()}
              title="Grooming Report Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main Component ────────────────────────────────────────────────────────────
export default function Calendar() {
  const [weekStart, setWeekStart]   = useState(() => getWeekStart(getTodayAEST()));
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [editAppt, setEditAppt]     = useState<Appt | null>(null);
  const [copySnap, setCopySnap]     = useState<ReportSnapshot | null>(null);
  const [viewMode, setViewMode]     = useState<"week" | "day">("day");
  const [dayDate, setDayDate]       = useState(() => getTodayAEST());
  const [visibleStaffIds, setVisibleStaffIds] = useState<number[] | null>(null);
  const [apptSearchOpen, setApptSearchOpen] = useState(false);
  const [apptSearchTerm, setApptSearchTerm] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBlockoutDialog, setShowBlockoutDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "blockout" | "styleNote" | "appointment"; id: number; label: string } | null>(null);
  const [blockoutForm, setBlockoutForm] = useState({
    staffId: "",
    blockoutDate: "",
    isFullDay: true,
    startTime: "09:00",
    endTime: "17:00",
    reason: "",
  });

  // Drag-and-drop state
  const dragApptRef = useRef<Appt | null>(null);
  const dragOffsetY  = useRef<number>(0); // px offset within the block where drag started
  const [dragTarget, setDragTarget] = useState<{ staffId: number | null; startMinutes: number; durationMinutes: number } | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, appt: Appt) => {
    dragApptRef.current = appt;
    setDragTarget(null);
    // Calculate offset: how far down in the block the user grabbed
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffsetY.current = e.clientY - rect.top;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(appt.id));
  }, []);

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [viewMode, dayDate, weekStart]);

  const [newAppt, setNewAppt] = useState({
    clientId: "", petIds: [] as string[], staffId: "", serviceType: "classic_groom",
    scheduledStart: "", scheduledEnd: "", notes: "", price: "",
  });
  const [editForm, setEditForm] = useState({
    staffId: "", serviceType: "", scheduledStart: "", scheduledEnd: "",
    notes: "", price: "", workflowState: "",
  });
  const preservesCancelledSchedule = editAppt?.status === "cancelled" || editAppt?.workflowState === "cancelled" || editForm.workflowState === "cancelled";
  // Per-pet groomer overrides for multi-pet sessions: { [appointmentId]: staffId }
  const [siblingGroomers, setSiblingGroomers] = useState<Record<number, string>>({});
  const [styleNoteForm, setStyleNoteForm] = useState({
    note: "", serviceType: "", bladeSize: "", combSize: "", bodyLength: "", headStyle: "", faceStyle: "", earStyle: "", legStyle: "", tailStyle: "", warnings: "", alertLevel: "", photoUrl: "", photoKey: "",
  });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedStylePetId, setSelectedStylePetId] = useState<number | null>(null);
  const [additionalFamilyPetIds, setAdditionalFamilyPetIds] = useState<number[]>([]);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d;
  }, [weekStart]);
  const dayFrom = useMemo(() => { const d = new Date(dayDate); d.setHours(0,0,0,0); return d; }, [dayDate]);
  const dayTo   = useMemo(() => { const d = new Date(dayDate); d.setHours(23,59,59,999); return d; }, [dayDate]);

  const queryFrom = useMemo(() => {
    const d = new Date(viewMode === "week" ? weekStart : dayFrom);
    d.setDate(d.getDate() - 1); return d;
  }, [viewMode, weekStart, dayFrom]);
  const queryTo = useMemo(() => {
    const d = new Date(viewMode === "week" ? weekEnd : dayTo);
    d.setDate(d.getDate() + 1); return d;
  }, [viewMode, weekEnd, dayTo]);

  const { data: blockouts, refetch: refetchBlockouts } = trpc.staff.listBlockouts.useQuery({
    tenantId: 1,
    dateFrom: queryFrom.toISOString(),
    dateTo: queryTo.toISOString(),
  });
  const createBlockoutMutation = trpc.staff.createBlockout.useMutation({
    onSuccess: () => {
      toast.success("Blockout created");
      setShowBlockoutDialog(false);
      setBlockoutForm({ staffId: "", blockoutDate: "", isFullDay: true, startTime: "09:00", endTime: "17:00", reason: "" });
      refetchBlockouts();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteBlockoutMutation = trpc.staff.deleteBlockout.useMutation({
    onSuccess: () => { toast.success("Blockout removed"); refetchBlockouts(); },
    onError: (e) => toast.error(e.message),
  });

  const styleNotes = trpc.groomNotes.listByPet.useQuery(
    { petId: selectedStylePetId ?? editAppt?.petId ?? 0 },
    { enabled: !!(selectedStylePetId ?? editAppt?.petId) }
  );
  const lastCompletedStyle = trpc.groomNotes.getLastCompletedStyle.useQuery(
    { petId: selectedStylePetId ?? editAppt?.petId ?? 0 },
    { enabled: !!(selectedStylePetId ?? editAppt?.petId) }
  );
  const sessionReports = trpc.groomingReports.getSessionReports.useQuery(
    { sessionId: editAppt?.sessionId ?? "" },
    { enabled: !!editAppt?.sessionId }
  );
  // Map appointmentId -> report status for quick lookup
  const reportStatusMap = useMemo(() => {
    const map: Record<number, "draft" | "sent" | null> = {};
    for (const r of sessionReports.data ?? []) {
      if (r.appointmentId) map[r.appointmentId] = r.status as "draft" | "sent" | null;
    }
    return map;
  }, [sessionReports.data]);
  const createStyleNote = trpc.groomNotes.create.useMutation({
    onSuccess: () => {
      toast.success("Style note saved");
      setStyleNoteForm({ note: "", serviceType: "", bladeSize: "", combSize: "", bodyLength: "", headStyle: "", faceStyle: "", earStyle: "", legStyle: "", tailStyle: "", warnings: "", alertLevel: "", photoUrl: "", photoKey: "" });
      setPhotoPreview(null);
      styleNotes.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteStyleNote = trpc.groomNotes.delete.useMutation({
    onSuccess: () => { styleNotes.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const loadLastCompletedStyle = () => {
    const last = lastCompletedStyle.data;
    if (!last) { toast.error("No completed groom style found"); return; }
    setStyleNoteForm({
      note: last.note ?? "",
      serviceType: last.serviceType ?? "",
      bladeSize: last.bladeSize ?? "",
      combSize: last.combSize ?? "",
      bodyLength: last.bodyLength ?? "",
      headStyle: last.headStyle ?? "",
      faceStyle: last.faceStyle ?? "",
      earStyle: last.earStyle ?? "",
      legStyle: last.legStyle ?? "",
      tailStyle: last.tailStyle ?? "",
      warnings: last.warnings ?? "",
      alertLevel: last.alertLevel ?? "",
      photoUrl: last.photoUrl ?? "",
      photoKey: "",
    });
    setPhotoPreview(last.photoUrl ?? null);
    toast.success("Last completed style loaded. Review and save as a new style when ready.");
  };

  const { data: weekAppts, refetch } = trpc.calendar.getAppointments.useQuery({
    tenantId: 1,
    dateFrom: queryFrom.toISOString(),
    dateTo:   queryTo.toISOString(),
  });

  const { data: apptSearchResults, isFetching: isApptSearchFetching } = trpc.calendar.searchAppointments.useQuery(
    { tenantId: 1, query: apptSearchTerm },
    { enabled: apptSearchTerm.trim().length >= 2 },
  );

  const jumpToAppointment = (scheduledStart: string | Date) => {
    // Don't use setHours(0,0,0,0) here — that computes midnight in whatever
    // timezone the browser's system clock happens to be set to, which can
    // silently land on the wrong calendar day if it isn't set to Brisbane.
    // Instead, work out the correct Brisbane calendar date first (the same
    // safe conversion used everywhere else in this file), then build a
    // plain local midnight Date from those exact year/month/day numbers.
    const aest = toAESTDate(new Date(scheduledStart));
    const target = new Date(aest.getUTCFullYear(), aest.getUTCMonth(), aest.getUTCDate());
    setDayDate(target);
    setViewMode("day");
    setWeekStart(getWeekStart(target));
    setApptSearchOpen(false);
    setApptSearchTerm("");
  };

  const { data: staffList }  = trpc.staff.listOperational.useQuery({ tenantId: 1 });
  const editableAppointmentPets = trpc.pets.listByClient.useQuery(
    { clientId: editAppt?.clientId ?? 0 },
    { enabled: !!editAppt?.clientId },
  );
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const {
    data: clientSearchResults,
    isFetching: isClientSearchFetching,
    isError: isClientSearchError,
  } = trpc.memberships.searchClients.useQuery(
    { tenantId: 1, search: clientSearch },
    { enabled: clientSearch.length >= 1 }
  );
  type ClientOption = {
    clientId: number;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    pets: Array<{ petId: number | null; petName: string | null; petBreed: string | null }>;
  };
  // Group search results by client, collecting all pets per client
  const clientSearchOptions = useMemo((): ClientOption[] => {
    if (!clientSearchResults) return [];
    const map = new Map<number, ClientOption>();
    for (const r of clientSearchResults) {
      if (!map.has(r.clientId)) {
        map.set(r.clientId, {
          clientId: r.clientId,
          firstName: r.firstName,
          lastName: r.lastName,
          phone: r.phone,
          pets: [],
        });
      }
      if (r.petId) {
        const entry = map.get(r.clientId)!;
        if (!entry.pets.find((p: ClientOption['pets'][0]) => p.petId === r.petId)) {
          entry.pets.push({ petId: r.petId, petName: r.petName, petBreed: r.petBreed });
        }
      }
    }
    return Array.from(map.values());
  }, [clientSearchResults]);
  const { data: tenantInfo } = trpc.settings.getTenantInfo.useQuery({ tenantId: 1 });

  const createMutation = trpc.calendar.createAppointment.useMutation({
    onSuccess: () => {
      toast.success("Appointment created");
      setShowNewAppt(false);
      setNewAppt({ clientId: "", petIds: [], staffId: "", serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "" });
      setClientSearch("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const rescheduleMutation = trpc.calendar.reschedule.useMutation({
    onSuccess: () => { toast.success("Appointment updated"); setEditAppt(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateDetailsMutation = trpc.calendar.updateDetails.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const addPetsToSharedAppointmentMutation = trpc.calendar.addPetsToSharedAppointment.useMutation({
    onSuccess: ({ added }) => {
      toast.success(added > 0 ? `${added} family ${added === 1 ? "dog" : "dogs"} added to this booking` : "Those dogs are already in this booking");
      setAdditionalFamilyPetIds([]);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const workflowMutation = trpc.calendar.updateWorkflowState.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const undoDeleteAppointmentMutation = trpc.calendar.undoDeleteAppointment.useMutation({
    onSuccess: ({ restored }) => {
      toast.success(`${restored} appointment${restored === 1 ? "" : "s"} restored`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteAppointmentMutation = trpc.calendar.deleteAppointment.useMutation({
    onSuccess: ({ deleted, undoToken }) => {
      toast.success(`${deleted} appointment${deleted === 1 ? "" : "s"} deleted`, {
        duration: 30_000,
        action: {
          label: "Undo",
          onClick: () => undoDeleteAppointmentMutation.mutate({ undoToken }),
        },
      });
      setConfirmDelete(null);
      setEditAppt(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resolveDragTarget = useCallback((e: React.DragEvent, targetStaffId: number | null) => {
    const appt = dragApptRef.current;
    if (!appt) return null;
    const colEl = e.currentTarget as HTMLElement;
    const rect = colEl.getBoundingClientRect();
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const startMinutes = buildCalendarDragTargetMinutes({
      clientY: e.clientY,
      columnTop: rect.top,
      scrollTop,
      grabOffsetY: dragOffsetY.current,
      hourHeight: HOUR_HEIGHT,
      latestStartMinutes: (HOURS.length - 1) * 60,
    });
    const durationMinutes = Math.max(15, Math.round((new Date(appt.scheduledEnd).getTime() - new Date(appt.scheduledStart).getTime()) / 60_000));
    return { staffId: targetStaffId, startMinutes, durationMinutes };
  }, []);

  const handleDragOverColumn = useCallback((e: React.DragEvent, targetStaffId: number | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const next = resolveDragTarget(e, targetStaffId);
    if (!next) return;
    setDragTarget(current => current && current.staffId === next.staffId && current.startMinutes === next.startMinutes && current.durationMinutes === next.durationMinutes ? current : next);
  }, [resolveDragTarget]);

  const handleDragEnd = useCallback(() => {
    dragApptRef.current = null;
    setDragTarget(null);
  }, []);

  const handleDropOnColumn = useCallback((e: React.DragEvent, targetStaffId: number | null) => {
    e.preventDefault();
    const appt = dragApptRef.current;
    const target = resolveDragTarget(e, targetStaffId);
    dragApptRef.current = null;
    setDragTarget(null);
    if (!appt || !target) return;

    const durationMs = new Date(appt.scheduledEnd).getTime() - new Date(appt.scheduledStart).getTime();
    const dragSchedule = buildAestDragSchedule({
      sourceStart: new Date(appt.scheduledStart),
      durationMs,
      minutesFromSeven: target.startMinutes,
    });

    rescheduleMutation.mutate({
      appointmentId:  appt.id,
      scheduledStart: dragSchedule.scheduledStartIso,
      scheduledEnd:   dragSchedule.scheduledEndIso,
      staffId: targetStaffId,
    }, {
      onSuccess: () => { toast.success("Appointment moved"); refetch(); },
      onError: (err) => toast.error(err.message),
    });
  }, [rescheduleMutation, refetch, resolveDragTarget]);

  // Prefer the team directory but retain a safe calendar fallback for migrated
  // appointments: their joined staff data is sufficient to render assigned
  // columns and filter options even if a staff-list request is unavailable.
  const activeStaff = useMemo(
    () => resolveCalendarStaffColumns(staffList, weekAppts),
    [staffList, weekAppts],
  );
  const calendarGroomers = useMemo(() => activeStaff.filter((member) => member.role !== "bather"), [activeStaff]);
  const calendarBathers = useMemo(() => activeStaff.filter((member) => member.role === "bather"), [activeStaff]);
  const weekDays    = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const filteredAppts = useMemo(() => {
    if (!weekAppts) return [];
    if (visibleStaffIds === null) return weekAppts;
    return weekAppts.filter((appointment) => appointment.staffId !== null && visibleStaffIds.includes(appointment.staffId));
  }, [weekAppts, visibleStaffIds]);

  // Build a map of sessionId -> all appointments in that session (from ALL weekAppts, not filtered)
  // so sibling cards can reference each other even across groomer filters
  const sessionMap = useMemo(() => {
    if (!weekAppts) return new Map<string, Appt[]>();
    const map = new Map<string, Appt[]>();
    for (const a of weekAppts) {
      if (a.sessionId) {
        const arr = map.get(a.sessionId) ?? [];
        arr.push(a as Appt);
        map.set(a.sessionId, arr);
      }
    }
    return map;
  }, [weekAppts]);

  // For a given appointment, return its siblings (other pets in same session)
  const getSiblings = (appt: Appt): Appt[] => {
    if (!appt.sessionId) return [];
    const all = sessionMap.get(appt.sessionId) ?? [];
    return all.filter(a => a.id !== appt.id);
  };

  const selectedClientPets = trpc.pets.listByClient.useQuery(
    { clientId: parseInt(newAppt.clientId) },
    { enabled: !!newAppt.clientId && !isNaN(parseInt(newAppt.clientId)) }
  );
  const selectedAppointmentPetIds = useMemo(
    () => newAppt.petIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
    [newAppt.petIds],
  );
  const membershipCoverage = trpc.calendar.getMembershipCoverage.useQuery(
    {
      tenantId: 1,
      clientId: Number(newAppt.clientId),
      petIds: selectedAppointmentPetIds,
      serviceType: newAppt.serviceType as "classic_groom" | "styled_groom" | "bath_only" | "fft" | "nail_trim" | "daycare" | "deshed" | "other",
    },
    { enabled: !!newAppt.clientId && selectedAppointmentPetIds.length > 0 },
  );
  const clientMembershipSummary = trpc.calendar.getClientMembershipSummary.useQuery(
    { tenantId: 1, clientId: Number(newAppt.clientId) },
    { enabled: !!newAppt.clientId },
  );
  useEffect(() => {
    if (membershipCoverage.data?.fullyCovered) {
      setNewAppt((current) => current.price === "0.00" ? current : { ...current, price: "0.00" });
    }
  }, [membershipCoverage.data?.fullyCovered]);
  const familyBookingCompanions = useMemo(() => {
    const selectedIds = new Set(newAppt.petIds);
    const selectedFamilyGroups = new Set((selectedClientPets.data ?? [])
      .filter(pet => selectedIds.has(String(pet.id)) && pet.familyGroupId)
      .map(pet => pet.familyGroupId));
    if (selectedFamilyGroups.size === 0) return [];
    return (selectedClientPets.data ?? []).filter(pet => !selectedIds.has(String(pet.id)) && pet.familyGroupId && selectedFamilyGroups.has(pet.familyGroupId));
  }, [newAppt.petIds, selectedClientPets.data]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const navigateWeek = (dir: number) =>
    setWeekStart(w => { const n = new Date(w); n.setDate(n.getDate() + dir * 7); return n; });
  const navigateDay = (dir: number) =>
    setDayDate(d => { const n = new Date(d); n.setDate(n.getDate() + dir); return n; });
  const goToToday = () => {
    const today = getTodayAEST();
    setWeekStart(getWeekStart(today));
    setDayDate(today);
  };

  const multiPetCreateMutation = trpc.calendar.createMultiPetAppointment.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.created} appointment${r.created !== 1 ? "s" : ""} created`);
      setShowNewAppt(false);
      setNewAppt({ clientId: "", petIds: [], staffId: "", serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "" });
      setClientSearch("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newAppt.clientId || newAppt.petIds.length === 0 || !newAppt.scheduledStart || !newAppt.scheduledEnd) {
      toast.error("Please select a client, at least one pet, and the appointment times"); return;
    }
    multiPetCreateMutation.mutate({
      tenantId: 1,
      clientId: parseInt(newAppt.clientId),
      petIds:   newAppt.petIds.map(id => parseInt(id)),
      staffId:  newAppt.staffId ? parseInt(newAppt.staffId) : undefined,
      serviceType: newAppt.serviceType as "classic_groom",
      scheduledStart: newAppt.scheduledStart,
      scheduledEnd:   newAppt.scheduledEnd,
      notes: newAppt.notes || undefined,
      price: membershipCoverage.data?.fullyCovered ? "0.00" : newAppt.price || undefined,
    });
  };

  const openEdit = (appt: Appt) => {
    setEditAppt(appt);
    setAdditionalFamilyPetIds([]);
    const fmt = (d: Date) => {
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    };
    setEditForm({
      staffId:        appt.staffId ? String(appt.staffId) : "",
      serviceType:    appt.serviceType,
      scheduledStart: fmt(new Date(appt.scheduledStart)),
      scheduledEnd:   fmt(new Date(appt.scheduledEnd)),
      notes:          appt.notes ?? "",
      price:          appt.price ?? "",
      workflowState:  appt.workflowState,
    });
  };

  const handleSaveEdit = async () => {
    if (!editAppt) return;
    const promises: Promise<unknown>[] = [];
    const keepOriginalCancelledSchedule = editAppt.status === "cancelled" || editAppt.workflowState === "cancelled" || editForm.workflowState === "cancelled";
    if (!keepOriginalCancelledSchedule) {
      promises.push(rescheduleMutation.mutateAsync({
        appointmentId:  editAppt.id,
        scheduledStart: editForm.scheduledStart,
        scheduledEnd:   editForm.scheduledEnd,
        staffId: editForm.staffId && editForm.staffId !== "__unassigned__" ? parseInt(editForm.staffId) : null,
      }));
    }
    // Save sibling groomer assignments if they were changed
    const siblings = getSiblings(editAppt);
    for (const sib of siblings) {
      const newStaffIdStr = siblingGroomers[sib.id];
      if (!keepOriginalCancelledSchedule && newStaffIdStr !== undefined) {
        promises.push(rescheduleMutation.mutateAsync({
          appointmentId: sib.id,
          scheduledStart: editForm.scheduledStart,
          scheduledEnd: editForm.scheduledEnd,
          staffId: newStaffIdStr ? parseInt(newStaffIdStr) : null,
        }));
      }
    }
    if (editForm.serviceType !== editAppt.serviceType || editForm.notes !== (editAppt.notes ?? "") || editForm.price !== (editAppt.price ?? "")) {
      promises.push(updateDetailsMutation.mutateAsync({
        appointmentId: editAppt.id,
        serviceType:   editForm.serviceType as "classic_groom",
        notes:         editForm.notes || null,
        price:         editForm.price || null,
      }));
    }
    if (editForm.workflowState !== editAppt.workflowState) {
      promises.push(workflowMutation.mutateAsync({
        appointmentId: editAppt.id,
        newState:      editForm.workflowState as "scheduled",
      }));
    }
    try {
      await Promise.all(promises);
      toast.success("Appointment updated");
      setEditAppt(null);
      refetch();
    } catch { /* individual errors already toasted */ }
  };

  // ── Grid height ────────────────────────────────────────────────────────────
  const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT; // total px height of the time grid

  // ── Week view (agenda/list — one card per appt, full column width) ──────────
  const renderWeekView = () => (
    <div className="bg-card rounded-xl border overflow-auto">
      <div className="min-w-[700px]">
        {/* Day header row */}
        <div
          className="grid border-b sticky top-0 bg-card z-10"
          style={{ gridTemplateColumns: `repeat(7, 1fr)` }}
        >
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === getTodayAEST().toDateString();
            const dayAppts = filteredAppts.filter(a => aestDateKey(new Date(a.scheduledStart)) === dayDateKey(day));
            return (
              <div
                key={i}
                className={`p-2 border-r last:border-r-0 text-center cursor-pointer hover:bg-muted/40 transition-colors ${isToday ? "bg-primary/5" : ""}`}
                onClick={() => { setDayDate(day); setViewMode("day"); }}
              >
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {day.toLocaleDateString("en-AU", { weekday: "short" })}
                </div>
                <div className={`text-xl font-bold leading-tight ${isToday ? "text-primary" : ""}`}>
                  {day.getDate()}
                </div>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">
                  {dayAppts.length} appts
                </Badge>
              </div>
            );
          })}
        </div>

        {/* Agenda rows — one scrollable list per day column */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(7, 1fr)` }}>
          {weekDays.map((day, di) => {
            const isToday = day.toDateString() === getTodayAEST().toDateString();
            const dayAppts = filteredAppts
              .filter(a => aestDateKey(new Date(a.scheduledStart)) === dayDateKey(day))
              .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
            return (
              <div
                key={di}
                className={`border-r last:border-r-0 min-h-[400px] p-1.5 space-y-1 ${isToday ? "bg-primary/[0.02]" : ""}`}
                onClick={() => {
                  const y = day.getFullYear();
                  const mo = String(day.getMonth() + 1).padStart(2, "0");
                  const d = String(day.getDate()).padStart(2, "0");
                  setNewAppt(p => ({ ...p, scheduledStart: `${y}-${mo}-${d}T09:00`, scheduledEnd: `${y}-${mo}-${d}T10:00` }));
                  setShowNewAppt(true);
                }}
              >
                {dayAppts.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                    No appointments
                  </div>
                ) : (
                  dayAppts.map(appt => {
                    const svc = SERVICE_COLOURS[appt.serviceType] ?? SERVICE_COLOURS.other;
                    const isCancelled = appt.status === "cancelled" || appt.workflowState === "cancelled";
                    const sharedAppointmentLabel = formatSharedAppointmentName({
                      petNames: [appt, ...getSiblings(appt as Appt)].map((pet) => pet.petName),
                      surname: appt.clientLastName,
                    });
                    return (
                      <div
                        key={appt.id}
                        className={`brand-lift rounded-md border border-white/80 px-2 py-1.5 cursor-pointer text-[11px] leading-tight ${isCancelled ? "bg-red-50" : ""}`}
                        style={{ background: isCancelled ? "linear-gradient(135deg, #fee2e2 0%, #fff7f7 180%)" : `linear-gradient(135deg, ${svc.bg} 0%, #ffffff 180%)`, borderLeft: `4px solid ${isCancelled ? "#dc2626" : svc.border}`, boxShadow: isCancelled ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px #dc2626" : `inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px ${svc.border}` }}
                        onClick={(e) => { e.stopPropagation(); openEdit(appt as Appt); }}
                      >
                        {isCancelled && <div className="mb-1 inline-flex rounded-sm bg-red-700 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white">Cancelled</div>}
                        <div className={`font-bold truncate ${isCancelled ? "line-through decoration-2 decoration-red-700" : ""}`} style={{ color: isCancelled ? "#991b1b" : svc.border }}>
                          {sharedAppointmentLabel}
                          {appt.reminderStatus === "delivered" && <CheckCircle2 aria-label="Reminder delivered" className="inline ml-1 h-3 w-3 text-emerald-600" />}
                        </div>
                        <div className="truncate mt-0.5 font-medium" style={{ color: isCancelled ? "#991b1b" : svc.text }}>
                          {fmtTime(new Date(appt.scheduledStart))}
                          {appt.staffName ? ` · ${appt.staffName.split(" ")[0]}` : ""}
                        </div>
                        <span className="mt-1 inline-flex rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text }}>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</span>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Day view ──────────────────────────────────────────────────────────────
  const renderDayView = () => {
    const allCols = activeStaff.length > 0
      ? activeStaff
      : [{ id: null as number | null, name: "Unassigned", colourHex: "#94a3b8", isActive: true, role: null }];
    const cols = visibleStaffIds === null
      ? allCols
      : allCols.filter((staffMember) => staffMember.id !== null && visibleStaffIds.includes(staffMember.id));
    const groomerCount = cols.filter((member) => member.role !== "bather").length;
    const batherCount = cols.filter((member) => member.role === "bather").length;

    return (
      <div className="min-h-[500px] flex-1 bg-card rounded-2xl border border-white/90 shadow-xl shadow-[color-mix(in_oklch,var(--brand-primary)_10%,transparent)] flex flex-col overflow-hidden lg:min-h-0">
        {/* Intentional horizontal scrolling keeps every staff track wide enough to read appointment details. */}
        <div className="overflow-x-auto overscroll-x-contain flex-1 flex flex-col" aria-label="Scrollable staff calendar columns">
          {/* Computed total width: time gutter + fixed readable-width staff columns. */}
          {(() => {
            const { totalWidth, gridTemplateColumns: colTemplate } = getDayCalendarGridSizing(cols.length, TIME_COL_W);
            return (
              <div className="shrink-0" style={{ width: totalWidth, minWidth: totalWidth }}>
                {(groomerCount > 0 || batherCount > 0) && (
                  <div className="grid border-b bg-slate-50/80" style={{ gridTemplateColumns: colTemplate }}>
                    <div className="border-r" />
                    {groomerCount > 0 && <div className="px-3 py-2 border-r text-[10px] font-black uppercase tracking-[0.16em] text-teal-800 bg-gradient-to-r from-teal-100/90 to-teal-50/50" style={{ gridColumn: `span ${groomerCount}` }}>Groomers</div>}
                    {batherCount > 0 && <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-800 bg-gradient-to-r from-indigo-100/90 to-indigo-50/50" style={{ gridColumn: `span ${batherCount}` }}>Bathing Team</div>}
                  </div>
                )}
                {/* Sticky header */}
                <div
                  className="grid border-b sticky top-0 bg-card/95 backdrop-blur z-20 shrink-0"
                  style={{ gridTemplateColumns: colTemplate }}
                >
                  <div className="border-r p-2 text-[11px] text-muted-foreground text-center leading-tight">
                    {dayDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </div>
                  {cols.map((s, i) => (
                    <div key={i} className="p-2.5 border-r last:border-r-0 text-center transition-colors hover:bg-slate-50/80" style={{ borderTop: `3px solid ${s.colourHex ?? "#6366f1"}` }}>
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm" style={{ background: s.colourHex ?? "#6366f1", boxShadow: `0 0 0 3px ${s.colourHex ?? "#6366f1"}20` }} />
                        <span className="text-xs font-semibold truncate">{s.name.split(" ")[0]}</span>
                      </div>
                      <div className="mt-1 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {filteredAppts.filter(a => a.staffId === s.id && aestDateKey(new Date(a.scheduledStart)) === dayDateKey(dayDate)).length} appts
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scrollable grid body */}
                <div className="overflow-y-auto flex-1" ref={scrollRef}>
                  <div
                    className="relative"
                    style={{
                      height: GRID_HEIGHT,
                      display: "grid",
                      gridTemplateColumns: colTemplate,
                    }}
                  >
            {/* Time gutter */}
            <div className="relative border-r" style={{ height: GRID_HEIGHT }}>
              <TimeGutter />
            </div>

            {/* Groomer columns */}
            {cols.map((s, ci) => {
              const colAppts = filteredAppts.filter(a => {
                const aest = toAESTDate(new Date(a.scheduledStart));
                return a.staffId === s.id &&
                  aestDateKey(new Date(a.scheduledStart)) === dayDateKey(dayDate) &&
                  aest.getUTCHours() >= 7 && aest.getUTCHours() < 20;
              }) as Appt[];

              return (
                <div
                  key={ci}
                  className="relative border-r last:border-r-0 transition-colors hover:bg-slate-50/35"
                  style={{ height: GRID_HEIGHT, backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.52), rgba(255,255,255,0.18))" }}
                  onDragOver={(e) => handleDragOverColumn(e, s.id)}
                  onDrop={(e) => handleDropOnColumn(e, s.id)}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    let hourFraction = 7 + offsetY / HOUR_HEIGHT;
                    hourFraction = Math.max(7, Math.min(19.75, hourFraction));
                    const snappedMinutes = Math.round((hourFraction * 60) / 15) * 15;
                    const startH = Math.floor(snappedMinutes / 60);
                    const startM = snappedMinutes % 60;
                    const endTotal = snappedMinutes + 60;
                    const endH = Math.floor(endTotal / 60);
                    const endM = endTotal % 60;
                    const y = dayDate.getFullYear();
                    const mo = String(dayDate.getMonth() + 1).padStart(2, "0");
                    const d = String(dayDate.getDate()).padStart(2, "0");
                    const pad = (n: number) => String(n).padStart(2, "0");
                    setNewAppt(p => ({
                      ...p,
                      staffId: String(s.id),
                      scheduledStart: `${y}-${mo}-${d}T${pad(startH)}:${pad(startM)}`,
                      scheduledEnd: `${y}-${mo}-${d}T${pad(endH)}:${pad(endM)}`,
                    }));
                    setShowNewAppt(true);
                  }}
                >
                  {/* Hour lines */}
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-border/40"
                      style={{ top: (hour - 7) * HOUR_HEIGHT }}
                    />
                  ))}
                  {/* Half-hour lines */}
                  {HOURS.map(hour => (
                    <div
                      key={`h${hour}`}
                      className="absolute left-0 right-0 border-t border-border/20"
                      style={{ top: (hour - 7) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                    />
                  ))}
                  {dragTarget?.staffId === s.id && (
                    <div
                      className="pointer-events-none absolute left-1 right-1 z-30 rounded-md border-2 border-primary bg-primary/15 shadow-lg shadow-primary/15"
                      style={{ top: (dragTarget.startMinutes / 60) * HOUR_HEIGHT, height: Math.max(26, (dragTarget.durationMinutes / 60) * HOUR_HEIGHT) }}
                      data-testid="calendar-drag-target"
                    >
                      <span className="absolute left-1.5 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {s.name.split(" ")[0]} · {formatCalendarDragTargetTime(dragTarget.startMinutes)}
                      </span>
                    </div>
                  )}
                  {/* Now line */}
                  <NowLine totalGridWidth={0} />
                  {/* Blockout banners */}
                  {(blockouts ?? []).filter(b => {
                    const bd = new Date(b.blockoutDate);
                    const bdKey = `${bd.getUTCFullYear()}-${String(bd.getUTCMonth()+1).padStart(2,'0')}-${String(bd.getUTCDate()).padStart(2,'0')}`;
                    return b.staffId === s.id && bdKey === dayDateKey(dayDate);
                  }).map(b => {
                    if (b.isFullDay) {
                      return (
                        <div key={b.id} className="absolute inset-0 z-10 pointer-events-none" style={{ background: "repeating-linear-gradient(45deg, rgba(239,68,68,0.07), rgba(239,68,68,0.07) 6px, transparent 6px, transparent 12px)" }}>
                          <div className="absolute top-2 left-1 right-1 flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                              <Ban className="h-2.5 w-2.5" /> {b.reason || "Day Off"}
                            </span>
                            <button className="pointer-events-auto text-red-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "blockout", id: b.id, label: b.reason || "Day Off" }); }}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    }
                    // Partial blockout
                    const [sh, sm] = (b.startTime ?? "09:00").split(":").map(Number);
                    const [eh, em] = (b.endTime ?? "17:00").split(":").map(Number);
                    const topPx = ((sh - 7) + sm / 60) * HOUR_HEIGHT;
                    const heightPx = ((eh - sh) + (em - sm) / 60) * HOUR_HEIGHT;
                    return (
                      <div key={b.id} className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: topPx, height: Math.max(heightPx, 24), background: "repeating-linear-gradient(45deg, rgba(239,68,68,0.1), rgba(239,68,68,0.1) 6px, transparent 6px, transparent 12px)" }}>
                        <div className="absolute top-1 left-1 right-1 flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                            <Ban className="h-2.5 w-2.5" /> {b.startTime}–{b.endTime} {b.reason || "Blocked"}
                          </span>
                          <button className="pointer-events-auto text-red-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "blockout", id: b.id, label: `${b.startTime}–${b.endTime} ${b.reason || "Blocked"}` }); }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Appointments — for sessions with multiple pets, show only the first card (lowest id) with siblings listed inside */}
                  {(() => {
                    // Determine which appts to show: for sessions, show only the primary (lowest id)
                    const shownIds = new Set<number>();
                    const sessionPrimary = new Map<string, Appt>();
                    for (const a of colAppts) {
                      if (a.sessionId) {
                        const existing = sessionPrimary.get(a.sessionId);
                        if (!existing || a.id < existing.id) sessionPrimary.set(a.sessionId, a as Appt);
                      }
                    }
                    Array.from(sessionPrimary.values()).forEach(primary => shownIds.add(primary.id));
                    const displayAppts = colAppts.filter(a => !a.sessionId || shownIds.has(a.id));
                    return computeColumns(displayAppts).map(({ appt, col, totalCols }) => (
                      <ApptBlock
                        key={appt.id}
                        appt={appt as Appt}
                        col={col}
                        totalCols={totalCols}
                        containerHeight={GRID_HEIGHT}
                        onClick={() => openEdit(appt as Appt)}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        siblings={getSiblings(appt as Appt)}
                      />
                    ));
                  })()}
                </div>
              );
            })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const totalThisView = filteredAppts.length;
  const weekLabel = viewMode === "week"
    ? `${weekDays[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : fmtDateShort(dayDate);

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-col gap-4 lg:h-[calc(100dvh-2rem)]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/90 bg-white/70 px-3 py-3 shadow-lg shadow-[color-mix(in_oklch,var(--brand-primary)_8%,transparent)] backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="brand-lift bg-white/80" onClick={() => viewMode === "week" ? navigateWeek(-1) : navigateDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="brand-lift bg-white/80 font-semibold" onClick={goToToday}>Today</Button>
            <Button variant="outline" size="icon" className="brand-lift bg-white/80" onClick={() => viewMode === "week" ? navigateWeek(1) : navigateDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <button className="brand-lift flex items-center gap-2 rounded-lg px-2 py-1.5 text-base font-bold ml-1 hover:bg-primary/10 hover:text-primary transition-colors">
                  <span className="rounded-md bg-primary/10 p-1 text-primary"><CalendarIcon className="h-4 w-4" /></span>
                  {weekLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={viewMode === "day" ? dayDate : weekStart}
                  onSelect={(d) => {
                    if (!d) return;
                    if (viewMode === "day") {
                      const nd = new Date(d); nd.setHours(0,0,0,0); setDayDate(nd);
                    } else {
                      setWeekStart(getWeekStart(d));
                    }
                    setShowDatePicker(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{totalThisView} appointments</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover open={apptSearchOpen} onOpenChange={(open) => { setApptSearchOpen(open); if (!open) setApptSearchTerm(""); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="brand-lift h-9 gap-1.5 bg-white/80 text-xs shadow-sm" title="Find any appointment by dog or client name">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  Find appointment
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full max-w-[calc(100vw-2rem)] p-0" align="start" style={{ width: "var(--radix-popover-trigger-width, 360px)" }}>
                <div className="p-2 border-b">
                  <div className="relative">
                    <Input
                      autoFocus
                      placeholder="Dog name or client name…"
                      value={apptSearchTerm}
                      onChange={e => setApptSearchTerm(e.target.value)}
                      className="h-8 pr-9 text-sm"
                    />
                    {apptSearchTerm && (
                      <button
                        type="button"
                        className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setApptSearchTerm("")}
                        aria-label="Clear appointment search"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="max-h-[min(52dvh,20rem)] overflow-y-auto overscroll-contain touch-pan-y pb-2 [-webkit-overflow-scrolling:touch]"
                  style={{ WebkitOverflowScrolling: "touch" }}
                  role="listbox"
                  aria-label="Matching appointments"
                >
                  {apptSearchTerm.trim().length < 2 ? (
                    <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">Type at least 2 characters</p>
                  ) : isApptSearchFetching ? (
                    <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">Searching…</p>
                  ) : !apptSearchResults || apptSearchResults.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">No appointments found</p>
                  ) : (
                    apptSearchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                        onClick={() => jumpToAppointment(r.scheduledStart)}
                      >
                        <span className="min-w-0">
                          <span className="font-semibold block truncate">{r.petName ?? "Unnamed pet"}</span>
                          <span className="text-xs text-muted-foreground block truncate">{[r.clientFirstName, r.clientLastName].filter(Boolean).join(" ") || "Unknown client"} · {SERVICE_LABELS[r.serviceType] ?? r.serviceType}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 text-right">
                          {new Date(r.scheduledStart).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: "Australia/Brisbane" })}
                          <br />
                          {new Date(r.scheduledStart).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Brisbane" })}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="brand-lift h-9 min-w-40 justify-start gap-1.5 bg-white/80 text-xs shadow-sm" title="Choose the staff columns shown on this calendar">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {visibleStaffIds === null ? "All staff" : `${visibleStaffIds.length} staff selected`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Visible staff columns</p>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setVisibleStaffIds(null)}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${visibleStaffIds === null ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{visibleStaffIds === null && <Check className="h-3 w-3" />}</span>
                  All staff
                </button>
                {calendarGroomers.length > 0 && <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-teal-700">Groomers</p>}
                {calendarGroomers.map((member) => {
                  const checked = visibleStaffIds === null || visibleStaffIds.includes(member.id);
                  return <button key={member.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setVisibleStaffIds(toggleCalendarStaffSelection(visibleStaffIds, activeStaff.map((staffMember) => staffMember.id), member.id))}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check className="h-3 w-3" />}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: member.colourHex ?? "#6366f1" }} />{member.name.split(" ")[0]}
                  </button>;
                })}
                {calendarBathers.length > 0 && <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Bathing team</p>}
                {calendarBathers.map((member) => {
                  const checked = visibleStaffIds === null || visibleStaffIds.includes(member.id);
                  return <button key={member.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setVisibleStaffIds(toggleCalendarStaffSelection(visibleStaffIds, activeStaff.map((staffMember) => staffMember.id), member.id))}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check className="h-3 w-3" />}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: member.colourHex ?? "#6366f1" }} />{member.name.split(" ")[0]}
                  </button>;
                })}
              </PopoverContent>
            </Popover>
            {/* View toggle */}
            <div className="flex rounded-xl border border-primary/15 bg-white/80 p-1 shadow-sm">
              <button
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${viewMode === "week" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/10 hover:text-primary"}`}
                onClick={() => setViewMode("week")}
              >Week</button>
              <button
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${viewMode === "day" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/10 hover:text-primary"}`}
                onClick={() => setViewMode("day")}
              >Day</button>
            </div>
            <Button variant="outline" onClick={() => setShowBlockoutDialog(true)} size="sm" className="brand-lift gap-1.5 bg-white/80 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
              <Ban className="h-4 w-4" /> Block Out
            </Button>
            <Button onClick={() => setShowNewAppt(true)} size="sm" className="brand-lift gap-1.5 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" /> New Appointment
            </Button>
          </div>
        </div>

        {/* Calendar */}
        <div className={viewMode === "day" ? "flex min-h-0 flex-1 flex-col" : "min-h-0"}>
          {viewMode === "week" ? renderWeekView() : renderDayView()}
        </div>

        {/* Unassigned row */}
        {filteredAppts.filter(a => !a.staffId).length ? (
          <div className="bg-card rounded-xl border p-4">
            <h3 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Unassigned ({filteredAppts.filter(a => !a.staffId).length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {filteredAppts.filter(a => !a.staffId).map(appt => {
                const sharedAppointmentLabel = formatSharedAppointmentName({
                  petNames: [appt, ...getSiblings(appt as Appt)].map((pet) => pet.petName),
                  surname: appt.clientLastName,
                });
                return (
                  <div
                    key={appt.id}
                    className="bg-muted rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => openEdit(appt as Appt)}
                  >
                    <span className="font-medium">{sharedAppointmentLabel}</span>
                    <span className="text-muted-foreground ml-1">
                      · {appt.clientFirstName} {appt.clientLastName}
                      · {fmtTime(new Date(appt.scheduledStart))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── New Appointment Dialog ── */}
      <Dialog open={showNewAppt} onOpenChange={(v) => { setShowNewAppt(v); if (!v) { setClientSearch(""); setNewAppt({ clientId: "", petIds: [], staffId: "", serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" /> New Appointment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Client *</Label>
                <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent/30 transition-colors"
                    >
                      {(() => {
                        const sel = clientSearchOptions.find((c: typeof clientSearchOptions[0]) => String(c.clientId) === newAppt.clientId);
                        if (sel) return `${sel.firstName ?? ''} ${sel.lastName ?? ''}`.trim();
                        if (newAppt.clientId) return `Client #${newAppt.clientId}`;
                        return <span className="text-muted-foreground">Search by name, pet or phone…</span>;
                      })()}
                      <Search className="h-3.5 w-3.5 text-muted-foreground ml-2 shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full max-w-[calc(100vw-2rem)] p-0" align="start" style={{ width: "var(--radix-popover-trigger-width, 360px)" }}>
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Input
                          autoFocus
                          placeholder="Name, pet name or phone…"
                          value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          className="h-8 pr-9 text-sm"
                        />
                        {clientSearch && (
                          <button
                            type="button"
                            className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setClientSearch("")}
                            aria-label="Clear customer search"
                            title="Clear search"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      className="max-h-[min(52dvh,20rem)] overflow-y-auto overscroll-contain touch-pan-y pb-2 [-webkit-overflow-scrolling:touch]"
                      style={{ WebkitOverflowScrolling: "touch" }}
                      role="listbox"
                      aria-label="Matching clients"
                      data-testid="mobile-client-search-results"
                    >
                      {clientSearch.length < 1 ? (
                        <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">Type a name, pet name or phone number</p>
                      ) : isClientSearchFetching ? (
                        <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">Searching clients…</p>
                      ) : isClientSearchError ? (
                        <p className="text-xs text-destructive text-center py-4" role="alert">Client search is temporarily unavailable. Please try again.</p>
                      ) : clientSearchOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">No clients found</p>
                      ) : (
                        clientSearchOptions.map((c: typeof clientSearchOptions[0]) => (
                          <button
                            key={c.clientId}
                            type="button"
                            role="option"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                            onClick={() => {
                              setNewAppt(p => ({ ...p, clientId: String(c.clientId), petIds: [] }));
                              setClientSearchOpen(false);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{c.firstName} {c.lastName}</span>
                              {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                            </div>
                            {c.pets.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {c.pets.map((p: typeof c.pets[0]) => (
                                  <span key={p.petId} className="text-[11px] bg-primary/10 text-primary rounded px-1.5 py-0.5">
                                    {p.petName}{p.petBreed ? ` · ${p.petBreed}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Pets * <span className="text-xs text-muted-foreground font-normal">(select one or more)</span></Label>
                {newAppt.clientId && (clientMembershipSummary.isFetching ? (
                  <p className="text-xs text-muted-foreground py-1">Checking client membership…</p>
                ) : clientMembershipSummary.data && clientMembershipSummary.data.activeCount > 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-emerald-600 text-white">Weekly membership active</Badge>
                      {clientMembershipSummary.data.activeMemberships.map((membership) => (
                        <span key={membership.id} className="text-xs font-medium">{membership.name} · {membership.tier}</span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-emerald-800">Select the dog or dogs for this appointment to confirm coverage. The price will be set to $0.00 only when every selected dog is covered for the chosen service.</p>
                    {clientMembershipSummary.data.suspendedPetIds.length > 0 && <p className="mt-1 text-xs font-medium text-amber-800">A membership needs attention before it can cover a booking.</p>}
                  </div>
                ) : null)}
                {!newAppt.clientId ? (
                  <p className="text-xs text-muted-foreground py-2">Select a client first</p>
                ) : selectedClientPets.isLoading ? (
                  <p className="text-xs text-muted-foreground py-2">Loading pets…</p>
                ) : (selectedClientPets.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No pets found for this client</p>
                ) : (
                  <>
                  <div className="flex flex-wrap gap-2">
                    {selectedClientPets.data?.map(pet => {
                      const selected = newAppt.petIds.includes(String(pet.id));
                      return (
                        <button
                          key={pet.id}
                          type="button"
                          onClick={() => setNewAppt(prev => ({
                            ...prev,
                            petIds: selected
                              ? prev.petIds.filter(id => id !== String(pet.id))
                              : [...prev.petIds, String(pet.id)],
                          }))}
                          className={[
                            "px-3 py-1.5 rounded-full text-sm border transition-all",
                            selected
                              ? "bg-primary text-primary-foreground border-primary font-medium"
                              : "bg-background text-foreground border-border hover:border-primary hover:text-primary",
                          ].join(" ")}
                        >
                          {pet.name}{pet.breed ? ` (${pet.breed})` : ""}
                          {selected && <span className="ml-1.5 opacity-70">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {familyBookingCompanions.length > 0 && <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/70 p-3"><p className="text-sm font-semibold text-violet-950">Include linked family dogs?</p><p className="mt-0.5 text-xs text-violet-800">These dogs are remembered as family-linked. Select any that should share this appointment.</p><div className="mt-2 flex flex-wrap gap-2">{familyBookingCompanions.map(pet => <Button key={pet.id} type="button" size="sm" variant="outline" className="border-violet-300 bg-white text-violet-900 hover:bg-violet-100" onClick={() => setNewAppt(prev => ({ ...prev, petIds: [...prev.petIds, String(pet.id)] }))}>+ {pet.name}</Button>)}</div></div>}
                  {membershipCoverage.isFetching ? <p className="mt-3 text-xs text-muted-foreground">Checking membership coverage…</p> : membershipCoverage.data?.fullyCovered ? <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"><div><div className="flex flex-wrap items-center gap-2"><Badge className="bg-emerald-600 text-white">Weekly membership active</Badge>{membershipCoverage.data.memberships.map(membership => <span key={membership.id} className="text-xs font-medium">{membership.name} · {membership.tier}</span>)}</div><p className="mt-1 text-xs text-emerald-800">Every selected dog is covered for this service. Appointment price is $0.00 because payment is managed through the weekly membership.</p></div></div> : membershipCoverage.data && membershipCoverage.data.coveredPetIds.length > 0 ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><Badge variant="outline" className="border-amber-300 bg-white text-amber-800">Partial membership coverage</Badge><p className="mt-1 text-xs text-amber-800">Only some selected dogs are covered for this service, so the appointment price remains available for review.</p></div> : null}
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Groomer</Label>
                <Select value={newAppt.staffId} onValueChange={v => setNewAppt(p => ({ ...p, staffId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Assign groomer" /></SelectTrigger>
                  <SelectContent>
                    {activeStaff.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Service</Label>
                <Select value={newAppt.serviceType} onValueChange={v => setNewAppt(p => ({ ...p, serviceType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SERVICE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start *</Label>
                <Input type="datetime-local" value={newAppt.scheduledStart} onChange={e => setNewAppt(p => ({ ...p, scheduledStart: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End *</Label>
                <Input type="datetime-local" value={newAppt.scheduledEnd} onChange={e => setNewAppt(p => ({ ...p, scheduledEnd: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price ($)</Label>
                <Input aria-describedby={membershipCoverage.data?.fullyCovered ? "membership-covered-price-note" : undefined} placeholder="0.00" value={newAppt.price} disabled={membershipCoverage.data?.fullyCovered} onChange={e => setNewAppt(p => ({ ...p, price: e.target.value }))} />
                {membershipCoverage.data?.fullyCovered && <p id="membership-covered-price-note" className="text-xs text-emerald-700">Set to $0.00 because the selected dogs are covered by active weekly memberships.</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Any special instructions..." value={newAppt.notes} onChange={e => setNewAppt(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAppt(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={multiPetCreateMutation.isPending}>
              {multiPetCreateMutation.isPending ? "Creating..." : "Create Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Appointment Dialog ── */}
      <Dialog open={!!editAppt} onOpenChange={open => { if (!open) { setEditAppt(null); setSelectedStylePetId(null); setSiblingGroomers({}); setAdditionalFamilyPetIds([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit Appointment
              {editAppt && (() => {
                const sibs = getSiblings(editAppt);
                if (sibs.length > 0) {
                  return (
                    <span className="text-muted-foreground font-normal text-sm ml-1">
                      — {[editAppt, ...sibs].map(p => p.petName).filter(Boolean).join(" & ")} {editAppt.clientLastName}
                      <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                        {1 + sibs.length} pets
                      </span>
                    </span>
                  );
                }
                return (
                  <span className="text-muted-foreground font-normal text-sm ml-1">
                    — {editAppt.petName} ({editAppt.clientFirstName} {editAppt.clientLastName})
                  </span>
                );
              })()}
            </DialogTitle>
          </DialogHeader>
          {editAppt && (() => {
            const editSiblings = getSiblings(editAppt);
            return (
            <Tabs defaultValue="details">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="report" className="flex-1">Grooming Report</TabsTrigger>
                <TabsTrigger value="style" className="flex-1">Style Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 pt-2">
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                  {editSiblings.length > 0 ? (
                    <div className="space-y-0.5">
                      <span className="text-muted-foreground">Pets:</span>
                      {[editAppt, ...editSiblings].map((p) => {
                        const rStatus = reportStatusMap[p.id];
                        return (
                          <span key={p.id} className="inline-flex items-center gap-1 ml-1">
                            <strong>{p.petName}</strong>{p.petBreed ? ` · ${p.petBreed}` : ""}
                            {p.lastAppointmentDate && <span className="text-xs text-muted-foreground">· Last: {new Date(p.lastAppointmentDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>}
                            {rStatus === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />}
                            {rStatus === "draft" && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1">Draft</span>}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Pet:</span>
                      <strong>{editAppt.petName}</strong>{editAppt.petBreed ? ` · ${editAppt.petBreed}` : ""}
                      {reportStatusMap[editAppt.id] === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {reportStatusMap[editAppt.id] === "draft" && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1">Draft</span>}
                    </div>
                  )}
                  <div><span className="text-muted-foreground">Client:</span> {editAppt.clientFirstName} {editAppt.clientLastName}{editAppt.clientPhone ? ` · ${editAppt.clientPhone}` : ""}</div>
                  {editAppt.lastAppointmentDate && <div><span className="text-muted-foreground">Last appointment:</span> {new Date(editAppt.lastAppointmentDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>}
                </div>
                {(() => {
                  const bookedPetIds = new Set([editAppt, ...editSiblings].map((appointment) => appointment.petId));
                  const availablePets = (editableAppointmentPets.data ?? []).filter((pet) => pet.status === "active" && !bookedPetIds.has(pet.id));
                  if (availablePets.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                      <div>
                        <Label className="text-xs font-bold">Add family dogs to this booking</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">Select only the dogs actually booked at this time. Existing total pricing is retained once, so no charge is copied or invented.</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {availablePets.map((pet) => {
                          const selected = additionalFamilyPetIds.includes(pet.id);
                          return <button key={pet.id} type="button" onClick={() => setAdditionalFamilyPetIds((current) => selected ? current.filter((id) => id !== pet.id) : [...current, pet.id])} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-background text-primary hover:bg-primary/10"}`}>{pet.name}</button>;
                        })}
                      </div>
                      <Button type="button" size="sm" className="w-full" disabled={additionalFamilyPetIds.length === 0 || addPetsToSharedAppointmentMutation.isPending} onClick={() => addPetsToSharedAppointmentMutation.mutate({ appointmentId: editAppt.id, petIds: additionalFamilyPetIds })}>
                        {addPetsToSharedAppointmentMutation.isPending ? "Adding family dogs..." : "Add selected dogs to this booking"}
                      </Button>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Groomer</Label>
                    {editSiblings.length > 0 ? (
                      <div className="space-y-2">
                        {[editAppt, ...editSiblings].map(pet => (
                          <div key={pet.id} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0 truncate">{pet.petName}:</span>
                            <Select
                              value={siblingGroomers[pet.id] !== undefined ? (siblingGroomers[pet.id] || "__unassigned__") : (String(pet.staffId ?? "") || "__unassigned__")}
                              disabled={preservesCancelledSchedule}
                              onValueChange={v => setSiblingGroomers(prev => ({ ...prev, [pet.id]: v === "__unassigned__" ? "" : v }))}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                {activeStaff.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Select value={editForm.staffId || "__unassigned__"} disabled={preservesCancelledSchedule} onValueChange={v => setEditForm(p => ({ ...p, staffId: v === "__unassigned__" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {activeStaff.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service</Label>
                    <Select value={editForm.serviceType} onValueChange={v => setEditForm(p => ({ ...p, serviceType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SERVICE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={editForm.scheduledStart} disabled={preservesCancelledSchedule} onChange={e => setEditForm(p => ({ ...p, scheduledStart: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End</Label>
                    <Input type="datetime-local" value={editForm.scheduledEnd} disabled={preservesCancelledSchedule} onChange={e => setEditForm(p => ({ ...p, scheduledEnd: e.target.value }))} />
                  </div>
                </div>
                {preservesCancelledSchedule && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">Cancelled appointments stay at their original booked time for historical tracking. Create a new appointment if the client needs to be rebooked.</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={editForm.workflowState} onValueChange={v => setEditForm(p => ({ ...p, workflowState: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(WORKFLOW_COLOURS).map(s => (
                          <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Price ($)</Label>
                    <Input placeholder="0.00" value={editForm.price} onChange={e => setEditForm(p => ({ ...p, price: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <DialogFooter className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    className="mr-auto shrink-0 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setConfirmDelete({
                      type: "appointment",
                      id: editAppt.id,
                      label: editSiblings.length > 0
                        ? `${[editAppt, ...editSiblings].map((pet) => pet.petName).filter(Boolean).join(" & ")}'s booking`
                        : `${editAppt.petName}'s appointment`,
                    })}
                  >
                    <Trash2 className="h-4 w-4" /> Delete booking
                  </Button>
                  <Button variant="outline" onClick={() => setEditAppt(null)}>Cancel</Button>
                  <Button onClick={handleSaveEdit} disabled={rescheduleMutation.isPending || workflowMutation.isPending}>
                    {rescheduleMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </TabsContent>

              <TabsContent value="style" className="pt-2">
                {/* Pet tab switcher for multi-pet sessions */}
                {editSiblings.length > 0 && (() => {
                  const allPets = [editAppt, ...editSiblings];
                  return (
                    <div className="flex gap-1 mb-3">
                      {allPets.map(pet => (
                        <button
                          key={pet.id}
                          onClick={() => setSelectedStylePetId(pet.petId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            (selectedStylePetId ?? editAppt.petId) === pet.petId
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          <span className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold">{(pet.petName ?? "?")[0]}</span>
                          {pet.petName}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Groom Style</p>
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">Last completed groom</p>
                      {lastCompletedStyle.isLoading ? (
                        <p className="text-xs text-muted-foreground mt-1">Loading the last completed style…</p>
                      ) : lastCompletedStyle.data ? (
                        <>
                          <p className="text-xs text-foreground mt-1">
                            {new Date((lastCompletedStyle.data.completedAt ?? lastCompletedStyle.data.scheduledStart ?? lastCompletedStyle.data.createdAt) as Date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            {lastCompletedStyle.data.staffName ? ` · ${lastCompletedStyle.data.staffName}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lastCompletedStyle.data.note}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">No completed groom style has been recorded for this pet yet.</p>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={loadLastCompletedStyle} disabled={!lastCompletedStyle.data}>
                      Use last style
                    </Button>
                  </div>
                  {lastCompletedStyle.data && (
                    <div className="flex flex-wrap gap-1">
                      {lastCompletedStyle.data.bladeSize && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Blade: {lastCompletedStyle.data.bladeSize}</span>}
                      {lastCompletedStyle.data.combSize && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Comb: {lastCompletedStyle.data.combSize}</span>}
                      {lastCompletedStyle.data.bodyLength && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Body: {lastCompletedStyle.data.bodyLength}</span>}
                      {lastCompletedStyle.data.headStyle && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Head: {lastCompletedStyle.data.headStyle}</span>}
                      {lastCompletedStyle.data.faceStyle && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Face: {lastCompletedStyle.data.faceStyle}</span>}
                      {lastCompletedStyle.data.earStyle && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Ears: {lastCompletedStyle.data.earStyle}</span>}
                      {lastCompletedStyle.data.legStyle && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Legs: {lastCompletedStyle.data.legStyle}</span>}
                      {lastCompletedStyle.data.tailStyle && <span className="bg-background rounded px-1.5 py-0.5 text-[10px]">Tail: {lastCompletedStyle.data.tailStyle}</span>}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs">Service Type</Label>
                    <Select value={styleNoteForm.serviceType || ""} onValueChange={v => setStyleNoteForm(f => ({ ...f, serviceType: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select service…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_groom">Full Groom</SelectItem>
                        <SelectItem value="bath_tidy">Bath &amp; Tidy</SelectItem>
                        <SelectItem value="puppy_intro">Puppy Intro</SelectItem>
                        <SelectItem value="deshed">De-shed</SelectItem>
                        <SelectItem value="summer_groom">Summer Groom</SelectItem>
                        <SelectItem value="winter_groom">Winter Groom</SelectItem>
                        <SelectItem value="strip_out">Strip Out</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Blade Size</Label><Input className="h-8 text-xs" placeholder="e.g. #7F, #5" value={styleNoteForm.bladeSize} onChange={e => setStyleNoteForm(f => ({ ...f, bladeSize: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Comb / Guard</Label><Input className="h-8 text-xs" placeholder="e.g. 16mm" value={styleNoteForm.combSize} onChange={e => setStyleNoteForm(f => ({ ...f, combSize: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Body Length</Label><Input className="h-8 text-xs" placeholder="e.g. 1cm, short" value={styleNoteForm.bodyLength} onChange={e => setStyleNoteForm(f => ({ ...f, bodyLength: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Head Style</Label><Input className="h-8 text-xs" placeholder="e.g. Round, flat top" value={styleNoteForm.headStyle} onChange={e => setStyleNoteForm(f => ({ ...f, headStyle: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Face Style</Label><Input className="h-8 text-xs" placeholder="e.g. Teddy bear" value={styleNoteForm.faceStyle} onChange={e => setStyleNoteForm(f => ({ ...f, faceStyle: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Ear Style</Label><Input className="h-8 text-xs" placeholder="e.g. Rounded, long" value={styleNoteForm.earStyle} onChange={e => setStyleNoteForm(f => ({ ...f, earStyle: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Leg Style</Label><Input className="h-8 text-xs" placeholder="e.g. Fluffy, scissored" value={styleNoteForm.legStyle} onChange={e => setStyleNoteForm(f => ({ ...f, legStyle: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Tail Style</Label><Input className="h-8 text-xs" placeholder="e.g. Pom-pom" value={styleNoteForm.tailStyle} onChange={e => setStyleNoteForm(f => ({ ...f, tailStyle: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><span className="text-amber-500">⚠</span> Warnings / Alerts</Label>
                    <div className="flex gap-2">
                      <Textarea rows={2} className="text-xs flex-1" placeholder="e.g. Bites left side, warts on back, anxious…" value={styleNoteForm.warnings} onChange={e => setStyleNoteForm(f => ({ ...f, warnings: e.target.value }))} />
                      <div className="flex flex-col gap-1">
                        {(["none","caution","danger"] as const).map(lvl => (
                          <button key={lvl} type="button" onClick={() => setStyleNoteForm(f => ({ ...f, alertLevel: f.alertLevel === lvl ? "" : lvl }))}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${styleNoteForm.alertLevel === lvl ? lvl === "danger" ? "bg-red-500 text-white border-red-500" : lvl === "caution" ? "bg-amber-400 text-white border-amber-400" : "bg-green-500 text-white border-green-500" : "bg-transparent text-muted-foreground border-muted"}`}>
                            {lvl === "none" ? "✓ OK" : lvl === "caution" ? "⚠ Caution" : "🔴 Danger"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Additional Notes</Label>
                    <Textarea rows={2} className="text-xs" placeholder="Any other style instructions, client preferences…" value={styleNoteForm.note} onChange={e => setStyleNoteForm(f => ({ ...f, note: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reference Photo (optional)</Label>
                    {photoPreview ? (
                      <div className="relative inline-block">
                        <img src={photoPreview} alt="preview" className="h-24 w-24 rounded-lg object-cover border" />
                        <button className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5 text-muted-foreground hover:text-red-500" onClick={() => { setPhotoPreview(null); setStyleNoteForm(f => ({ ...f, photoUrl: "", photoKey: "" })); }}><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer w-fit">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2 py-1.5 hover:bg-muted/50"><Camera className="h-3.5 w-3.5" />{photoUploading ? "Uploading..." : "Attach Photo"}</div>
                        <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          setPhotoUploading(true);
                          try {
                            const res = await fetch("/api/upload/style-note-photo", { method: "POST", headers: { "Content-Type": file.type }, body: file });
                            if (!res.ok) throw new Error(await res.text());
                            const { url, key } = await res.json();
                            setStyleNoteForm(f => ({ ...f, photoUrl: url, photoKey: key }));
                            setPhotoPreview(url);
                          } catch (err: any) { toast.error("Photo upload failed: " + (err.message ?? "Unknown error")); }
                          finally { setPhotoUploading(false); e.target.value = ""; }
                        }} />
                      </label>
                    )}
                  </div>
                  <Button size="sm" className="w-full" disabled={createStyleNote.isPending || photoUploading}
                    onClick={() => createStyleNote.mutate({
                      petId: selectedStylePetId ?? editAppt.petId,
                      appointmentId: (() => { if (!selectedStylePetId || selectedStylePetId === editAppt.petId) return editAppt.id; const sib = editSiblings.find(s => s.petId === selectedStylePetId); return sib?.id ?? editAppt.id; })(),
                      note: styleNoteForm.note,
                      serviceType: styleNoteForm.serviceType || undefined,
                      bladeSize: styleNoteForm.bladeSize || undefined,
                      combSize: styleNoteForm.combSize || undefined,
                      bodyLength: styleNoteForm.bodyLength || undefined,
                      headStyle: styleNoteForm.headStyle || undefined,
                      faceStyle: styleNoteForm.faceStyle || undefined,
                      earStyle: styleNoteForm.earStyle || undefined,
                      legStyle: styleNoteForm.legStyle || undefined,
                      tailStyle: styleNoteForm.tailStyle || undefined,
                      warnings: styleNoteForm.warnings || undefined,
                      alertLevel: styleNoteForm.alertLevel || undefined,
                      photoUrl: styleNoteForm.photoUrl || undefined,
                      photoKey: styleNoteForm.photoKey || undefined,
                    })}>
                    {createStyleNote.isPending ? "Saving..." : "Save Style Card"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Full style history</p>
                  {styleNotes.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                  {(styleNotes.data ?? []).length === 0 && !styleNotes.isLoading && <p className="text-xs text-muted-foreground text-center py-4">No style cards yet</p>}
                  {(styleNotes.data ?? []).map(n => (
                    <div key={n.id} className={`rounded-lg border bg-card p-3 text-xs space-y-2 ${(n as any).alertLevel === "danger" ? "border-red-400" : (n as any).alertLevel === "caution" ? "border-amber-400" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-muted-foreground">{new Date(n.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}{n.staffName ? ` · ${n.staffName}` : ""}</span>
                          {(n as any).serviceType && <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 capitalize">{(n as any).serviceType.replace("_"," ")}</span>}
                          {(n as any).alertLevel === "danger" && <span className="bg-red-100 text-red-600 rounded px-1.5 py-0.5 font-semibold">🔴 Danger</span>}
                          {(n as any).alertLevel === "caution" && <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-semibold">⚠ Caution</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="text-xs text-primary hover:underline" onClick={() => { setStyleNoteForm({ note: n.note ?? "", serviceType: (n as any).serviceType ?? "", bladeSize: n.bladeSize ?? "", combSize: (n as any).combSize ?? "", bodyLength: n.bodyLength ?? "", headStyle: (n as any).headStyle ?? "", faceStyle: n.faceStyle ?? "", earStyle: n.earStyle ?? "", legStyle: (n as any).legStyle ?? "", tailStyle: n.tailStyle ?? "", warnings: (n as any).warnings ?? "", alertLevel: (n as any).alertLevel ?? "", photoUrl: n.photoUrl ?? "", photoKey: "" }); toast.success("Style loaded — edit and save as new"); }}>↩ Use</button>
                          <button className="text-muted-foreground hover:text-red-500 ml-1" onClick={() => setConfirmDelete({ type: "styleNote", id: n.id, label: new Date(n.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) })}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {(n as any).warnings && <div className={`rounded px-2 py-1 text-xs ${(n as any).alertLevel === "danger" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}><span className="font-semibold">⚠ </span>{(n as any).warnings}</div>}
                      <div className="flex flex-wrap gap-1">
                        {n.bladeSize && <span className="bg-muted rounded px-1.5 py-0.5">Blade: {n.bladeSize}</span>}
                        {(n as any).combSize && <span className="bg-muted rounded px-1.5 py-0.5">Comb: {(n as any).combSize}</span>}
                        {n.bodyLength && <span className="bg-muted rounded px-1.5 py-0.5">Body: {n.bodyLength}</span>}
                        {(n as any).headStyle && <span className="bg-muted rounded px-1.5 py-0.5">Head: {(n as any).headStyle}</span>}
                        {n.faceStyle && <span className="bg-muted rounded px-1.5 py-0.5">Face: {n.faceStyle}</span>}
                        {n.earStyle && <span className="bg-muted rounded px-1.5 py-0.5">Ears: {n.earStyle}</span>}
                        {(n as any).legStyle && <span className="bg-muted rounded px-1.5 py-0.5">Legs: {(n as any).legStyle}</span>}
                        {n.tailStyle && <span className="bg-muted rounded px-1.5 py-0.5">Tail: {n.tailStyle}</span>}
                      </div>
                      <p className="text-foreground">{n.note}</p>
                      {n.photoUrl && <a href={n.photoUrl} target="_blank" rel="noopener noreferrer"><img src={n.photoUrl} alt="style ref" className="mt-1.5 h-20 w-20 rounded-lg object-cover border hover:opacity-80 transition-opacity" /></a>}
                    </div>
                  ))}
                </div>
                {(styleNotes.data ?? []).length > 0 && (
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => {
                      const notes = styleNotes.data ?? [];
                      const activePetId = selectedStylePetId ?? editAppt.petId;
                      const allPets = [editAppt, ...editSiblings];
                      const activePet = allPets.find(p => p.petId === activePetId);
                      const petName = activePet?.petName ?? editAppt.petName ?? "Pet";
                      const clientName = [editAppt?.clientFirstName, editAppt?.clientLastName].filter(Boolean).join(" ");
                      const biz = tenantInfo;
                      const logoAbsUrl = biz?.logoUrl ? (biz.logoUrl.startsWith("/") ? `${window.location.origin}${biz.logoUrl}` : biz.logoUrl) : null;
                      const html = `<!DOCTYPE html><html><head><title>Groom Style — ${petName}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#111}.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px}.header-left{display:flex;align-items:center;gap:14px}.header-logo{height:52px;width:auto;object-fit:contain}.biz-name{font-size:16px;font-weight:700;margin:0 0 3px}.biz-contact{font-size:11px;color:#666;line-height:1.6}.header-right{text-align:right;font-size:11px;color:#888}.header-right strong{display:block;font-size:14px;color:#111;font-weight:600}.card{border:1px solid #ddd;border-radius:6px;padding:12px 16px;margin-bottom:12px;page-break-inside:avoid}.card.danger{border-color:#f87171}.card.caution{border-color:#fbbf24}.meta{font-size:11px;color:#888;margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap}.badge{background:#f0f0f0;border-radius:4px;padding:2px 8px;font-size:11px}.badge.alert-danger{background:#fee2e2;color:#b91c1c}.badge.alert-caution{background:#fef3c7;color:#92400e}.warning-box{background:#fef3c7;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:12px;color:#92400e}.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.tag{background:#f0f0f0;border-radius:4px;padding:2px 8px;font-size:11px}.body{font-size:13px}@media print{body{margin:16px}}</style></head><body><div class="header"><div class="header-left">${logoAbsUrl ? `<img src="${logoAbsUrl}" class="header-logo" alt="logo" />` : ""}<div><p class="biz-name">${biz?.name ?? "Grooming Salon"}</p><div class="biz-contact">${biz?.phone ? `<span>${biz.phone}</span><br/>` : ""}${biz?.email ? `<span>${biz.email}</span><br/>` : ""}${biz?.address ? `<span>${biz.address}</span>` : ""}</div></div></div><div class="header-right"><strong>Groom Style History</strong>${clientName}<br/>${petName}<br/>Printed ${new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}</div></div>${notes.map(n=>`<div class="card${(n as any).alertLevel==="danger"?" danger":(n as any).alertLevel==="caution"?" caution":""}"><div class="meta"><span>${new Date(n.createdAt).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}${n.staffName?` · ${n.staffName}`:""}</span>${(n as any).serviceType?`<span class="badge">${(n as any).serviceType.replace("_"," ")}</span>`:""} ${(n as any).alertLevel==="danger"?`<span class="badge alert-danger">🔴 Danger</span>`:(n as any).alertLevel==="caution"?`<span class="badge alert-caution">⚠ Caution</span>`:""}</div>${(n as any).warnings?`<div class="warning-box">⚠ ${(n as any).warnings}</div>`:""}<div class="tags">${[n.bladeSize&&`<span class="tag">Blade: ${n.bladeSize}</span>`,(n as any).combSize&&`<span class="tag">Comb: ${(n as any).combSize}</span>`,n.bodyLength&&`<span class="tag">Body: ${n.bodyLength}</span>`,(n as any).headStyle&&`<span class="tag">Head: ${(n as any).headStyle}</span>`,n.faceStyle&&`<span class="tag">Face: ${n.faceStyle}</span>`,n.earStyle&&`<span class="tag">Ears: ${n.earStyle}</span>`,(n as any).legStyle&&`<span class="tag">Legs: ${(n as any).legStyle}</span>`,n.tailStyle&&`<span class="tag">Tail: ${n.tailStyle}</span>`].filter(Boolean).join("")}</div><div class="body">${n.note}</div></div>`).join("")}</body></html>`;
                      const w = window.open("","_blank","width=800,height=600");
                      if (w){w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);}
                      else toast.error("Pop-up blocked.");
                    }}><Printer className="h-3 w-3" /> Print / Save as PDF</Button>
                  </div>
                )}
                </div>
              </TabsContent>

              {/* ── Grooming Report Tab ── */}
              <TabsContent value="report" className="pt-2">
                {(() => {
                  const allPets = [editAppt, ...editSiblings];
                  if (allPets.length <= 1) {
                    return (
                      <div className="max-h-[70vh] overflow-y-auto pr-1">
                        <GroomingReportPanel
                          appt={editAppt}
                          copyFrom={copySnap}
                          onCopyApplied={() => setCopySnap(null)}
                        />
                      </div>
                    );
                  }
                  return (
                    <Tabs defaultValue={String(allPets[0].id)}>
                      <TabsList className="w-full mb-3">
                        {allPets.map(pet => (
                          <TabsTrigger key={pet.id} value={String(pet.id)} className="flex-1 gap-1.5">
                            <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{(pet.petName ?? "?")[0]}</span>
                            {pet.petName}
                            {reportStatusMap[pet.id] === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                            {reportStatusMap[pet.id] === "draft" && <span className="text-[9px] bg-amber-100 text-amber-700 rounded px-1">Draft</span>}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {allPets.map(pet => (
                        <TabsContent key={pet.id} value={String(pet.id)} className="mt-0">
                          <div className="max-h-[65vh] overflow-y-auto pr-1">
                            <GroomingReportPanel
                              appt={pet}
                              onCopyToAll={(snap) => setCopySnap(snap)}
                              copyFrom={copySnap}
                              onCopyApplied={() => setCopySnap(null)}
                            />
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  );
                })()}
              </TabsContent>

            </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* ── Block Out Dialog ── */}
      <Dialog open={showBlockoutDialog} onOpenChange={setShowBlockoutDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-red-500" />
              Block Out Groomer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Groomer <span className="text-red-500">*</span></Label>
              <Select value={blockoutForm.staffId} onValueChange={v => setBlockoutForm(f => ({ ...f, staffId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select groomer..." /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full inline-block" style={{ background: s.colourHex ?? "#6366f1" }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={blockoutForm.blockoutDate} onChange={e => setBlockoutForm(f => ({ ...f, blockoutDate: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isFullDay"
                checked={blockoutForm.isFullDay}
                onChange={e => setBlockoutForm(f => ({ ...f, isFullDay: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="isFullDay">Full day blockout</Label>
            </div>
            {!blockoutForm.isFullDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input type="time" value={blockoutForm.startTime} onChange={e => setBlockoutForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time</Label>
                  <Input type="time" value={blockoutForm.endTime} onChange={e => setBlockoutForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input placeholder="e.g. Annual leave, sick day, training..." value={blockoutForm.reason} onChange={e => setBlockoutForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockoutDialog(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!blockoutForm.staffId || !blockoutForm.blockoutDate || createBlockoutMutation.isPending}
              onClick={() => {
                createBlockoutMutation.mutate({
                  tenantId: 1,
                  staffId: parseInt(blockoutForm.staffId),
                  blockoutDate: blockoutForm.blockoutDate,
                  isFullDay: blockoutForm.isFullDay,
                  startTime: blockoutForm.isFullDay ? undefined : blockoutForm.startTime,
                  endTime: blockoutForm.isFullDay ? undefined : blockoutForm.endTime,
                  reason: blockoutForm.reason || undefined,
                });
              }}
            >
              {createBlockoutMutation.isPending ? "Saving..." : "Block Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Confirm Delete Dialog ── */}
      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDelete?.type === "blockout"
              ? <span>Are you sure you want to remove the block-out period <strong className="text-foreground">&ldquo;{confirmDelete.label}&rdquo;</strong>? This cannot be undone.</span>
              : confirmDelete?.type === "appointment"
                ? <span>Are you sure you want to delete <strong className="text-foreground">{confirmDelete.label}</strong>? Any pets in this shared booking will be deleted together. Financial records are retained without the appointment link. This cannot be undone.</span>
                : <span>Are you sure you want to delete the style note from <strong className="text-foreground">{confirmDelete?.label}</strong>? This cannot be undone.</span>
            }
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteBlockoutMutation.isPending || deleteStyleNote.isPending || deleteAppointmentMutation.isPending}
              onClick={() => {
                if (!confirmDelete) return;
                if (confirmDelete.type === "blockout") {
                  deleteBlockoutMutation.mutate({ id: confirmDelete.id }, { onSuccess: () => setConfirmDelete(null) });
                } else if (confirmDelete.type === "appointment") {
                  deleteAppointmentMutation.mutate({ appointmentId: confirmDelete.id });
                } else {
                  deleteStyleNote.mutate({ id: confirmDelete.id }, { onSuccess: () => setConfirmDelete(null) });
                }
              }}
            >
              {(deleteBlockoutMutation.isPending || deleteStyleNote.isPending || deleteAppointmentMutation.isPending) ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
