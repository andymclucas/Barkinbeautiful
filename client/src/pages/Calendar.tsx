import DashboardLayout from "@/components/DashboardLayout";
import { groomerDayLoad, isClip, overbookingWarning } from "@shared/groomerCapacity";
import { newAppointmentError, autoSelectedPetIds } from "@shared/newAppointmentValidation";
import { preferredGroomerDefaults } from "@shared/preferredGroomerDefaults";
import { formatCollectBy } from "@shared/collectBy";
import { workflowStateLabel } from "@shared/workflowStateLabels";
import { trpc } from "@/lib/trpc";
import {
  calendarColumnGroups,
  resolveCalendarStaffColumns,
  withUnassignedColumn,
} from "@/lib/calendarStaffColumns";
import {
  calendarStaffFilterKey,
  calendarUnassignedColumnKey,
  parseShowUnassignedColumn,
  serialiseShowUnassignedColumn,
  coversAllStaff,
  DEFAULT_CALENDAR_STAFF_SELECTION,
  describeCalendarStaffSelection,
  parseCalendarStaffSelection,
  serialiseCalendarStaffSelection,
  splitCalendarStaff,
  toggleCalendarStaff,
  visibleStaffIds as resolveVisibleStaffIds,
  type CalendarStaffSelection,
} from "@shared/calendarStaffSelection";
import { useAuth } from "@/_core/hooks/useAuth";
import { getDayCalendarGridSizing } from "@/lib/calendarGridSizing";
import { buildAestDragSchedule } from "@/lib/calendarDragSchedule";
import { GROOM_CONDITION_LABELS, GROOM_RATING_LABELS } from "@shared/groomingCard";
import { arrivalLabel, hasArrivedOnSite } from "@shared/appointmentArrival";
import { buildSharedAppointmentPriceBreakdown } from "@shared/sharedAppointmentPricing";
import { buildCalendarDragTargetMinutes, formatCalendarDragTargetTime } from "@shared/calendarDragTarget";
import { formatSharedAppointmentName, formatAppointmentHeading } from "@shared/appointmentDisplay";
import {
  appointmentDetailChanges,
  hasAppointmentDetailChanges,
} from "@shared/appointmentDetailChanges";
import {
  contactBadgeLabel,
  contactChoiceIsStale,
  contactOptions,
  resolveAppointmentContact,
} from "@shared/appointmentContact";
import {
  EMPTY_STYLE_NOTE_DRAFT,
  activeStylePetId,
  styleDraftFromNote,
  type StyleNoteDraft,
} from "@shared/styleNoteDraft";
import { formatAestDate, formatAestDateTime } from "@shared/auditTimestamp";
import { getAutoDurationMinutesForPets } from "@shared/appointmentDuration";
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
import { CalendarSidebar } from "@/components/CalendarSidebar";
import { PetPhotoQuickAdd } from "@/components/PetPhotoQuickAdd";
import { SplitPaymentPanel } from "@/components/SplitPaymentPanel";
import { ApplyDiscountDialog } from "@/components/ApplyDiscountDialog";
import { describeDiscount } from "@shared/appointmentDiscount";
import { summariseCalendar } from "@shared/calendarSummary";
import { liveSiblings } from "@shared/bookingSiblings";
import { splitAppointmentsByTime } from "@shared/appointmentHistorySplit";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, Pencil, Filter, CalendarIcon, Ban, Trash2, AlertTriangle, Printer, Camera, X, Search,
  FileDown, Check, CheckCircle2, ImagePlus, Mail, ChevronDown, ChevronUp, Clock, ExternalLink,
  Clock3,
} from "lucide-react";
import { WaitlistPanel } from "@/components/WaitlistPanel";
import { AngelWings } from "@/components/AngelWings";
import { petHasPassedAway, PET_CANNOT_BE_SELECTED } from "@shared/petBookable";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { StaffAvatar } from "@/components/StaffAvatar";
import { BlockoutDialog, type BlockoutEditing } from "@/components/BlockoutDialog";
import { BookingPetPricing, type StagedAddOn } from "@/components/BookingPetPricing";
import { NewClientQuickAdd } from "@/components/NewClientQuickAdd";
import { buildTimeSlots, splitLocalDateTime, joinLocalDateTime } from "@shared/bookingTimeSlots";
import { timeValueToMinutes } from "@shared/bookingTimeSlots";
import { annotateSlots, clashesFor, clashWarning, describeClash } from "@shared/groomerAvailability";
import { takePendingBooking } from "@/lib/pendingBooking";
import { isCancelledAppointment, preservesOriginalSchedule, canDragAppointment } from "@shared/cancelledAppointment";
import { AppointmentAddOns } from "@/components/AppointmentAddOns";
import { blockoutDateKey } from "@shared/staffBlockouts";
import { distinctClientCount, soleClientOf } from "@shared/appointmentSearch";
import { getActiveTimeZone } from "@/lib/timezone";

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

// All twelve, in workflow order. The three waiting states used to be
// missing, so a dog actually sitting in one — six of them right now —
// opened this dialog with a BLANK status, and saving from there was a
// guess. They are set from the workflow board, so they have to be
// readable here.
const WORKFLOW_COLOURS: Record<string, string> = {
  scheduled:  "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300",
  checked_in: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300",
  waiting_for_bath: "bg-slate-100 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300",
  bathing:    "bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-300",
  waiting_for_dry: "bg-slate-100 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300",
  drying:     "bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-300",
  waiting_for_groom: "bg-slate-100 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300",
  grooming:   "bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-300",
  ready:      "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300",
  complete:   "bg-muted text-muted-foreground",
  cancelled:  "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
  no_show:    "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
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
  return formatAestDate(date, { weekday: "short", day: "numeric", month: "short" });
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
    while (j < result.length && (j === i || new Date(result[j].appt.scheduledStart).getTime() < maxEnd)) {
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
  collectBy?: string | Date | null;
  status: string;
  serviceType: string;
  notes: string | null;
  price: string | null;
  /** What price was before the discount. price is the net figure. */
  preDiscountPrice: string | null;
  discountPercent: number | null;
  discountReason: string | null;
  staffId: number | null;
  clientId: number;
  petId: number;
  /**
   * Who to ring about this booking. Null is the client themselves, which is
   * the default and what every appointment made before contacts existed
   * means. The joined name comes with it so the board can show it without a
   * request per card.
   */
  contactId?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactRelationship?: string | null;
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
/**
 * "This dog is here."
 *
 * Filled and leading the name, where the reminder-delivered tick is an
 * outline and trails it. Two green ticks on one block would be worse than
 * one, so they must not look alike.
 */
function ArrivedTick({ workflowState }: { workflowState: string }) {
  const label = arrivalLabel(workflowState);
  return (
    <span title={label} className="inline-flex align-[-2px]">
      <CheckCircle2
        aria-label={label}
        className="mr-1 h-3.5 w-3.5 shrink-0 fill-emerald-600 text-white dark:fill-emerald-500"
      />
    </span>
  );
}

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
  const isCancelled = isCancelledAppointment(appt);
  const canDrag = canDragAppointment(appt, Boolean(onDragStart));

  if (top > containerHeight || top + height < 0) return null;

  const wfLabel = workflowStateLabel(appt.workflowState);
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
        // Cancelled blocks recede rather than shout. They used to be the
        // loudest thing on the board - red wash, red 4px spine, red shadow,
        // white-on-red badge - so a cancelled dog drew more attention than
        // the ones actually coming in. Now they keep the service colour at
        // low opacity so they read as "was here, gone" at a glance.
        background: isCancelled ? "linear-gradient(135deg, #f8fafc 0%, #ffffff 180%)" : `linear-gradient(135deg, ${svc.bg} 0%, #ffffff 180%)`,
        borderLeft: `4px ${isCancelled ? "dashed #cbd5e1" : `solid ${svc.border}`}`,
        boxShadow: isCancelled ? "none" : `inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px ${svc.border}`,
        opacity: isCancelled ? 0.45 : 1,
        zIndex: 2,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onDragStart={canDrag && onDragStart ? (e) => onDragStart(e, appt) : undefined}
      onDragEnd={onDragEnd}
      aria-label={`${isCancelled ? "Cancelled " : ""}appointment for ${sharedAppointmentLabel || "pet"}${hasArrivedOnSite(appt.workflowState, appt.status) ? ", checked in" : ""}`}
    >
      <div className="px-2 py-1 h-full overflow-hidden leading-tight">
        {isCancelled && <div className="mb-1 inline-flex rounded-sm border border-border bg-card/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cancelled</div>}
        {siblings && siblings.length > 0 ? (
          <>
            <div className={`font-bold text-[12px] leading-tight tracking-[-0.01em] ${isCancelled ? "line-through decoration-1 decoration-slate-400" : ""}`} style={{ color: isCancelled ? "#991b1b" : svc.border }}>
              <div className="leading-tight" title={sharedAppointmentLabel}>
                {hasArrivedOnSite(appt.workflowState, appt.status) && <ArrivedTick workflowState={appt.workflowState} />}
                {sharedAppointmentLabel}
              </div>
              {appt.reminderStatus === "delivered" && <CheckCircle2 aria-label="Reminder delivered" className="inline ml-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
            </div>
            {!compact && <div className="mt-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text }}>{sharedPetAppointments.length} dogs · family booking</div>}
            {!compact && (
              <div className="truncate text-[10px] mt-0.5 font-medium" style={{ color: isCancelled ? "#991b1b" : svc.text }}>
                {fmtTime(new Date(appt.scheduledStart))} – {fmtTime(new Date(appt.scheduledEnd))}
              </div>
            )}
            {showService && <div className="mt-1 inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text, backgroundColor: "rgba(255,255,255,0.72)" }}>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</div>}
          </>
        ) : (
          <>
            <div className={`font-bold text-[12px] truncate tracking-[-0.01em] ${isCancelled ? "line-through decoration-1 decoration-slate-400" : ""}`} style={{ color: isCancelled ? "#991b1b" : svc.border }}>
              {hasArrivedOnSite(appt.workflowState, appt.status) && <ArrivedTick workflowState={appt.workflowState} />}
              {appt.petName}{appt.clientLastName ? ` ${appt.clientLastName}` : ""}
              {appt.reminderStatus === "delivered" && <CheckCircle2 aria-label="Reminder delivered" className="inline ml-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
            </div>
            {!compact && (
              <>
                <div className="truncate text-[10px] mt-0.5 font-medium" style={{ color: isCancelled ? "#991b1b" : svc.text }}>
                  {fmtTime(new Date(appt.scheduledStart))} – {fmtTime(new Date(appt.scheduledEnd))}
                </div>
                {showService && <div className="mt-1 inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text, backgroundColor: "rgba(255,255,255,0.72)" }}>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</div>}
                {appt.nextAppointmentDate && (
                  <div className="truncate text-[10px] mt-0.5 font-medium" style={{ color: svc.border, opacity: 0.9 }}>
                    Next: {new Date(appt.nextAppointmentDate).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short" })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="absolute top-1 right-1 rounded-full bg-card/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
              {sharedPriceBreakdown.map((entry, index) => <div key={`${entry.petName}-${index}`} className="flex justify-between gap-4"><span>{entry.petName}</span><span className={entry.formattedAmount ? "font-medium" : retainedBookingTotal ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>{entry.formattedAmount ?? (retainedBookingTotal ? "Included in booking total" : "Price to confirm")}</span></div>)}
              <div className="flex justify-between gap-4 border-t pt-1 mt-1 font-semibold"><span>Booking total</span><span>{retainedBookingTotal ?? "Confirm each price"}</span></div>
            </div>
          ) : appt.price && <div><span className="text-muted-foreground">Price: </span>${Number(appt.price).toFixed(2)}</div>}
          {appt.lastAppointmentDate && <div><span className="text-muted-foreground">Last appt: </span>{new Date(appt.lastAppointmentDate).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>}
          {appt.nextAppointmentDate && <div><span className="text-muted-foreground">Next appt: </span>{new Date(appt.nextAppointmentDate).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>}
          {appt.reminderStatus === "delivered" && <div className="text-emerald-700 dark:text-emerald-300"><span className="text-muted-foreground">Reminder: </span>Delivered</div>}
          {appt.reminderStatus === "sent" && <div className="text-amber-700 dark:text-amber-300"><span className="text-muted-foreground">Reminder: </span>Sent; awaiting delivery update</div>}
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
// Shared with the client portal so the card a client is emailed and the card
// they see when they log in cannot drift apart. See shared/groomingCard.ts.
const RATING_LABELS = GROOM_RATING_LABELS;
const CONDITION_LABELS = GROOM_CONDITION_LABELS;

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
      appointmentId: appt.id, petId: appt.petId, overallRating: rating as "pawfect" | "great" | "good" | "okay" | "difficult",
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
      <div style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);padding:24px 28px;border-radius:18px;color:#fff">
        <div style="font-size:11px;letter-spacing:.12em;font-weight:700;opacity:.82">BARKIN BEAUTIFUL</div>
        <div style="font-size:27px;font-weight:800;margin-top:8px">${escapeHtml(appt.petName ?? "Your pet")}'s Grooming Card</div>
        <div style="font-size:13px;opacity:.9;margin-top:5px">${escapeHtml(new Date(appt.scheduledStart).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · Groomed by ${escapeHtml(appt.staffName ?? "your Groomigo groomer")}</div>
      </div>
      <div style="padding:24px 6px">
        <div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin-bottom:6px">TODAY'S SERVICE</div>
        <div style="font-size:17px;font-weight:800;color:#172033">${escapeHtml(serviceLabel)}</div>
        ${photoSection}
        <div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">OVERALL</div>
        <div style="font-size:18px;font-weight:800;color:#6d28d9">${escapeHtml(RATING_LABELS[rating] ?? rating)}</div>
        ${moods.length ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">MOOD</div><div>${moods.map(m => `<span style="display:inline-block;background:#f5f3ff;border-radius:999px;padding:5px 10px;font-size:12px;margin:0 5px 5px 0;color:#5b21b6">${escapeHtml(m)}</span>`).join("")}</div>` : ""}
        ${note ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">A NOTE FROM YOUR GROOMER</div><div style="background:#f8fafc;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(note)}</div>` : ""}
        ${conditionRows ? `<div style="font-size:11px;letter-spacing:.1em;color:#64748b;font-weight:700;margin:20px 0 6px">WE CHECKED</div><table style="width:100%;border-collapse:collapse">${conditionRows}</table>` : ""}
        ${freqWeeks ? `<div style="background:#f5f3ff;border-radius:12px;padding:13px 14px;margin-top:20px"><div style="font-size:10px;letter-spacing:.1em;color:#6d28d9;font-weight:700">RECOMMENDED FREQUENCY</div><div style="font-size:16px;color:#5b21b6;font-weight:800;margin-top:3px">Every ${escapeHtml(freqWeeks)} weeks</div></div>` : ""}
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
            {existing?.status === "sent" && <span className="text-xs bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5 whitespace-nowrap">Sent</span>}
            {existing?.status === "draft" && <span className="text-xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 whitespace-nowrap">Draft</span>}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
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
          <div className="bg-card rounded-xl shadow-2xl w-[680px] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
  // Identifies whose filter this is. auth.me is already fetched and cached
  // by the dashboard shell, so this costs nothing.
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [weekStart, setWeekStart]   = useState(() => getWeekStart(getTodayAEST()));
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [editAppt, setEditAppt]     = useState<Appt | null>(null);
  const [copySnap, setCopySnap]     = useState<ReportSnapshot | null>(null);
  const [viewMode, setViewMode]     = useState<"week" | "day">("day");
  const [dayDate, setDayDate]       = useState(() => getTodayAEST());
  // The diary opens on the grooming side; the bathing team is opt-in from the
  // staff menu. Held as an INTENT rather than a list of ids so that a groomer
  // hired next month appears without anybody reopening the filter — see
  // shared/calendarStaffSelection.ts.
  const [staffSelection, setStaffSelection] = useState<CalendarStaffSelection>(
    DEFAULT_CALENDAR_STAFF_SELECTION,
  );
  // Which storage key the current selection was restored FROM, or null
  // before anything has been read.
  //
  // A key rather than a boolean, so a user switching accounts without a
  // remount cannot have the previous person's selection written under their
  // name — which is the leak the per-user key exists to prevent.
  const restoredStaffFilterKey = useRef<string | null>(null);
  // The Unassigned column is a column but not a staff member, so it gets
  // its own tick rather than a sentinel id inside the staff selection.
  // Shown by default: it only appears on days that have a dog with nobody
  // against them, and those are exactly the ones worth seeing.
  const [showUnassignedColumn, setShowUnassignedColumn] = useState(true);
  // Adding a contact from the appointment, because the client record is
  // where the "Pickup contacts" form lives and /clients/:id is not a
  // staff-reachable route — so for a groomer that form may as well not
  // exist. The moment somebody learns that the daughter collects the dog
  // is the moment they are looking at the booking.
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "", relationship: "" });
  const [apptSearchOpen, setApptSearchOpen] = useState(false);
  const [apptSearchTerm, setApptSearchTerm] = useState("");

  const [collectByDraft, setCollectByDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // The day board's own width, so the staff columns can be sized to fit it
  // instead of always taking 320px each and pushing the salon off-screen.
  // Measured rather than guessed from the viewport: the sidebar, the padding
  // and the week/day toggle all eat into it, and a guess is wrong on every
  // screen but the one it was tuned on.
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      // Zero means the board is hidden (another view is showing). Keeping
      // the last real measurement stops the columns collapsing to their
      // minimum and then visibly snapping back when the day view returns.
      if (width && width > 0) setBoardWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBlockoutDialog, setShowBlockoutDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "blockout" | "styleNote" | "appointment"; id: number; label: string } | null>(null);
  /** The blockout being edited, or null when creating a new one. */
  const [blockoutEditing, setBlockoutEditing] = useState<BlockoutEditing | null>(null);
  const [blockoutDefaultDate, setBlockoutDefaultDate] = useState("");

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
    clientId: "", petIds: [] as string[], staffId: "", staffByPetId: {} as Record<string, string>, serviceType: "classic_groom",
    scheduledStart: "", scheduledEnd: "", notes: "", price: "",
    // A figure per dog. The single `price` above stays for the recurring
    // path, which books one service for the whole family.
    priceByPetId: {} as Record<string, string>,
    addOnsByPetId: {} as Record<string, StagedAddOn[]>,
    // "Must be finished by". Empty means no deadline, which is most
    // bookings — this is for the client who says "I need him by twelve".
    collectByTime: "",
  });
  const [repeatForm, setRepeatForm] = useState({ enabled: false, frequencyWeeks: "6", untilDate: "" });
  /** The "+ New client" form, open inside the client picker. */
  const [addingClient, setAddingClient] = useState(false);

  /**
   * A booking handed over from Add Client.
   *
   * Adding a client and booking their first groom is one job for the
   * person at the desk, but the booking form lives here because it owns
   * the conflict and capacity checks. Add Client stages what it collected
   * and this opens the dialog already filled in, leaving only the date,
   * time and groomer.
   *
   * Runs once on mount and consumes the entry, so revisiting the diary
   * later never re-opens a dialog for a client booked half an hour ago.
   */
  useEffect(() => {
    const pending = takePendingBooking();
    if (!pending) return;
    setNewAppt(current => ({
      ...current,
      clientId: String(pending.clientId),
      petIds: pending.petIds.map(String),
      serviceType: pending.serviceType,
      addOnsByPetId: pending.addOnsByPetId,
      priceByPetId: {},
    }));
    setShowNewAppt(true);
    if (pending.clientName) toast.success(`Booking ${pending.clientName}'s first groom`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showWaitlist, setShowWaitlist] = useState(false);
  // Polled with everything else on this page, so a claim that arrives
  // while the calendar is open shows on the button without a reload.
  const waitlistClaims = trpc.waitlist.listClaims.useQuery({});
  const waitlistClaimCount = waitlistClaims.data?.length ?? 0;
  const [editForm, setEditForm] = useState({
    staffId: "", serviceType: "", scheduledStart: "", scheduledEnd: "",
    notes: "", price: "", workflowState: "",
    // Who to ring about this booking. null is the client themselves.
    contactId: null as number | null,
  });
  const preservesCancelledSchedule = preservesOriginalSchedule(editAppt, editForm.workflowState);
  // Per-pet groomer overrides for multi-pet sessions: { [appointmentId]: staffId }
  const [siblingGroomers, setSiblingGroomers] = useState<Record<number, string>>({});
  // Per-pet price overrides for multi-pet sessions: { [appointmentId]: price string }
  const [siblingPrices, setSiblingPrices] = useState<Record<number, string>>({});
  // Per-pet service overrides for multi-pet sessions: { [appointmentId]: serviceType }
  // One dog in a family can have a classic groom while the other has a styled
  // cut; the service is not a property of the booking.
  const [siblingServices, setSiblingServices] = useState<Record<number, string>>({});
  const [styleNoteForm, setStyleNoteForm] = useState<StyleNoteDraft>({ ...EMPTY_STYLE_NOTE_DRAFT });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedStylePetId, setSelectedStylePetId] = useState<number | null>(null);
  /**
   * The dog the style draft is for. A draft belongs to exactly one dog, so
   * it is dropped the moment this changes — closing the dialog, or switching
   * dogs inside it. Without this, Lauren opened Maisie's box and found
   * Teddy's blade sizes and Teddy's photo under Maisie's name, and saving
   * there would have written them to Maisie. See shared/styleNoteDraft.
   */
  const styleTargetPetId = activeStylePetId({
    selectedStylePetId,
    appointmentPetId: editAppt?.petId ?? null,
  });
  useEffect(() => {
    setStyleNoteForm({ ...EMPTY_STYLE_NOTE_DRAFT });
    setPhotoPreview(null);
  }, [styleTargetPetId]);
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
    dateFrom: queryFrom.toISOString(),
    dateTo: queryTo.toISOString(),
  });
  /**
   * Turn a clicked blockout into something the dialog can edit.
   *
   * A range is stored as one row per day sharing a group id, so the first
   * and last day have to be found across its siblings — clicking the
   * middle of someone's leave must still open the whole run, not the one
   * day that happened to be under the pointer.
   */
  const openBlockout = (b: { id: number; staffId: number; blockoutDate: Date; isFullDay: boolean; startTime: string | null; endTime: string | null; reason: string | null; groupId?: string | null }) => {
    const siblings = (blockouts ?? []).filter(o =>
      b.groupId ? (o as { groupId?: string | null }).groupId === b.groupId : o.id === b.id);
    const keys = siblings.map(o => blockoutDateKey(o.blockoutDate)).sort();
    setBlockoutEditing({
      id: b.id,
      staffId: b.staffId,
      startDate: keys[0] ?? blockoutDateKey(b.blockoutDate),
      endDate: keys[keys.length - 1] ?? blockoutDateKey(b.blockoutDate),
      isFullDay: b.isFullDay,
      startTime: b.startTime,
      endTime: b.endTime,
      reason: b.reason,
      groupId: (b as { groupId?: string | null }).groupId ?? null,
    });
    setShowBlockoutDialog(true);
  };

  const deleteBlockoutMutation = trpc.staff.deleteBlockout.useMutation({
    onSuccess: () => { toast.success("Blockout removed"); refetchBlockouts(); },
    onError: (e) => toast.error(e.message),
  });

  // Who may be rung about the client whose dialog is open. operational, so
  // a groomer sees it too — they are the ones deciding who to call.
  const editContacts = trpc.clients.listContacts.useQuery(
    { clientId: editAppt?.clientId ?? 0 },
    { enabled: !!editAppt?.clientId },
  );
  const editContactOptions = useMemo(
    () => contactOptions(
      {
        firstName: editAppt?.clientFirstName,
        lastName: editAppt?.clientLastName,
        phone: editAppt?.clientPhone,
      },
      editContacts.data ?? [],
    ),
    [editAppt, editContacts.data],
  );

  const addClientContact = trpc.clients.addContact.useMutation({
    onSuccess: (created) => {
      toast.success("Contact added");
      setAddingContact(false);
      setNewContact({ name: "", phone: "", relationship: "" });
      // Select the person who was just added — that is why they were added.
      setEditForm((prev) => ({ ...prev, contactId: created.id }));
      editContacts.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const styleNotes = trpc.groomNotes.listByPet.useQuery(
    { petId: styleTargetPetId ?? 0 },
    { enabled: styleTargetPetId !== null }
  );
  const lastCompletedStyle = trpc.groomNotes.getLastCompletedStyle.useQuery(
    { petId: styleTargetPetId ?? 0 },
    { enabled: styleTargetPetId !== null }
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
      setStyleNoteForm({ ...EMPTY_STYLE_NOTE_DRAFT });
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
    setStyleNoteForm(styleDraftFromNote(last));
    setPhotoPreview(last.photoUrl ?? null);
    toast.success("Last completed style loaded. Review and save as a new style when ready.");
  };

  const { data: weekAppts, refetch } = trpc.calendar.getAppointments.useQuery({
    dateFrom: queryFrom.toISOString(),
    dateTo:   queryTo.toISOString(),
  });

  const { data: apptSearchResults, isFetching: isApptSearchFetching } = trpc.calendar.searchAppointments.useQuery(
    { query: apptSearchTerm },
    { enabled: apptSearchTerm.trim().length >= 2 },
  );

  // Clicking a search result opens this client's whole appointment list.
  // Jumping straight to a date was the old behaviour and looked like nothing
  // happened whenever the match was on the day already shown.
  const [apptListClient, setApptListClient] = useState<{ clientId: number; name: string } | null>(null);
  // Whether the booking dialog is showing a groomer per dog. Collapsed by
  // default: most family bookings go to one person.
  const [splitGroomers, setSplitGroomers] = useState(false);

  // Only the dogs actually being booked, as numbers, and only where a
  // specific groomer was chosen. Undefined when nothing is split, so the
  // common booking sends exactly what it always did.
  const perPetGroomers = useMemo(() => {
    const entries = newAppt.petIds
      .filter(petId => newAppt.staffByPetId[petId])
      .map(petId => [petId, Number(newAppt.staffByPetId[petId])] as const);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }, [newAppt.petIds, newAppt.staffByPetId]);

  const splitGroomerCount = perPetGroomers ? Object.keys(perPetGroomers).length : 0;
  const [showPastAppts, setShowPastAppts] = useState(false);
  const { data: clientAppts, isFetching: isClientApptsFetching } = trpc.calendar.appointmentsForClient.useQuery(
    { clientId: apptListClient?.clientId ?? 0 },
    { enabled: !!apptListClient },
  );
  const clientApptSplit = useMemo(
    () => splitAppointmentsByTime(clientAppts ?? [], new Date()),
    [clientAppts],
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

  const { data: staffList }  = trpc.staff.listOperational.useQuery({});
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
    { search: clientSearch },
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
  const { data: tenantInfo } = trpc.settings.getTenantInfo.useQuery({});

  const createMutation = trpc.calendar.createAppointment.useMutation({
    onSuccess: () => {
      toast.success("Appointment created");
      setShowNewAppt(false);
      setNewAppt({ clientId: "", petIds: [], staffId: "", staffByPetId: {}, serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "", priceByPetId: {}, addOnsByPetId: {}, collectByTime: "" });
      setClientSearch("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const rescheduleMutation = trpc.calendar.reschedule.useMutation({
    onSuccess: () => { toast.success("Appointment updated"); closeEditDialog(); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateDetailsMutation = trpc.calendar.updateDetails.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const createSessionBillsMutation = trpc.calendar.createSessionBills.useMutation({
    onSuccess: (data) => {
      const lines = data.created.map(b => `${b.petName}: $${b.total} (${b.invoiceNumber})`).join("\n");
      toast.success(`${data.created.length} draft invoice${data.created.length !== 1 ? "s" : ""} created:\n${lines}`);
      refetch();
    },
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
  const collectByMutation = trpc.workflow.setCollectBy.useMutation({
    onSuccess: () => {
      toast.success("Collection time saved");
      refetch();
      utils.workflow.getBoard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const workflowMutation = trpc.calendar.updateWorkflowState.useMutation({
    // The board is a different query, and it was never told. It polls every
    // five seconds so it caught up on its own, but "I set it to bathing and
    // the workflow did not change" is what that looks like to somebody who
    // walks straight over and looks. StaffPortal already did this; the
    // calendar did not.
    onSuccess: () => {
      toast.success("Status updated");
      refetch();
      utils.workflow.getBoard.invalidate();
      utils.workflow.getTodayBoard.invalidate();
    },
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
      closeEditDialog();
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
  const activeStaffIds = useMemo(() => activeStaff.map((member) => member.id), [activeStaff]);

  // Bring back the staff columns this user last chose.
  //
  // Waits for the staff list, because a stored list is a snapshot of a
  // roster that has since changed and has to be reconciled against who
  // works here now — see parseCalendarStaffSelection. Runs once: after that
  // the user's own clicks are the source of truth.
  const staffFilterKey = calendarStaffFilterKey(user?.id);

  useEffect(() => {
    if (restoredStaffFilterKey.current === staffFilterKey) return;
    // Wait for the signed-in user, so the choice is never read from or
    // written to the "anon" key on the way through.
    if (!user) return;
    // Wait for the staff LIST, not just the derived columns. The columns
    // resolve from appointments too, so if those land first the roster is
    // briefly partial — and reconciling against a partial roster reads as
    // "this selection covers everyone" and quietly wipes the filter.
    if (!staffList || activeStaffIds.length === 0) return;
    try {
      setStaffSelection(
        parseCalendarStaffSelection(window.localStorage.getItem(staffFilterKey), activeStaff),
      );
      setShowUnassignedColumn(
        parseShowUnassignedColumn(window.localStorage.getItem(calendarUnassignedColumnKey(user.id))),
      );
    } catch {
      // Private browsing, or storage disabled. A remembered filter is a
      // convenience; losing it must never stop the calendar loading.
      setStaffSelection(DEFAULT_CALENDAR_STAFF_SELECTION);
    }
    restoredStaffFilterKey.current = staffFilterKey;
  }, [activeStaff, activeStaffIds, staffFilterKey, staffList, user]);

  useEffect(() => {
    // Only write back to the key the current selection actually came from.
    if (restoredStaffFilterKey.current !== staffFilterKey) return;
    try {
      window.localStorage.setItem(staffFilterKey, serialiseCalendarStaffSelection(staffSelection));
      window.localStorage.setItem(
        calendarUnassignedColumnKey(user?.id),
        serialiseShowUnassignedColumn(showUnassignedColumn),
      );
    } catch {
      // As above — a filter that cannot be saved is not worth an error.
    }
  }, [staffSelection, staffFilterKey, showUnassignedColumn, user]);

  // One source for the grooming/bathing line, shared with the default above:
  // inlined twice before this, which is how a default and the menu grouping
  // it is supposed to match drift apart.
  const { groomers: calendarGroomers, bathers: calendarBathers } = useMemo(
    () => splitCalendarStaff(activeStaff),
    [activeStaff],
  );
  const visibleStaffIds = useMemo(
    () => resolveVisibleStaffIds(staffSelection, activeStaff),
    [staffSelection, activeStaff],
  );
  const weekDays    = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const filteredAppts = useMemo(() => {
    if (!weekAppts) return [];
    const visible = new Set(visibleStaffIds);
    // A dog with nobody assigned belongs to no column, so a staff filter has
    // no opinion on it: it stays in the Unassigned strip under the board and
    // in the day's count. Dropping it here is how 104 unassigned bookings
    // would have silently left the diary the moment the default stopped
    // being "all staff".
    return weekAppts.filter(
      (appointment) => appointment.staffId === null || visible.has(appointment.staffId),
    );
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

  /**
   * The other pets sharing this booking — live ones only.
   *
   * A session keeps holding a dog after it is cancelled, which is right for
   * history and wrong for the block on the calendar: the card builds its
   * name and its price from the siblings, so one cancelled dog made a
   * one-dog booking read "Murphy & Eddie smithson · 2 DOGS".
   *
   * Seen on 09/10/2026, where it looked like a duplicate booking. The two
   * smithson dogs were in DIFFERENT sessions, each session also holding the
   * other dog cancelled, so the calendar drew two two-dog blocks for what
   * was one two-dog booking.
   *
   * A cancelled dog is also shown on its own rather than borrowing the
   * names of the dogs still coming in.
   */
  const getSiblings = (appt: Appt): Appt[] => {
    if (!appt.sessionId) return [];
    return liveSiblings(appt, sessionMap.get(appt.sessionId) ?? []);
  };

  const selectedClientPets = trpc.pets.listByClient.useQuery(
    { clientId: parseInt(newAppt.clientId) },
    { enabled: !!newAppt.clientId && !isNaN(parseInt(newAppt.clientId)) }
  );

  // Drop a dog that has passed away from the selection as soon as the
  // list says so. Tyson was sitting selected and priced in a booking
  // five days after he was recorded, carried in from a prefilled form —
  // and the chip being unclickable does nothing about a selection that
  // was already made.
  useEffect(() => {
    const gone = (selectedClientPets.data ?? [])
      .filter(petHasPassedAway)
      .map((pet: any) => String(pet.id));
    if (gone.length === 0) return;
    setNewAppt(prev => {
      if (!prev.petIds.some(id => gone.includes(id))) return prev;
      const staffByPetId = { ...prev.staffByPetId };
      gone.forEach(id => { delete staffByPetId[id]; });
      return { ...prev, staffByPetId, petIds: prev.petIds.filter(id => !gone.includes(id)) };
    });
  }, [selectedClientPets.data]);
  const selectedAppointmentPetIds = useMemo(
    () => newAppt.petIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
    [newAppt.petIds],
  );
  const membershipCoverage = trpc.calendar.getMembershipCoverage.useQuery(
    {
      clientId: Number(newAppt.clientId),
      petIds: selectedAppointmentPetIds,
      serviceType: newAppt.serviceType as "classic_groom" | "styled_groom" | "bath_only" | "fft" | "nail_trim" | "daycare" | "deshed" | "other",
    },
    { enabled: !!newAppt.clientId && selectedAppointmentPetIds.length > 0 },
  );
  const clientMembershipSummary = trpc.calendar.getClientMembershipSummary.useQuery(
    { clientId: Number(newAppt.clientId) },
    { enabled: !!newAppt.clientId },
  );
  useEffect(() => {
    if (membershipCoverage.data?.fullyCovered) {
      setNewAppt((current) => current.price === "0.00" ? current : { ...current, price: "0.00" });
    }
  }, [membershipCoverage.data?.fullyCovered]);
  // Suggest an end time from the selected dogs' recorded weight (full
  // grooms and FFT only) \u2014 60/90/120/180 min by size band. Purely a
  // starting point: staff can freely edit the end time afterward, e.g. for
  // a known-easy job on a large dog, or to overlap a booking on purpose.
  useEffect(() => {
    if (!newAppt.scheduledStart || selectedAppointmentPetIds.length === 0) return;
    const weights = selectedAppointmentPetIds.map(id => selectedClientPets.data?.find(p => p.id === id)?.weightKg ?? null);
    const suggestedMinutes = getAutoDurationMinutesForPets(newAppt.serviceType, weights);
    if (suggestedMinutes === null) return;
    const start = new Date(newAppt.scheduledStart);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + suggestedMinutes * 60000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
    setNewAppt(current => current.scheduledEnd === endStr ? current : { ...current, scheduledEnd: endStr });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newAppt.scheduledStart, newAppt.serviceType, selectedAppointmentPetIds.join(","), selectedClientPets.data]);

  /**
   * The selected groomer's day, so the time dropdown can say what is
   * already there.
   *
   * Only asked for once a groomer AND a date are chosen — before that
   * there is no day to describe. The booking being edited is excluded so
   * an appointment never clashes with itself.
   */
  const bookingDateKey = splitLocalDateTime(newAppt.scheduledStart).date;

  /**
   * Every groomer this booking needs: the dialog's default, plus any dog
   * sent to someone else. A two-dog family routinely spans two people
   * because each dog defaults to its own usual groomer.
   */
  const bookingStaffIds = useMemo(() => {
    const ids = new Set<number>();
    if (newAppt.staffId) ids.add(Number(newAppt.staffId));
    for (const value of Object.values(newAppt.staffByPetId)) {
      if (value) ids.add(Number(value));
    }
    return Array.from(ids).filter((id) => Number.isInteger(id) && id > 0);
  }, [newAppt.staffId, newAppt.staffByPetId]);

  const groomerDay = trpc.calendar.groomerDay.useQuery(
    { staffIds: bookingStaffIds, date: bookingDateKey },
    { enabled: bookingStaffIds.length > 0 && !!bookingDateKey },
  );

  /**
   * Everyone's commitments in one list. With two groomers the label says
   * whose, because "already has Buddy booked" is useless when it is the
   * other groomer who is busy.
   */
  const groomerBusy = useMemo(() => {
    const groups = groomerDay.data?.busyByStaff ?? [];
    if (groups.length <= 1) return groups[0]?.busy ?? [];
    return groups.flatMap(group =>
      group.busy.map(item => ({
        ...item,
        label: group.staffName ? `${group.staffName}: ${item.label}` : item.label,
      })),
    );
  }, [groomerDay.data]);

  /**
   * How long this booking runs, in minutes, from the two form fields.
   *
   * String arithmetic on the "YYYY-MM-DDTHH:mm" the form already holds —
   * a Date built here reads in the browser's zone, which is the `e6a4662`
   * trap. An end before the start means it runs past midnight.
   */
  const bookingDurationMinutes = useMemo(() => {
    const from = splitLocalDateTime(newAppt.scheduledStart);
    const to = splitLocalDateTime(newAppt.scheduledEnd);
    const startMinutes = timeValueToMinutes(from.time);
    const endMinutes = timeValueToMinutes(to.time);
    if (startMinutes === null || endMinutes === null) return 0;
    const sameDay = !from.date || !to.date || from.date === to.date;
    const span = sameDay ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
    return span > 0 ? span : 0;
  }, [newAppt.scheduledStart, newAppt.scheduledEnd]);

  /** Every offered slot, marked with what a booking there would run into. */
  const timeSlotsWithAvailability = useMemo(
    () => annotateSlots(
      buildTimeSlots({ include: splitLocalDateTime(newAppt.scheduledStart).time }),
      groomerBusy,
      bookingDurationMinutes,
      timeValueToMinutes,
    ),
    [newAppt.scheduledStart, groomerBusy, bookingDurationMinutes],
  );

  /** What the time currently chosen runs into. Empty means it is free. */
  const bookingClashes = useMemo(() => {
    const startMinutes = timeValueToMinutes(splitLocalDateTime(newAppt.scheduledStart).time);
    if (startMinutes === null || bookingDurationMinutes <= 0) return [];
    return clashesFor(startMinutes, startMinutes + bookingDurationMinutes, groomerBusy);
  }, [newAppt.scheduledStart, bookingDurationMinutes, groomerBusy]);

  const bookingGroomerName = useMemo(() => {
    const groups = groomerDay.data?.busyByStaff ?? [];
    // With the dogs split between two people the warning must not name
    // one of them, because the clash may belong to the other.
    if (groups.length > 1) return "This booking's groomers";
    return activeStaff.find(member => String(member.id) === newAppt.staffId)?.name ?? "";
  }, [activeStaff, newAppt.staffId, groomerDay.data]);

  /** Set when Create is pressed on a clashing slot; cleared by the dialog. */
  const [clashConfirm, setClashConfirm] = useState<null | { message: string }>(null);
  // A client with exactly one dog has already told us which dog. The chip
  // is a toggle and an untapped one looks like a label, so a groomer
  // reasonably read "Quinnie (Cavoodle)" as chosen, hit Create, and got
  // told to select a pet she thought she had.
  //
  // Only when nothing is chosen yet — never overriding a deliberate
  // deselection, and never guessing between two dogs.
  useEffect(() => {
    const pets = selectedClientPets.data;
    if (!newAppt.clientId || !pets) return;
    setNewAppt(current => {
      if (current.petIds.length > 0) return current;
      const auto = autoSelectedPetIds(pets.map(pet => pet.id));
      return auto.length === 0 ? current : { ...current, petIds: auto };
    });
  }, [newAppt.clientId, selectedClientPets.data]);

  // The dog's file says who usually grooms it, so the booking opens with
  // that already chosen — the red "Char" on the whiteboard, applied. It
  // only ever fills a gap: a groomer picked by hand wins, a split already
  // started wins, a preference naming somebody who has left is ignored,
  // and one dog's preference is never spread onto a dog that has none.
  // See shared/preferredGroomerDefaults.
  useEffect(() => {
    const clientPets = selectedClientPets.data;
    if (!clientPets) return;
    setNewAppt(current => {
      const next = preferredGroomerDefaults({
        petIds: current.petIds,
        draft: { staffId: current.staffId, staffByPetId: current.staffByPetId },
        pets: clientPets,
        rosterIds: activeStaffIds,
      });
      // null means nothing to fill; returning `current` lets React bail out
      // rather than re-rendering on every pass.
      return next ? { ...current, ...next } : current;
    });
  }, [selectedClientPets.data, activeStaffIds, newAppt.petIds]);

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
      setNewAppt({ clientId: "", petIds: [], staffId: "", staffByPetId: {}, serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "", priceByPetId: {}, addOnsByPetId: {}, collectByTime: "" });
      setClientSearch("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const createRecurringMutation = trpc.calendar.createRecurringAppointments.useMutation({
    onSuccess: (r) => {
      const skippedMsg = r.skipped.length > 0 ? ` (${r.skipped.length} skipped due to a groomer clash)` : "";
      toast.success(`${r.createdCount} recurring appointment${r.createdCount !== 1 ? "s" : ""} created${skippedMsg}`);
      setShowNewAppt(false);
      setNewAppt({ clientId: "", petIds: [], staffId: "", staffByPetId: {}, serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "", priceByPetId: {}, addOnsByPetId: {}, collectByTime: "" });
      setRepeatForm({ enabled: false, frequencyWeeks: "6", untilDate: "" });
      setClientSearch("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * `force` skips the double-booking confirmation, and is only ever true
   * when it came from the confirmation itself.
   */
  const handleCreate = (force = false) => {
    const missing = newAppointmentError(newAppt);
    if (missing) { toast.error(missing); return; }

    // Booking over another dog is allowed and sometimes right. It just
    // must not happen by accident, which is what it did while the time
    // dropdown offered every half hour regardless of who was selected.
    if (!force) {
      const clashMessage = clashWarning(bookingClashes, bookingGroomerName);
      if (clashMessage) { setClashConfirm({ message: clashMessage }); return; }
    }

    // Warn, never block. The salon squeezes dogs in for good reasons, and a
    // system that refused would simply be worked around — but nobody should
    // go over a groomer's day without noticing they have.
    const bookingGroomer = activeStaff.find(member => String(member.id) === newAppt.staffId);
    const capacity = (bookingGroomer as { dailyClipCapacity?: number | null } | undefined)?.dailyClipCapacity ?? null;
    if (bookingGroomer && capacity && isClip(newAppt.serviceType) && newAppt.scheduledStart) {
      const dayKey = newAppt.scheduledStart.slice(0, 10);
      const alreadyBooked = filteredAppts.filter(a =>
        a.staffId === bookingGroomer.id
        && isClip(a.serviceType)
        && aestDateKey(new Date(a.scheduledStart)) === dayKey).length;
      const warning = overbookingWarning(
        groomerDayLoad(alreadyBooked, capacity),
        bookingGroomer.name,
        newAppt.petIds.length || 1,
      );
      if (warning) toast.warning(warning, { duration: 6000 });
    }
    if (repeatForm.enabled) {
      if (!repeatForm.untilDate) {
        toast.error("Please choose a date to repeat until"); return;
      }
      createRecurringMutation.mutate({
        clientId: parseInt(newAppt.clientId),
        petIds: newAppt.petIds.map(id => parseInt(id)),
        staffId: newAppt.staffId ? parseInt(newAppt.staffId) : undefined,
        staffByPetId: perPetGroomers,
        serviceType: newAppt.serviceType as "classic_groom",
        scheduledStart: newAppt.scheduledStart,
        scheduledEnd: newAppt.scheduledEnd,
        frequencyWeeks: parseInt(repeatForm.frequencyWeeks),
        untilDate: repeatForm.untilDate,
        notes: newAppt.notes || undefined,
        price: membershipCoverage.data?.fullyCovered ? "0.00" : newAppt.price || undefined,
      });
      return;
    }
    multiPetCreateMutation.mutate({
      clientId: parseInt(newAppt.clientId),
      petIds:   newAppt.petIds.map(id => parseInt(id)),
      staffId:  newAppt.staffId ? parseInt(newAppt.staffId) : undefined,
      staffByPetId: perPetGroomers,
      serviceType: newAppt.serviceType as "classic_groom",
      scheduledStart: newAppt.scheduledStart,
      scheduledEnd:   newAppt.scheduledEnd,
      notes: newAppt.notes || undefined,
      price: membershipCoverage.data?.fullyCovered ? "0.00" : newAppt.price || undefined,
      priceByPetId: membershipCoverage.data?.fullyCovered ? undefined : newAppt.priceByPetId,
      collectByTime: newAppt.collectByTime || null,
      // The staged add-ons carry a name and a display price so the dialog
      // can show the line before the appointment exists. The server takes
      // the price from the catalogue, so only the ids travel.
      addOnsByPetId: Object.fromEntries(
        Object.entries(newAppt.addOnsByPetId)
          .filter(([, addOns]) => addOns.length > 0)
          .map(([petId, addOns]) => [petId, addOns.map(addOn => ({
            pricingServiceId: addOn.pricingServiceId,
            quantity: addOn.quantity,
            ...(addOn.unitPrice !== undefined ? { unitPrice: addOn.unitPrice } : {}),
          }))]),
      ),
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
      contactId:      appt.contactId ?? null,
    });
    setCollectByDraft(formatCollectBy(appt.collectBy) ?? "");
  };

  /**
   * Everything the appointment dialog holds that belongs to ONE appointment.
   *
   * It all lives in this page component, which never unmounts, so nothing
   * clears it on its own. The Grooming Report panels get away without a list
   * like this because their state sits inside DialogContent, which Radix
   * destroys on close — that difference is the whole reason a style draft
   * once followed Teddy into Maisie's box.
   *
   * The style draft is not here on purpose: it is owned by the effect keyed
   * on styleTargetPetId, which fires when editAppt goes null. Anything else
   * per-appointment added to this component belongs in this list.
   */
  const closeEditDialog = () => {
    setEditAppt(null);
    setSelectedStylePetId(null);
    setSiblingGroomers({});
    setSiblingPrices({});
    setSiblingServices({});
    setAdditionalFamilyPetIds([]);
    // Drives "Copy to all", which overwrites every field of a grooming report,
    // before and after photos included. Left set, it would apply itself to the
    // next dog opened.
    setCopySnap(null);
    // Half-typed contact details belong to the client whose dialog was
    // open, exactly like the style draft. Left behind they would appear
    // under the next client's name — the bug Lauren reported on 13/10.
    setAddingContact(false);
    setNewContact({ name: "", phone: "", relationship: "" });
  };

  const handleSaveEdit = async () => {
    if (!editAppt) return;
    const promises: Promise<unknown>[] = [];
    const keepOriginalCancelledSchedule = preservesOriginalSchedule(editAppt, editForm.workflowState);
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
    // For multi-pet sessions, per-dog price and service come from the sibling
    // maps; a single-pet booking uses editForm.
    const effectivePrimaryPrice = (siblings.length > 0 && siblingPrices[editAppt.id] !== undefined)
      ? siblingPrices[editAppt.id]
      : editForm.price;
    const effectivePrimaryService = siblings.length > 0
      ? (siblingServices[editAppt.id] ?? editAppt.serviceType)
      : editForm.serviceType;
    // Send only what changed. The server clears the discount whenever a price
    // arrives, so re-sending an unchanged price silently wipes a discount
    // somebody applied on purpose — editing only the notes used to be enough.
    const primaryChanges = appointmentDetailChanges(editAppt, {
      serviceType: effectivePrimaryService,
      notes: editForm.notes,
      price: effectivePrimaryPrice,
      contactId: editForm.contactId,
    });
    if (hasAppointmentDetailChanges(primaryChanges)) {
      promises.push(updateDetailsMutation.mutateAsync({
        appointmentId: editAppt.id,
        ...primaryChanges,
        serviceType: primaryChanges.serviceType as "classic_groom" | undefined,
      }));
    }
    // One person collects the whole family, so the siblings follow the
    // primary dog's contact — but ONLY when the contact was actually
    // changed in this save. Gated on that rather than on "something
    // changed": inside the block above, editing just a note on one dog
    // silently rewrote every sibling's contact to match this one's.
    if ("contactId" in primaryChanges) {
      for (const sib of getSiblings(editAppt)) {
        if ((sib.contactId ?? null) !== (editForm.contactId ?? null)) {
          promises.push(updateDetailsMutation.mutateAsync({
            appointmentId: sib.id,
            contactId: editForm.contactId,
          }));
        }
      }
    }
    // Per-dog price and service overrides for the other dogs in the family.
    for (const sib of siblings) {
      const sibChanges = appointmentDetailChanges(sib, {
        serviceType: siblingServices[sib.id],
        price: siblingPrices[sib.id],
      });
      if (hasAppointmentDetailChanges(sibChanges)) {
        promises.push(updateDetailsMutation.mutateAsync({
          appointmentId: sib.id,
          ...sibChanges,
          serviceType: sibChanges.serviceType as "classic_groom" | undefined,
        }));
      }
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
      closeEditDialog();
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
                  {day.toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short" })}
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
                    const isCancelled = isCancelledAppointment(appt);
                    const sharedAppointmentLabel = formatSharedAppointmentName({
                      petNames: [appt, ...getSiblings(appt as Appt)].map((pet) => pet.petName),
                      surname: appt.clientLastName,
                    });
                    return (
                      <div
                        key={appt.id}
                        className={`brand-lift rounded-md border border-white/80 px-2 py-1.5 cursor-pointer text-[11px] leading-tight ${isCancelled ? "bg-red-50 dark:bg-red-950/40" : ""}`}
                        style={{ opacity: isCancelled ? 0.45 : 1, background: isCancelled ? "linear-gradient(135deg, #f8fafc 0%, #ffffff 180%)" : `linear-gradient(135deg, ${svc.bg} 0%, #ffffff 180%)`, borderLeft: `4px solid ${isCancelled ? "#dc2626" : svc.border}`, boxShadow: isCancelled ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px #dc2626" : `inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 14px -12px ${svc.border}` }}
                        onClick={(e) => { e.stopPropagation(); openEdit(appt as Appt); }}
                      >
                        {isCancelled && <div className="mb-1 inline-flex rounded-sm border border-border bg-card/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cancelled</div>}
                        <div className={`font-bold truncate ${isCancelled ? "line-through decoration-1 decoration-slate-400" : ""}`} style={{ color: isCancelled ? "#991b1b" : svc.border }}>
                          {hasArrivedOnSite(appt.workflowState, appt.status) && <ArrivedTick workflowState={appt.workflowState} />}
                          {sharedAppointmentLabel}
                          {appt.reminderStatus === "delivered" && <CheckCircle2 aria-label="Reminder delivered" className="inline ml-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                        </div>
                        <div className="truncate mt-0.5 font-medium" style={{ color: isCancelled ? "#991b1b" : svc.text }}>
                          {fmtTime(new Date(appt.scheduledStart))}
                          {appt.staffName ? ` · ${appt.staffName.split(" ")[0]}` : ""}
                        </div>
                        <span className="mt-1 inline-flex rounded-full bg-card/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: isCancelled ? "#991b1b" : svc.text }}>{SERVICE_LABELS[appt.serviceType] ?? appt.serviceType}</span>
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
    // A dog with nobody against it matches no staff column, so the day grid
    // never drew it at all — it existed on the board only as a chip in the
    // strip underneath. It gets a column of its own on the days that need
    // one, so the dog sits at its booked time like every other dog. Dropping
    // onto that column unassigns, which handleDropOnColumn already does with
    // a null staff id.
    const hasUnassignedToday = filteredAppts.some(
      (a) => !a.staffId && aestDateKey(new Date(a.scheduledStart)) === dayDateKey(dayDate),
    );
    const allCols = withUnassignedColumn(activeStaff, hasUnassignedToday && showUnassignedColumn);
    // The Unassigned column is not a staff member, so the staff filter has no
    // opinion on it and it always survives.
    const cols = allCols.filter(
      (staffMember) => staffMember.id === null || visibleStaffIds.includes(staffMember.id),
    );
    const {
      groomers: groomerCount,
      bathers: batherCount,
      unassigned: unassignedCount,
    } = calendarColumnGroups(cols);

    return (
      <div className="min-h-[500px] flex-1 bg-card rounded-2xl border border-white/90 shadow-xl shadow-[color-mix(in_oklch,var(--brand-primary)_10%,transparent)] flex flex-col overflow-hidden lg:min-h-0">
        <div ref={boardRef} className="overflow-x-auto overscroll-x-contain flex-1 flex flex-col" aria-label="Scrollable staff calendar columns">
          {/* Columns fit the measured board width, down to a readable floor;
              only below that floor does the board scroll sideways. */}
          {(() => {
            const { totalWidth, gridTemplateColumns: colTemplate } = getDayCalendarGridSizing(
              cols.length,
              TIME_COL_W,
              { availableWidth: boardWidth },
            );
            // A flex COLUMN that may shrink vertically. This used to be a plain
            // block with shrink-0, which broke the day view's vertical scroll two
            // ways: a block gives no flex context, so flex-1 on the grid body
            // below did nothing and it sized to its content (936px) rather than
            // the 622px available; and shrink-0 stopped this wrapper shrinking
            // inside its column parent. The horizontal scroller above then
            // absorbed the overflow, so the whole grid moved together and the
            // headers scrolled away. The explicit width still drives horizontal
            // scrolling.
            return (
              <div className="flex min-h-0 flex-1 flex-col" style={{ width: totalWidth, minWidth: totalWidth }}>
                {(groomerCount > 0 || batherCount > 0 || unassignedCount > 0) && (
                  <div className="grid border-b bg-muted/80 shrink-0" style={{ gridTemplateColumns: colTemplate }}>
                    <div className="border-r" />
                    {groomerCount > 0 && <div className="px-3 py-2 border-r text-[10px] font-bold uppercase tracking-[0.16em] text-violet-800 dark:text-violet-300 bg-gradient-to-r from-violet-100/90 dark:from-violet-950/90 to-violet-50/50 dark:to-violet-950/50" style={{ gridColumn: `span ${groomerCount}` }}>Groomers</div>}
                    {batherCount > 0 && <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-800 dark:text-blue-300 bg-gradient-to-r from-blue-100/90 dark:from-blue-950/90 to-blue-50/50 dark:to-blue-950/50 ${unassignedCount > 0 ? "border-r" : ""}`} style={{ gridColumn: `span ${batherCount}` }}>Bathing Team</div>}
                    {unassignedCount > 0 && <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300 bg-gradient-to-r from-slate-200/90 dark:from-slate-800/90 to-slate-100/50 dark:to-slate-800/50" style={{ gridColumn: `span ${unassignedCount}` }}>Nobody assigned</div>}
                  </div>
                )}
                {/* Sticky header */}
                <div
                  className="grid border-b sticky top-0 bg-card/95 backdrop-blur z-20 shrink-0"
                  style={{ gridTemplateColumns: colTemplate }}
                >
                  <div className="border-r p-2 text-[11px] text-muted-foreground text-center leading-tight">
                    {dayDate.toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short" })}
                  </div>
                  {cols.map((s, i) => (
                    <div key={i} className="p-2.5 border-r last:border-r-0 text-center transition-colors hover:bg-muted/80" style={{ borderTop: `3px solid ${s.colourHex ?? "#6366f1"}` }}>
                      <div className="flex items-center justify-center gap-1.5">
                        <StaffAvatar photoUrl={(s as { photoUrl?: string | null }).photoUrl} name={s.name} colourHex={s.colourHex} className="h-7 w-7" />
                        <span className="text-xs font-semibold truncate">{s.name.split(" ")[0]}</span>
                      </div>
                      {(() => {
                        const mine = filteredAppts.filter(a =>
                          a.staffId === s.id && aestDateKey(new Date(a.scheduledStart)) === dayDateKey(dayDate));
                        // Clips against what this groomer said they can do.
                        // Shown here because this is the column somebody is
                        // looking at when they decide where to put a dog —
                        // four future days were already over before anyone
                        // had a way to see it.
                        const load = groomerDayLoad(
                          mine.filter(a => isClip(a.serviceType)).length,
                          (s as { dailyClipCapacity?: number | null }).dailyClipCapacity ?? null,
                        );
                        const tone =
                          load.state === "over" ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                          : load.state === "full" ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-muted text-muted-foreground";
                        const title =
                          load.state === "unknown" ? `${mine.length} appointments. No clip capacity set for ${s.name}.`
                          : load.state === "over" ? `${load.label} clips — ${Math.abs(load.remaining ?? 0)} over a ${load.capacity}-dog day`
                          : load.state === "full" ? `${load.label} clips — full`
                          : `${load.label} clips — room for ${load.remaining} more`;
                        return (
                          <div className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone}`} title={title}>
                            {load.state === "unknown"
                              ? `${mine.length} appts`
                              : `${load.label} clips`}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>

                {/* Scrollable grid body. min-h-0 is what lets a flex child
                    shrink below its content and actually scroll. */}
                <div className="overflow-y-auto min-h-0 flex-1" ref={scrollRef}>
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
                  className="relative border-r last:border-r-0 transition-colors hover:bg-muted/35"
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
                          {/* The bar is the blockout you can click; the hatching
                              behind it stays transparent to clicks so appointments
                              on the day are still reachable and a dog can still be
                              dragged onto it. */}
                          <div className="pointer-events-auto absolute top-2 left-1 right-1 flex items-center justify-between gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 dark:border-red-900/50 dark:bg-red-950/40">
                            <button
                              className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-semibold text-red-600 hover:underline dark:text-red-400"
                              title="Edit this blocked-out time"
                              onClick={(e) => { e.stopPropagation(); openBlockout(b); }}
                            >
                              <Ban className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{b.reason || "Day Off"}</span>
                            </button>
                            <button
                              className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-400"
                              title="Remove"
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "blockout", id: b.id, label: b.reason || "Day Off" }); }}
                            >
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
                        <div className="pointer-events-auto absolute top-1 left-1 right-1 flex items-center justify-between gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 dark:border-red-900/50 dark:bg-red-950/40">
                          <button
                            className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-semibold text-red-600 hover:underline dark:text-red-400"
                            title="Edit this blocked-out time"
                            onClick={(e) => { e.stopPropagation(); openBlockout(b); }}
                          >
                            <Ban className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{b.startTime}–{b.endTime} {b.reason || "Blocked"}</span>
                          </button>
                          <button
                            className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-400"
                            title="Remove"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "blockout", id: b.id, label: `${b.startTime}–${b.endTime} ${b.reason || "Blocked"}` }); }}
                          >
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
  // In day view, filteredAppts spans ±1 day for the query buffer.
  // Narrow to just the viewed day for the count badge and unassigned strip.
  const dayViewAppts = useMemo(() => {
    if (viewMode !== "day") return filteredAppts;
    const key = dayDateKey(dayDate);
    return filteredAppts.filter(a => aestDateKey(new Date(a.scheduledStart)) === key);
  }, [viewMode, filteredAppts, dayDate]);

  const totalThisView = viewMode === "day" ? dayViewAppts.length : filteredAppts.length;
  // Figures for the sidebar, over whichever period is on screen. The maths
  // lives in shared/ because the distinctions - appointments vs dogs, earned
  // vs expected, and excluding cancellations from both - are easy to fudge
  // into a number that looks right and is not.
  const sidebarSummary = useMemo(
    () => summariseCalendar(viewMode === "day" ? dayViewAppts : filteredAppts),
    [viewMode, dayViewAppts, filteredAppts],
  );
  const weekLabel = viewMode === "week"
    ? `${weekDays[0].toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", year: "numeric" })}`
    : fmtDateShort(dayDate);

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-col gap-4 lg:h-[calc(100dvh-6.5rem)]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/90 bg-card/70 px-3 py-3 shadow-lg shadow-[color-mix(in_oklch,var(--brand-primary)_8%,transparent)] backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="brand-lift bg-card/80" onClick={() => viewMode === "week" ? navigateWeek(-1) : navigateDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="brand-lift bg-card/80 font-semibold" onClick={goToToday}>Today</Button>
            <Button variant="outline" size="icon" className="brand-lift bg-card/80" onClick={() => viewMode === "week" ? navigateWeek(1) : navigateDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                {/* Only below lg. At lg and up the sidebar carries a permanent
                    month, and a second one floating on top of it overlaps the
                    rail and reads as two calendars disagreeing. */}
                <button className="brand-lift ml-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-base font-bold transition-colors hover:bg-primary/10 hover:text-primary lg:hidden">
                  <span className="rounded-md bg-primary/10 p-1 text-primary"><CalendarIcon className="h-4 w-4" /></span>
                  {weekLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" collisionPadding={8}>
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
            <span className="ml-1 hidden items-center gap-2 px-2 py-1.5 text-base font-bold lg:flex">
              <span className="rounded-md bg-primary/10 p-1 text-primary"><CalendarIcon className="h-4 w-4" /></span>
              {weekLabel}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{totalThisView} appointments</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover open={apptSearchOpen} onOpenChange={(open) => { setApptSearchOpen(open); if (!open) setApptSearchTerm(""); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="brand-lift h-9 gap-1.5 bg-card/80 text-xs shadow-sm" title="Find any appointment by dog or client name">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  Find appointment
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full max-w-[calc(100vw-2rem)] p-0" align="start" style={{ width: "360px" }}>
                <div className="p-2 border-b">
                  <div className="relative">
                    <Input
                      autoFocus
                      placeholder="Dog name or client name…"
                      value={apptSearchTerm}
                      onChange={e => setApptSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        // Only when every match is the same client — see
                        // soleClientOf. With several clients the list stays
                        // up to be picked from rather than guessing one.
                        const sole = soleClientOf(apptSearchResults ?? []);
                        if (!sole) return;
                        setApptSearchOpen(false);
                        // Previous appointments expanded: Enter is the
                        // "show me everything for this client" gesture.
                        setShowPastAppts(true);
                        setApptListClient(sole);
                      }}
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
                  ) : (<>
                    <p className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                      {soleClientOf(apptSearchResults)
                        ? <>Press <kbd className="rounded border bg-card px-1 font-sans">Enter</kbd> for everything {soleClientOf(apptSearchResults)!.name} has booked</>
                        : `${distinctClientCount(apptSearchResults)} clients match — pick one to see their appointments`}
                    </p>
                    {apptSearchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                        onClick={() => {
                          setApptSearchOpen(false);
                          setShowPastAppts(false);
                          setApptListClient({
                            clientId: r.clientId,
                            name: [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ") || "This client",
                          });
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold block truncate">{r.petName ?? "Unnamed pet"}</span>
                          <span className="text-xs text-muted-foreground block truncate">{[r.clientFirstName, r.clientLastName].filter(Boolean).join(" ") || "Unknown client"} · {SERVICE_LABELS[r.serviceType] ?? r.serviceType}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 text-right whitespace-nowrap">
                          {new Date(r.scheduledStart).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: getActiveTimeZone() })}
                          <br />
                          {new Date(r.scheduledStart).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: getActiveTimeZone() })}
                        </span>
                      </button>
                    ))}
                  </>)}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="brand-lift h-9 min-w-40 justify-start gap-1.5 bg-card/80 text-xs shadow-sm" title="Choose the staff columns shown on this calendar">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {describeCalendarStaffSelection(staffSelection, activeStaff)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Visible staff columns</p>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setStaffSelection({ kind: "all" })}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${coversAllStaff(staffSelection, activeStaff) ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{coversAllStaff(staffSelection, activeStaff) && <Check className="h-3 w-3" />}</span>
                  All staff
                </button>
                {/* Only worth offering when there is a bathing team to leave
                    out; without one it is the same board as "All staff". */}
                {calendarBathers.length > 0 && (
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setStaffSelection(DEFAULT_CALENDAR_STAFF_SELECTION)}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${staffSelection.kind === "groomers" ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{staffSelection.kind === "groomers" && <Check className="h-3 w-3" />}</span>
                    Groomers only
                  </button>
                )}
                {calendarGroomers.length > 0 && <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Groomers</p>}
                {calendarGroomers.map((member) => {
                  const checked = visibleStaffIds.includes(member.id);
                  return <button key={member.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setStaffSelection(toggleCalendarStaff(staffSelection, activeStaff, member.id))}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check className="h-3 w-3" />}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: member.colourHex ?? "#6366f1" }} />{member.name.split(" ")[0]}
                  </button>;
                })}
                {calendarBathers.length > 0 && <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Bathing team</p>}
                {calendarBathers.map((member) => {
                  const checked = visibleStaffIds.includes(member.id);
                  return <button key={member.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setStaffSelection(toggleCalendarStaff(staffSelection, activeStaff, member.id))}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check className="h-3 w-3" />}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: member.colourHex ?? "#6366f1" }} />{member.name.split(" ")[0]}
                  </button>;
                })}
                {/* Not a staff member, so it sits apart from the two teams.
                    The column still only appears on days that actually have
                    a dog with nobody against them — this hides it on the
                    days it would otherwise show. */}
                <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Other</p>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => setShowUnassignedColumn((shown) => !shown)}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${showUnassignedColumn ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{showUnassignedColumn && <Check className="h-3 w-3" />}</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: "#94a3b8" }} />Unassigned
                </button>
              </PopoverContent>
            </Popover>
            {/* View toggle */}
            <div className="flex rounded-xl border border-primary/15 bg-card/80 p-1 shadow-sm">
              <button
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${viewMode === "week" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/10 hover:text-primary"}`}
                onClick={() => setViewMode("week")}
              >Week</button>
              <button
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${viewMode === "day" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/10 hover:text-primary"}`}
                onClick={() => setViewMode("day")}
              >Day</button>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setBlockoutEditing(null);
                setBlockoutDefaultDate(dayDateKey(viewMode === "day" ? dayDate : weekStart));
                setShowBlockoutDialog(true);
              }}
              size="sm" className="brand-lift gap-1.5 bg-card/80 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300">
              <Ban className="h-4 w-4" /> Block Out
            </Button>
            {/* Beside Block Out and New Appointment because it belongs to
                the same moment: a booking is cancelled here, and the
                waitlist is who else wanted that time. A dialog rather
                than a panel — this page is a fixed-height flex column
                and anything inserted into it fights the calendar. */}
            <Button variant="outline" size="sm" className="brand-lift gap-1.5 bg-card/80"
              onClick={() => setShowWaitlist(true)}>
              <Clock3 className="h-4 w-4" /> Waitlist
              {waitlistClaimCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {waitlistClaimCount}
                </span>
              )}
            </Button>
            <Button onClick={() => setShowNewAppt(true)} size="sm" className="brand-lift gap-1.5 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" /> New Appointment
            </Button>
          </div>
        </div>

        {/* Calendar, with the persistent left rail beside it.
            The month only existed inside a popover, so picking a date meant
            open-choose-close, and there was no way to see next week's shape
            while looking at today. The rail is lg-and-up; on a phone the
            toolbar's date picker stays the way in. */}
        <div className={viewMode === "day" ? "flex min-h-0 flex-1 gap-4" : "flex min-h-0 gap-4"}>
          <CalendarSidebar
            selected={viewMode === "day" ? dayDate : weekStart}
            onSelectDate={(d) => {
              // Move BOTH. Setting only the one the current view reads left
              // the other stale, so a quick jump moved the grid and then
              // switching day/week put you back where you started.
              // jumpToAppointment already does this; the rail did not.
              setDayDate(d);
              setWeekStart(getWeekStart(d));
            }}
            summary={sidebarSummary}
            summaryLabel={viewMode === "day" ? fmtDateShort(dayDate) : `Week of ${weekLabel}`}
          />
          <div className={viewMode === "day" ? "flex min-h-0 flex-1 flex-col" : "min-h-0 flex-1"}>
            {viewMode === "week" ? renderWeekView() : renderDayView()}
          </div>
        </div>

        {/* Unassigned row */}
        {(() => {
          const unassigned = (viewMode === "day" ? dayViewAppts : filteredAppts).filter(a => !a.staffId);
          if (!unassigned.length) return null;
          return (
          <div className="bg-card rounded-xl border p-4">
            <h3 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Unassigned ({unassigned.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {unassigned.map(appt => {
                const sharedAppointmentLabel = formatSharedAppointmentName({
                  petNames: [appt, ...getSiblings(appt as Appt)].map((pet) => pet.petName),
                  surname: appt.clientLastName,
                });
                // A cancelled dog used to look exactly like a live one here,
                // so the slot read as still needing somebody. It is marked the
                // same way the cards are — faded, dashed spine, the same
                // neutral badge — because cancelled bookings are meant to
                // recede, not shout. In week view the chip also carried a time
                // and no day, so a week of these could not be read at all.
                const cancelled = isCancelledAppointment(appt);
                return (
                  <div
                    key={appt.id}
                    className={`rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${cancelled
                      ? "bg-muted/50 opacity-60 hover:opacity-100 hover:bg-muted/70"
                      : "bg-muted hover:bg-muted/80"}`}
                    style={cancelled ? { borderLeft: "4px dashed #cbd5e1" } : undefined}
                    onClick={() => openEdit(appt as Appt)}
                  >
                    {cancelled && <span className="mr-1.5 inline-flex rounded-sm border border-border bg-card/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cancelled</span>}
                    <span className={`font-medium ${cancelled ? "line-through text-muted-foreground" : ""}`}>{sharedAppointmentLabel}</span>
                    <span className="text-muted-foreground ml-1">
                      · {appt.clientFirstName} {appt.clientLastName}
                      · {viewMode === "week" ? `${fmtDateShort(new Date(appt.scheduledStart))}, ` : ""}{fmtTime(new Date(appt.scheduledStart))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}
      </div>

      {/* ── New Appointment Dialog ── */}
      {/* A client's appointments, opened from the calendar search. Upcoming
          first because that is the question being asked ("when are they next
          in?"); history collapses because it rarely is. */}
      <Dialog open={!!apptListClient} onOpenChange={(v) => { if (!v) { setApptListClient(null); setShowPastAppts(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {apptListClient?.name}
            </DialogTitle>
          </DialogHeader>

          {isClientApptsFetching ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading appointments…</p>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Upcoming ({clientApptSplit.upcoming.length})
                </h4>
                {clientApptSplit.upcoming.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    Nothing booked. Use New Appointment to book them in.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {clientApptSplit.upcoming.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                          onClick={() => { setApptListClient(null); jumpToAppointment(a.scheduledStart); }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.petName ?? "Unnamed pet"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {SERVICE_LABELS[a.serviceType] ?? a.serviceType}
                              {a.staffName ? ` · ${a.staffName}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                            {formatAestDate(a.scheduledStart)}
                            <br />
                            {new Date(a.scheduledStart).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: getActiveTimeZone() })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {clientApptSplit.past.length > 0 && (
                <section>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted"
                    onClick={() => setShowPastAppts((open) => !open)}
                    aria-expanded={showPastAppts}
                  >
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Previous appointments ({clientApptSplit.past.length})
                    </span>
                    {showPastAppts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {showPastAppts && (
                    <ul className="mt-1 space-y-1">
                      {clientApptSplit.past.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                            onClick={() => { setApptListClient(null); jumpToAppointment(a.scheduledStart); }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{a.petName ?? "Unnamed pet"}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {SERVICE_LABELS[a.serviceType] ?? a.serviceType}
                                {["cancelled", "no_show"].includes((a.status ?? "").toLowerCase()) ? ` · ${a.status}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                              {formatAestDate(a.scheduledStart)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setApptListClient(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWaitlist} onOpenChange={setShowWaitlist}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Waitlist</DialogTitle>
          </DialogHeader>
          <WaitlistPanel />
        </DialogContent>
      </Dialog>

      <Dialog open={showNewAppt} onOpenChange={(v) => { setShowNewAppt(v); if (!v) { setClientSearch(""); setAddingClient(false); setNewAppt({ clientId: "", petIds: [], staffId: "", staffByPetId: {}, serviceType: "classic_groom", scheduledStart: "", scheduledEnd: "", notes: "", price: "", priceByPetId: {}, addOnsByPetId: {}, collectByTime: "" }); setRepeatForm({ enabled: false, frequencyWeeks: "6", untilDate: "" }); } }}>
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
                  {/* portal={false}: this popover lives inside the New Appointment
                      Dialog, whose scroll lock cancels wheel events outside its own
                      subtree - a portalled list here cannot be scrolled with the mouse. */}
                  <PopoverContent portal={false} className="w-full max-w-[calc(100vw-2rem)] p-0" align="start" style={{ width: "var(--radix-popover-trigger-width, 360px)" }}>
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
                    {/* Andy, 13/10: "Need a 'New Client' button featured when
                        booking a new appointment." Above the results, as MoeGo
                        has it — the moment you discover somebody is new is
                        while you are looking at an empty result list. */}
                    {addingClient ? (
                      <NewClientQuickAdd
                        onCancel={() => setAddingClient(false)}
                        onCreated={({ clientId, petId }) => {
                          setAddingClient(false);
                          setClientSearch("");
                          setNewAppt(p => ({
                            ...p,
                            clientId: String(clientId),
                            petIds: [String(petId)],
                            priceByPetId: {},
                            addOnsByPetId: {},
                          }));
                        }}
                      />
                    ) : (
                    <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-muted"
                      onClick={() => setAddingClient(true)}
                    >
                      <Plus className="h-3.5 w-3.5" /> New client
                    </button>
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
                              setNewAppt(p => ({ ...p, clientId: String(c.clientId), petIds: [], staffByPetId: {} }));
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
                    </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Pets * <span className="text-xs text-muted-foreground font-normal">(select one or more)</span></Label>
                {newAppt.clientId && clientMembershipSummary.data && clientMembershipSummary.data.suspendedPetIds.length > 0 && (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-lg p-2">A membership needs attention before it can cover a booking.</p>
                )}
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
                      // Still listed, never bookable. Removing a dog that
                      // has died reads as a mistake to whoever is looking
                      // for it; striking it through says what happened.
                      const passedAway = petHasPassedAway(pet);
                      return (
                        <button
                          key={pet.id}
                          type="button"
                          aria-disabled={passedAway}
                          title={passedAway ? PET_CANNOT_BE_SELECTED : undefined}
                          onClick={() => passedAway
                            ? toast.error(PET_CANNOT_BE_SELECTED, {
                                description: `${pet.name} has been recorded as passed away.`,
                              })
                            : setNewAppt(prev => {
                            // Drop the dog's groomer when it is deselected:
                            // a stale entry would otherwise travel with the
                            // booking for a dog nobody is bringing.
                            const nextStaff = { ...prev.staffByPetId };
                            if (selected) delete nextStaff[String(pet.id)];
                            return {
                              ...prev,
                              staffByPetId: nextStaff,
                              petIds: selected
                                ? prev.petIds.filter(id => id !== String(pet.id))
                                : [...prev.petIds, String(pet.id)],
                            };
                          })}
                          className={[
                            "px-3 py-1.5 rounded-full text-sm border transition-all",
                            passedAway
                              // Not dashed: dashed means "tap me". This is
                              // solid, still, and the colour of the
                              // memorial badge on the client page.
                              ? "cursor-not-allowed border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300"
                              : selected
                                ? "bg-primary text-primary-foreground border-primary font-medium"
                                // Dashed and muted, so an unchosen dog looks
                                // like something waiting to be tapped rather
                                // than a label stating a fact.
                                : "border-dashed bg-background text-muted-foreground border-muted-foreground/40 hover:border-primary hover:text-primary",
                          ].join(" ")}
                        >
                          <span className={passedAway ? "line-through decoration-amber-700/60" : undefined}>
                            {pet.name}{pet.breed ? ` (${pet.breed})` : ""}
                          </span>
                          {passedAway
                            ? <AngelWings className="ml-1.5 inline-block h-3.5 w-3.5 align-[-2px]" />
                            : <span className="ml-1.5 opacity-70">{selected ? "✓" : "+"}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {familyBookingCompanions.length > 0 && <div className="mt-3 rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/70 dark:bg-violet-950/70 p-3"><p className="text-sm font-semibold text-violet-950">Include linked family dogs?</p><p className="mt-0.5 text-xs text-violet-800 dark:text-violet-300">These dogs are remembered as family-linked. Select any that should share this appointment.</p><div className="mt-2 flex flex-wrap gap-2">{familyBookingCompanions.map(pet => <Button key={pet.id} type="button" size="sm" variant="outline" className="border-violet-300 dark:border-violet-800 bg-card text-violet-900 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-950/50" onClick={() => setNewAppt(prev => ({ ...prev, petIds: [...prev.petIds, String(pet.id)] }))}>+ {pet.name}</Button>)}</div></div>}
                  {membershipCoverage.isFetching ? <p className="mt-3 text-xs text-muted-foreground">Checking membership coverage…</p> : membershipCoverage.data?.fullyCovered ? <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-emerald-950"><div><div className="flex flex-wrap items-center gap-2"><Badge className="bg-emerald-600 text-white">Weekly membership active</Badge>{membershipCoverage.data.memberships.map(membership => <span key={membership.id} className="text-xs font-medium">{membership.name} · {membership.tier}</span>)}</div><p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">Every selected dog is covered for this service. Appointment price is $0.00 because payment is managed through the weekly membership.</p></div></div> : membershipCoverage.data && membershipCoverage.data.coveredPetIds.length > 0 ? <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-950"><Badge variant="outline" className="border-amber-300 dark:border-amber-800 bg-card text-amber-800 dark:text-amber-300">Partial membership coverage</Badge><p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Only some selected dogs are covered for this service, so the appointment price remains available for review.</p></div> : null}
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{newAppt.petIds.length > 1 ? "Groomer (all dogs)" : "Groomer"}</Label>
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
            {/* One groomer per dog. Only once there is more than one dog —
                a single-dog booking has nothing to split, and the salon
                usually puts the whole family with one person anyway, so this
                stays out of the way until it is wanted. */}
            {newAppt.petIds.length > 1 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <button
                  type="button"
                  onClick={() => setSplitGroomers(v => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-medium">
                    Different groomer per dog
                    {splitGroomerCount > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        · {splitGroomerCount} set
                      </span>
                    )}
                  </span>
                  {splitGroomers ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {splitGroomers && (
                  <div className="mt-3 space-y-2">
                    {newAppt.petIds.map(petId => {
                      const pet = selectedClientPets.data?.find(candidate => String(candidate.id) === petId);
                      return (
                        <div key={petId} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-sm font-medium">{pet?.name ?? `Pet ${petId}`}</span>
                          <Select
                            value={newAppt.staffByPetId[petId] ?? ""}
                            onValueChange={v => setNewAppt(prev => ({
                              ...prev,
                              staffByPetId: v === "__same"
                                ? Object.fromEntries(Object.entries(prev.staffByPetId).filter(([key]) => key !== petId))
                                : { ...prev.staffByPetId, [petId]: v },
                            }))}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={newAppt.staffId ? `Same as booking` : "Assign groomer"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__same">Same as booking</SelectItem>
                              {activeStaff.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* A date and a half-hour slot, rather than one datetime-local
                whose time half is a spinner you scroll to the minute.
                Lauren, booking all day: "the time clock is set to time
                slots - not having to scroll to a time... at least make it
                half hour blocks." The end time still follows automatically
                from the dogs' size, so this is usually the only field
                touched. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={splitLocalDateTime(newAppt.scheduledStart).date}
                  onChange={e => setNewAppt(p => ({
                    ...p,
                    scheduledStart: joinLocalDateTime(e.target.value, splitLocalDateTime(p.scheduledStart).time || "09:00"),
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start time *</Label>
                <Select
                  value={splitLocalDateTime(newAppt.scheduledStart).time}
                  onValueChange={v => setNewAppt(p => {
                    const { date } = splitLocalDateTime(p.scheduledStart);
                    // Picking a time before a date is a reasonable order to
                    // work in; default to today rather than dropping it.
                    const day = date || new Date().toLocaleDateString("en-CA", { timeZone: getActiveTimeZone() });
                    return { ...p, scheduledStart: joinLocalDateTime(day, v) };
                  })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a time" /></SelectTrigger>
                  <SelectContent>
                    {timeSlotsWithAvailability.map(slot => (
                      // Busy slots stay selectable. The salon squeezes dogs
                      // in for real reasons and a dropdown that hid them
                      // would just send staff back to guessing — this says
                      // what is there and lets them decide.
                      <SelectItem key={slot.value} value={slot.value}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className={slot.busy ? "text-muted-foreground" : ""}>{slot.label}</span>
                          {slot.busy && (
                            <span className="truncate text-[11px] text-amber-600 dark:text-amber-500">
                              {slot.clashes[0].kind === "blockout"
                                ? slot.clashes[0].label
                                : describeClash(slot.clashes[0])}
                              {slot.clashes.length > 1 ? ` +${slot.clashes.length - 1}` : ""}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ends</Label>
                <Input type="datetime-local" value={newAppt.scheduledEnd} onChange={e => setNewAppt(p => ({ ...p, scheduledEnd: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Suggested from the dogs' size — change it for a known-quick or a difficult groom.</p>
              </div>
            </div>
            {bookingClashes.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-medium">{clashWarning(bookingClashes, bookingGroomerName)}</p>
                <p className="mt-0.5 opacity-80">You can still book it — you'll be asked to confirm.</p>
              </div>
            )}
            {(() => {
              if (!newAppt.scheduledStart) return null;
              const d = new Date(newAppt.scheduledStart);
              // Convert to AEST day-of-week: 0=Sun,1=Mon,6=Sat
              const aestDate = new Date(d.getTime() + 10 * 60 * 60 * 1000);
              const dow = aestDate.getUTCDay();
              if (dow === 0 || dow === 1 || dow === 6) {
                const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
                return (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">This date falls on a {dayName}</p>
                      <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">The salon is closed Saturday, Sunday &amp; Monday. Please confirm this date is correct before saving.</p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            {membershipCoverage.data?.fullyCovered && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Set to $0.00 because the selected dogs are covered by active weekly memberships.
              </p>
            )}
            {newAppt.clientId && selectedAppointmentPetIds.length > 0 && (
              <BookingPetPricing
                clientId={Number(newAppt.clientId)}
                petIds={selectedAppointmentPetIds}
                serviceType={newAppt.serviceType}
                membershipCovered={Boolean(membershipCoverage.data?.fullyCovered)}
                priceByPetId={newAppt.priceByPetId}
                onPricesChange={next => setNewAppt(p => ({ ...p, priceByPetId: next }))}
                addOnsByPetId={newAppt.addOnsByPetId}
                onAddOnsChange={next => setNewAppt(p => ({ ...p, addOnsByPetId: next }))}
                onServiceTypeChange={v => setNewAppt(p => ({ ...p, serviceType: v }))}
                onRepeatLast={last => setNewAppt(p => {
                  const next = { ...p };
                  // Only fill a groomer nobody has chosen yet — repeating
                  // last time must not undo a deliberate pick.
                  if (last.staffId && !p.staffId) next.staffId = String(last.staffId);
                  if (last.durationMinutes && p.scheduledStart) {
                    const start = new Date(p.scheduledStart);
                    if (!Number.isNaN(start.getTime())) {
                      const end = new Date(start.getTime() + last.durationMinutes * 60000);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      next.scheduledEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
                    }
                  }
                  return next;
                })}
              />
            )}
            {/* Lauren, 13/10: "if a client has to be finished by a certain
                time it's BOLD and near the groomers box so its clear to
                everyone including bathers". The board badge, the risk model
                and the column all already existed — but the only way to set
                one was buried in the edit dialog, so in 15,643 appointments
                not a single deadline had ever been recorded. This is the
                moment the client actually says it. */}
            <div className="space-y-1.5">
              <Label>Must be finished by</Label>
              <Select
                value={newAppt.collectByTime === "" ? "__none__" : newAppt.collectByTime}
                onValueChange={v => setNewAppt(p => ({ ...p, collectByTime: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No deadline</SelectItem>
                  {buildTimeSlots({ include: newAppt.collectByTime || null }).map(slot => (
                    <SelectItem key={slot.value} value={slot.value}>{slot.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newAppt.collectByTime && (
                <p className="text-[11px] text-muted-foreground">
                  Shows in bold on the workflow board, and warns the bathers while there is still time to reorder the queue.
                </p>
              )}
            </div>
            {newAppt.petIds.length >= 1 && (
              <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={repeatForm.enabled}
                    onChange={e => setRepeatForm(f => ({ ...f, enabled: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm font-medium">Repeat this booking</span>
                </label>
                {repeatForm.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Every</Label>
                      <Select value={repeatForm.frequencyWeeks} onValueChange={v => setRepeatForm(f => ({ ...f, frequencyWeeks: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map(w => (
                            <SelectItem key={w} value={String(w)}>{w === 1 ? "1 week" : `${w} weeks`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Until *</Label>
                      <Input type="date" value={repeatForm.untilDate} onChange={e => setRepeatForm(f => ({ ...f, untilDate: e.target.value }))} />
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">
                      Creates a booking every {repeatForm.frequencyWeeks} week{repeatForm.frequencyWeeks === "1" ? "" : "s"} at the same time
                      {newAppt.petIds.length > 1 ? ` for all ${newAppt.petIds.length} selected dogs together` : ""}, starting from the date above, up to and including the "Until" date.
                      {newAppt.petIds.length > 1
                        ? " If the groomer is already booked on a particular date, that whole occurrence (all dogs) is skipped and the rest of the series still gets created."
                        : " If the groomer is already booked on a particular date, that one occurrence is skipped and the rest still get created."}
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Any special instructions..." value={newAppt.notes} onChange={e => setNewAppt(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAppt(false)}>Cancel</Button>
            <Button onClick={() => handleCreate()} disabled={multiPetCreateMutation.isPending || createRecurringMutation.isPending}>
              {multiPetCreateMutation.isPending || createRecurringMutation.isPending
                ? "Creating..."
                : repeatForm.enabled ? "Create Recurring Bookings" : "Create Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Double-booking confirmation ──
          Warn, never block: the salon squeezes dogs in for good reasons and
          a system that refused would simply be worked around. The cost of
          going ahead is one click; the cost of not noticing was a groomer
          with two dogs in one slot. */}
      <Dialog open={!!clashConfirm} onOpenChange={open => { if (!open) setClashConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>That time is already taken</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>{clashConfirm?.message}</p>
            <div className="rounded-lg border bg-muted/40 p-2.5 text-xs">
              {bookingClashes.map((clash, idx) => (
                <p key={idx} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{describeClash(clash)}</span>
                  <span className="text-muted-foreground">
                    {clash.kind === "blockout" ? "Not working" : "Booked"}
                  </span>
                </p>
              ))}
            </div>
            <p className="text-muted-foreground">Book it anyway?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClashConfirm(null)}>Pick another time</Button>
            <Button
              onClick={() => { setClashConfirm(null); handleCreate(true); }}
              disabled={multiPetCreateMutation.isPending || createRecurringMutation.isPending}
            >
              Book anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Appointment Dialog ── */}
      <Dialog open={!!editAppt} onOpenChange={open => { if (!open) closeEditDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            {/* The dog and the owner carry the heading. "Edit appointment"
                is the one thing on this screen a groomer already knows, and
                it was taking the bold while the name sat in small grey text
                beside it. */}
            <DialogTitle className="flex items-start gap-2">
              <Pencil className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-normal uppercase tracking-wide text-muted-foreground">
                  Edit appointment
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold leading-tight">
                  {/* Wraps rather than truncates: on a phone the owner's
                      surname is exactly what gets cut off, and it is half
                      the reason the name is here at all. */}
                  {editAppt
                    ? formatAppointmentHeading({
                        petNames: [editAppt, ...getSiblings(editAppt)].map(p => p.petName),
                        clientFirstName: getSiblings(editAppt).length > 0 ? null : editAppt.clientFirstName,
                        clientLastName: editAppt.clientLastName,
                      })
                    : "Appointment"}
                  {editAppt && getSiblings(editAppt).length > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {1 + getSiblings(editAppt).length} pets
                    </span>
                  )}
                </span>
              </span>
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
                          <span key={p.id} className="inline-flex items-center gap-1.5 ml-1">
                            <PetPhotoQuickAdd petId={p.petId} petName={p.petName} appointmentId={p.id} className="h-10 w-10" />
                            <strong>{p.petName}</strong>{p.petBreed ? ` · ${p.petBreed}` : ""}
                            {p.lastAppointmentDate && <span className="text-xs text-muted-foreground">· Last: {new Date(p.lastAppointmentDate).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", year: "numeric" })}</span>}
                            {rStatus === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />}
                            {rStatus === "draft" && <span className="text-[10px] bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded px-1">Draft</span>}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Pet:</span>
                      <PetPhotoQuickAdd petId={editAppt.petId} petName={editAppt.petName} appointmentId={editAppt.id} className="h-10 w-10" />
                      <strong>{editAppt.petName}</strong>{editAppt.petBreed ? ` · ${editAppt.petBreed}` : ""}
                      {reportStatusMap[editAppt.id] === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {reportStatusMap[editAppt.id] === "draft" && <span className="text-[10px] bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded px-1">Draft</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Client:</span>
                    {/* Straight through to the client record - the groomers were
                        going out to Clients and searching by name to get here. */}
                    <Link
                      href={`/clients/${editAppt.clientId}`}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      title="Open this client's record"
                    >
                      {editAppt.clientFirstName} {editAppt.clientLastName}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    {editAppt.clientPhone ? <span className="text-muted-foreground">· {editAppt.clientPhone}</span> : null}
                  </div>
                  {/* Who to ring about THIS booking. The salon was writing
                      "Tx + Rochelle" on the whiteboard in green marker
                      because there was nowhere in here to put it, so the
                      fact died when the board was wiped. The client is
                      always the first option and the default. */}
                  {editContactOptions.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground shrink-0">Contact:</span>
                      <Select
                        value={editForm.contactId === null ? "__primary__" : String(editForm.contactId)}
                        onValueChange={(v) => {
                          if (v === "__add__") { setAddingContact(true); return; }
                          setEditForm(prev => ({ ...prev, contactId: v === "__primary__" ? null : Number(v) }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1" aria-label="Who to contact about this appointment">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {editContactOptions.map((option) => (
                            <SelectItem
                              key={option.id ?? "primary"}
                              value={option.id === null ? "__primary__" : String(option.id)}
                            >
                              {option.name}
                              <span className="text-muted-foreground">
                                {" · "}{option.relationship}
                                {option.phone ? ` · ${option.phone}` : " · no number"}
                              </span>
                            </SelectItem>
                          ))}
                          <SelectItem value="__add__">➕ Add someone else…</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Inline, because the "Pickup contacts" form lives on the
                      client record and /clients/:id is not open to a
                      restricted staff account — so for a groomer that form
                      does not exist. This is where they already are. */}
                  {addingContact && (
                    <div className="rounded-md border bg-card p-2 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Name"
                          aria-label="New contact name"
                          value={newContact.name}
                          onChange={(e) => setNewContact(c => ({ ...c, name: e.target.value }))}
                        />
                        <Input
                          className="h-7 text-xs"
                          placeholder="Mobile"
                          aria-label="New contact mobile"
                          value={newContact.phone}
                          onChange={(e) => setNewContact(c => ({ ...c, phone: e.target.value }))}
                        />
                      </div>
                      <Input
                        className="h-7 text-xs"
                        placeholder="How the salon knows them — daughter, neighbour…"
                        aria-label="New contact relationship"
                        value={newContact.relationship}
                        onChange={(e) => setNewContact(c => ({ ...c, relationship: e.target.value }))}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={
                            addClientContact.isPending
                            || newContact.name.trim().length < 1
                            || newContact.phone.trim().length < 6
                          }
                          onClick={() => addClientContact.mutate({
                            clientId: editAppt.clientId,
                            name: newContact.name.trim(),
                            phone: newContact.phone.trim(),
                            relationship: newContact.relationship.trim() || undefined,
                          })}
                        >
                          {addClientContact.isPending ? "Saving…" : "Save contact"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => { setAddingContact(false); setNewContact({ name: "", phone: "", relationship: "" }); }}
                        >
                          Cancel
                        </Button>
                        {/* Matches the server's own minimum, so the reason
                            the button is dead is visible rather than guessed. */}
                        {newContact.phone.trim().length > 0 && newContact.phone.trim().length < 6 && (
                          <span className="text-[11px] text-muted-foreground">Mobile looks too short</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* The booking points at somebody who is no longer on the
                      client's record. Said out loud rather than silently
                      falling back, so it gets fixed. */}
                  {editContacts.data && contactChoiceIsStale(editContactOptions, editForm.contactId) && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      The contact saved on this booking is no longer on the client’s record. It will fall back to {editAppt.clientFirstName} {editAppt.clientLastName}.
                    </p>
                  )}
                  {editAppt.lastAppointmentDate && <div><span className="text-muted-foreground">Last appointment:</span> {new Date(editAppt.lastAppointmentDate).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    {editSiblings.length > 0 ? (
                      <div className="space-y-2">
                        {[editAppt, ...editSiblings].map(pet => (
                          <div key={pet.id} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0 truncate">{pet.petName}:</span>
                            <Select
                              value={siblingServices[pet.id] ?? pet.serviceType}
                              onValueChange={v => setSiblingServices(prev => ({ ...prev, [pet.id]: v }))}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(SERVICE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Select value={editForm.serviceType} onValueChange={v => setEditForm(p => ({ ...p, serviceType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SERVICE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                {/* Extras done on the day. Each one becomes its own line on
                    the invoice rather than disappearing into the price. Sits
                    with the service it belongs to, above the times. */}
                {editAppt && <AppointmentAddOns appointmentId={editAppt.id} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <p className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-800 dark:text-red-300">Cancelled appointments stay at their original booked time for historical tracking. Create a new appointment if the client needs to be rebooked.</p>
                )}
                {(() => {
                  if (!editForm.scheduledStart) return null;
                  const d = new Date(editForm.scheduledStart);
                  const aestDate = new Date(d.getTime() + 10 * 60 * 60 * 1000);
                  const dow = aestDate.getUTCDay();
                  if (dow === 0 || dow === 1 || dow === 6) {
                    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
                    return (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">This date falls on a {dayName}</p>
                          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">The salon is closed Saturday, Sunday &amp; Monday. Please confirm this date is correct before saving.</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={editForm.workflowState} onValueChange={v => setEditForm(p => ({ ...p, workflowState: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(WORKFLOW_COLOURS).map(s => (
                          <SelectItem key={s} value={s}>{workflowStateLabel(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* A deadline the client gave us — "she has to be home
                        by twelve". It shows on the workflow board so the
                        bathers can order the queue around it, which is no
                        use once the dog is already late. */}
                    <Label htmlFor={`collect-by-${editAppt.id}`} className="pt-1 text-xs text-muted-foreground">
                      Must go home by
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`collect-by-${editAppt.id}`}
                        type="time"
                        className="h-8 w-28 text-sm"
                        value={collectByDraft}
                        onChange={e => setCollectByDraft(e.target.value)}
                      />
                      <Button
                        type="button" size="sm" variant="outline" className="h-8 text-xs"
                        disabled={collectByMutation.isPending}
                        onClick={() => collectByMutation.mutate({
                          appointmentId: editAppt.id,
                          time: collectByDraft === "" ? null : collectByDraft,
                        })}
                      >
                        {collectByDraft === "" ? "Clear" : "Save"}
                      </Button>
                    </div>
                  </div>
                  {/* A discount decided at booking time, not only at the
                      counter. price becomes the net figure, so the family
                      breakdown and the split bill both follow. */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {describeDiscount(editAppt.discountPercent, editAppt.discountReason) ?? "No discount applied"}
                    </span>
                    <ApplyDiscountDialog
                      appointmentId={editAppt.id}
                      grossPrice={editAppt.preDiscountPrice ?? editAppt.price}
                      currentPercent={editAppt.discountPercent}
                      currentReason={editAppt.discountReason}
                      sessionHasOtherPets={editSiblings.length > 0}
                      onApplied={() => { closeEditDialog(); refetch(); }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Price ($)</Label>
                    {editSiblings.length > 0 ? (
                      <div className="space-y-2">
                        {[editAppt, ...editSiblings].map(pet => (
                          <div key={pet.id} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0 truncate">{pet.petName}:</span>
                            <Input
                              className="h-8 text-xs flex-1"
                              placeholder="0.00"
                              value={siblingPrices[pet.id] !== undefined ? siblingPrices[pet.id] : (pet.price ?? "")}
                              onChange={e => setSiblingPrices(prev => ({ ...prev, [pet.id]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Input placeholder="0.00" value={editForm.price} onChange={e => setEditForm(p => ({ ...p, price: e.target.value }))} />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
                </div>

                {/* Money taken, as many transactions as it takes: part cash
                    part card, a deposit and a balance, or one dog each. */}
                <SplitPaymentPanel appointmentId={editAppt.id} />
                <DialogFooter className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    className="mr-auto shrink-0 gap-1.5 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
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
                  {editSiblings.length > 0 && (() => {
                    const allPets = [editAppt, ...editSiblings];
                    const allHavePrices = allPets.every(p => {
                      const price = siblingPrices[p.id] !== undefined ? siblingPrices[p.id] : (p.price ?? "");
                      return price !== "" && parseFloat(price) > 0;
                    });
                    return (
                      <Button
                        variant="outline"
                        className="gap-1.5 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300"
                        disabled={!allHavePrices || createSessionBillsMutation.isPending}
                        title={!allHavePrices ? "Set a price for each dog before generating bills" : "Create a separate draft invoice for each dog"}
                        onClick={() => createSessionBillsMutation.mutate({
                          appointmentIds: allPets.map(p => p.id),
                        })}
                      >
                        {createSessionBillsMutation.isPending ? "Creating..." : "Create Bills"}
                      </Button>
                    );
                  })()}
                  <Button variant="outline" onClick={closeEditDialog}>Cancel</Button>
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
                            styleTargetPetId === pet.petId
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
                            {new Date((lastCompletedStyle.data.completedAt ?? lastCompletedStyle.data.scheduledStart ?? lastCompletedStyle.data.createdAt) as Date).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", year: "numeric" })}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Blade Size</Label><Input className="h-8 text-xs" placeholder="e.g. #7F, #5" value={styleNoteForm.bladeSize} onChange={e => setStyleNoteForm(f => ({ ...f, bladeSize: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Comb / Guard</Label><Input className="h-8 text-xs" placeholder="e.g. 16mm" value={styleNoteForm.combSize} onChange={e => setStyleNoteForm(f => ({ ...f, combSize: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Body Length</Label><Input className="h-8 text-xs" placeholder="e.g. 1cm, short" value={styleNoteForm.bodyLength} onChange={e => setStyleNoteForm(f => ({ ...f, bodyLength: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Head Style</Label><Input className="h-8 text-xs" placeholder="e.g. Round, flat top" value={styleNoteForm.headStyle} onChange={e => setStyleNoteForm(f => ({ ...f, headStyle: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Face Style</Label><Input className="h-8 text-xs" placeholder="e.g. Teddy bear" value={styleNoteForm.faceStyle} onChange={e => setStyleNoteForm(f => ({ ...f, faceStyle: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Ear Style</Label><Input className="h-8 text-xs" placeholder="e.g. Rounded, long" value={styleNoteForm.earStyle} onChange={e => setStyleNoteForm(f => ({ ...f, earStyle: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                            className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${styleNoteForm.alertLevel === lvl ? lvl === "danger" ? "bg-red-500 text-white border-red-500" : lvl === "caution" ? "bg-amber-400 text-white border-amber-400" : "bg-emerald-500 text-white border-emerald-500" : "bg-transparent text-muted-foreground border-muted"}`}>
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
                      petId: styleTargetPetId ?? editAppt.petId,
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
                          <span className="text-muted-foreground">{new Date(n.createdAt).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", year: "numeric" })}{n.staffName ? ` · ${n.staffName}` : ""}</span>
                          {(n as any).serviceType && <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 capitalize">{(n as any).serviceType.replace("_"," ")}</span>}
                          {(n as any).alertLevel === "danger" && <span className="bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded px-1.5 py-0.5 font-semibold">🔴 Danger</span>}
                          {(n as any).alertLevel === "caution" && <span className="bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 font-semibold">⚠ Caution</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="text-xs text-primary hover:underline" onClick={() => { setStyleNoteForm(styleDraftFromNote(n)); setPhotoPreview(n.photoUrl ?? null); toast.success("Style loaded — edit and save as new"); }}>↩ Use</button>
                          <button className="text-muted-foreground hover:text-red-500 ml-1" onClick={() => setConfirmDelete({ type: "styleNote", id: n.id, label: new Date(n.createdAt).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", year: "numeric" }) })}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {(n as any).warnings && <div className={`rounded px-2 py-1 text-xs ${(n as any).alertLevel === "danger" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"}`}><span className="font-semibold">⚠ </span>{(n as any).warnings}</div>}
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
                      const activePetId = styleTargetPetId ?? editAppt.petId;
                      const allPets = [editAppt, ...editSiblings];
                      const activePet = allPets.find(p => p.petId === activePetId);
                      const petName = activePet?.petName ?? editAppt.petName ?? "Pet";
                      const clientName = [editAppt?.clientFirstName, editAppt?.clientLastName].filter(Boolean).join(" ");
                      const biz = tenantInfo;
                      const logoAbsUrl = biz?.logoUrl ? (biz.logoUrl.startsWith("/") ? `${window.location.origin}${biz.logoUrl}` : biz.logoUrl) : null;
                      const html = `<!DOCTYPE html><html><head><title>Groom Style — ${petName}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#111}.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px}.header-left{display:flex;align-items:center;gap:14px}.header-logo{height:52px;width:auto;object-fit:contain}.biz-name{font-size:16px;font-weight:700;margin:0 0 3px}.biz-contact{font-size:11px;color:#666;line-height:1.6}.header-right{text-align:right;font-size:11px;color:#888}.header-right strong{display:block;font-size:14px;color:#111;font-weight:600}.card{border:1px solid #ddd;border-radius:6px;padding:12px 16px;margin-bottom:12px;page-break-inside:avoid}.card.danger{border-color:#f87171}.card.caution{border-color:#fbbf24}.meta{font-size:11px;color:#888;margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap}.badge{background:#f0f0f0;border-radius:4px;padding:2px 8px;font-size:11px}.badge.alert-danger{background:#fee2e2;color:#b91c1c}.badge.alert-caution{background:#fef3c7;color:#92400e}.warning-box{background:#fef3c7;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:12px;color:#92400e}.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.tag{background:#f0f0f0;border-radius:4px;padding:2px 8px;font-size:11px}.body{font-size:13px}@media print{body{margin:16px}}</style></head><body><div class="header"><div class="header-left">${logoAbsUrl ? `<img src="${logoAbsUrl}" class="header-logo" alt="logo" />` : ""}<div><p class="biz-name">${biz?.name ?? "Grooming Salon"}</p><div class="biz-contact">${biz?.phone ? `<span>${biz.phone}</span><br/>` : ""}${biz?.email ? `<span>${biz.email}</span><br/>` : ""}${biz?.address ? `<span>${biz.address}</span>` : ""}</div></div></div><div class="header-right"><strong>Groom Style History</strong>${clientName}<br/>${petName}<br/>Printed ${new Date().toLocaleDateString("en-AU",{ timeZone: getActiveTimeZone(),day:"numeric",month:"long",year:"numeric"})}</div></div>${notes.map(n=>`<div class="card${(n as any).alertLevel==="danger"?" danger":(n as any).alertLevel==="caution"?" caution":""}"><div class="meta"><span>${new Date(n.createdAt).toLocaleDateString("en-AU",{ timeZone: getActiveTimeZone(),day:"numeric",month:"short",year:"numeric"})}${n.staffName?` · ${n.staffName}`:""}</span>${(n as any).serviceType?`<span class="badge">${(n as any).serviceType.replace("_"," ")}</span>`:""} ${(n as any).alertLevel==="danger"?`<span class="badge alert-danger">🔴 Danger</span>`:(n as any).alertLevel==="caution"?`<span class="badge alert-caution">⚠ Caution</span>`:""}</div>${(n as any).warnings?`<div class="warning-box">⚠ ${(n as any).warnings}</div>`:""}<div class="tags">${[n.bladeSize&&`<span class="tag">Blade: ${n.bladeSize}</span>`,(n as any).combSize&&`<span class="tag">Comb: ${(n as any).combSize}</span>`,n.bodyLength&&`<span class="tag">Body: ${n.bodyLength}</span>`,(n as any).headStyle&&`<span class="tag">Head: ${(n as any).headStyle}</span>`,n.faceStyle&&`<span class="tag">Face: ${n.faceStyle}</span>`,n.earStyle&&`<span class="tag">Ears: ${n.earStyle}</span>`,(n as any).legStyle&&`<span class="tag">Legs: ${(n as any).legStyle}</span>`,n.tailStyle&&`<span class="tag">Tail: ${n.tailStyle}</span>`].filter(Boolean).join("")}</div><div class="body">${n.note}</div></div>`).join("")}</body></html>`;
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
                            {reportStatusMap[pet.id] === "draft" && <span className="text-[9px] bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded px-1">Draft</span>}
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
      <BlockoutDialog
        open={showBlockoutDialog}
        onOpenChange={(open) => { setShowBlockoutDialog(open); if (!open) setBlockoutEditing(null); }}
        staff={activeStaff.map(st => ({ id: st.id, name: st.name, colourHex: st.colourHex, photoUrl: (st as { photoUrl?: string | null }).photoUrl }))}
        editing={blockoutEditing}
        defaultStartDate={blockoutDefaultDate}
        onSaved={() => { void refetchBlockouts(); }}
      />
      {/* ── Confirm Delete Dialog ── */}
      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
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
                  deleteBlockoutMutation.mutate({ id: confirmDelete.id, wholeGroup: true }, { onSuccess: () => setConfirmDelete(null) });
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
