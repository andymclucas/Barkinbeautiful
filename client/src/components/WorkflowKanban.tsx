import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DogBoardHoverCard } from "@/components/DogBoardHoverCard";
import { PetAvatar } from "@/components/PetAvatar";
import { StaffAvatar } from "@/components/StaffAvatar";
import { VipMark } from "@/components/VipMark";
import { formatLiveStageElapsed, getLiveStageElapsedSeconds } from "@/lib/workflowStageTimer";
import { groupIntoKanbanColumns, isWaitingInColumn, kanbanColumnFor, type KanbanColumn } from "@shared/workflowKanbanColumns";
import { petAlertTone } from "@shared/petAlert";
import { hasPetCodes } from "@shared/petCodes";
import { serviceBoardLabel, serviceColour } from "@shared/serviceTypes";
import { NEXT_STAGE, STAGES, fmtTime, stageColour, type BoardActions, type StageKey, type StaffLite } from "./WorkflowBoardTable";

/**
 * Simple mode: the day as columns, one card per dog, only the basics on the
 * card. Everything else — alerts, warning codes, MoeGo codes, notes — is one
 * hover (mouse) or one tap on the card's marker (tablet) away, through the
 * same summary the full board's name hover shows (DogBoardHoverCard).
 *
 * Column rules live in shared/workflowKanbanColumns.ts. Moving a dog uses the
 * board's own actions, so going home still asks "Mark as Out?" first.
 */
export function WorkflowKanban({
  rows,
  now,
  bathers,
  groomers,
  actions,
  showOut,
  readOnly = false,
}: {
  rows: any[];
  now: number;
  bathers: StaffLite[];
  groomers: StaffLite[];
  actions: BoardActions;
  showOut: boolean;
  readOnly?: boolean;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  /*
   * Dragging by touch. The browser's own drag and drop is mouse-only, so on
   * a phone or tablet the cards could not be moved at all (Andy,
   * 24/11/2026). Press and hold a card to pick it up; a quick swipe still
   * scrolls. The dog's name follows the finger, the column under it lights
   * up, and letting go moves the dog through the same rules as a mouse drop.
   */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [touchDrag, setTouchDrag] = useState<{ id: number; name: string; x: number; y: number } | null>(null);
  const columnAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-kanban-column]")?.getAttribute("data-kanban-column") ?? null;
  const touch: TouchDragHandlers = {
    begin: (row, x, y) => {
      setTouchDrag({ id: row.id, name: row.petName ?? "Dog", x, y });
      setOverColumn(columnAt(x, y));
      navigator.vibrate?.(15);
    },
    move: (x, y) => {
      setTouchDrag((d) => (d ? { ...d, x, y } : d));
      setOverColumn(columnAt(x, y));
      // Near either edge, carry the board sideways to the columns off screen.
      const el = scrollerRef.current;
      if (el) {
        const box = el.getBoundingClientRect();
        if (x < box.left + 40) el.scrollLeft -= 14;
        else if (x > box.right - 40) el.scrollLeft += 14;
      }
    },
    end: (x, y) => {
      const key = columnAt(x, y);
      const dragged = touchDrag ? rows.find((r) => r.id === touchDrag.id) : undefined;
      setTouchDrag(null);
      setOverColumn(null);
      const target = groups.find((g) => g.column.key === key)?.column;
      if (dragged && target) moveTo(dragged, target);
    },
    cancel: () => { setTouchDrag(null); setOverColumn(null); },
  };
  const staffById = new Map<number, StaffLite>();
  for (const s of [...bathers, ...groomers]) staffById.set(s.id, s);
  const groups = groupIntoKanbanColumns(rows, { showOut });

  const moveTo = (row: any, column: KanbanColumn) => {
    if (readOnly || kanbanColumnFor(row.workflowState) === column.key) return;
    if (column.dropState === "complete") {
      // Going home always asks first, the same as the full board.
      actions.setOutConfirm({ id: row.id, petName: row.petName ?? "this dog" });
      return;
    }
    const patch: Record<string, unknown> = { workflowState: column.dropState };
    if (column.dropState !== "scheduled" && !row.checkedInAt) patch.checkedInAt = Date.now();
    if (column.dropState === "ready") patch.readyAt = Date.now();
    actions.update(row.id, patch, { petName: row.petName });
  };

  return (
    // Scrolls sideways on a tablet rather than squeezing six areas into
    // cards too narrow to read.
    <div ref={scrollerRef} className="overflow-x-auto pb-1" data-testid="workflow-kanban">
    {touchDrag && (
      <div
        className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[130%] rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-lg"
        style={{ left: touchDrag.x, top: touchDrag.y }}
        data-testid="kanban-touch-ghost"
      >
        {touchDrag.name}
      </div>
    )}
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(200px, 1fr))` }}
    >
      {groups.map(({ column, rows: cards }) => (
        <section
          key={column.key}
          aria-label={`${column.label}, ${cards.length} ${cards.length === 1 ? "dog" : "dogs"}`}
          data-kanban-column={column.key}
          className={`flex min-h-[200px] flex-col rounded-2xl border bg-muted/30 transition-colors ${overColumn === column.key ? "border-primary/60 bg-primary/5" : ""}`}
          onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); setOverColumn(column.key); }}
          onDragLeave={readOnly ? undefined : () => setOverColumn((c) => (c === column.key ? null : c))}
          onDrop={readOnly ? undefined : (e) => {
            e.preventDefault();
            setOverColumn(null);
            const row = rows.find((r) => r.id === dragId);
            setDragId(null);
            if (row) moveTo(row, column);
          }}
        >
          <header className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: stageColour(column.dropState) }} />
              {column.label}
            </span>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{cards.length}</span>
          </header>
          <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
            {cards.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground/70">No dogs</p>}
            {cards.map((row) => (
              <KanbanCard
                key={row.id}
                row={row}
                now={now}
                column={column}
                staff={staffForColumn(row, column, staffById)}
                readOnly={readOnly}
                busy={actions.updateStagePending}
                onDragStart={() => setDragId(row.id)}
                onAdvance={() => actions.advanceStage(row)}
                touch={touch}
                lifted={touchDrag?.id === row.id}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
    </div>
  );
}

function staffForColumn(row: any, column: KanbanColumn, staffById: Map<number, StaffLite>): StaffLite | undefined {
  const id = column.key === "bath" ? row.bathStaffId : column.key === "dry" ? row.dryStaffId : row.staffId;
  return typeof id === "number" ? staffById.get(id) : undefined;
}

type TouchDragHandlers = {
  begin: (row: any, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (x: number, y: number) => void;
  cancel: () => void;
};

/** A touch screen with no mouse: phones and tablets. */
const COARSE_POINTER = typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia("(pointer: coarse)").matches;

/** How long a finger rests on a card before it is picked up. */
const LONG_PRESS_MS = 350;
/** Movement before that which means the finger is scrolling instead. */
const SCROLL_SLOP_PX = 10;

function KanbanCard({ row, now, column, staff, readOnly, busy, onDragStart, onAdvance, touch, lifted }: {
  row: any;
  now: number;
  column: KanbanColumn;
  staff: StaffLite | undefined;
  readOnly: boolean;
  busy: boolean;
  onDragStart: () => void;
  onAdvance: () => void;
  touch: TouchDragHandlers;
  lifted: boolean;
}) {
  // Touch listeners are attached by hand: touchmove must be non-passive to
  // stop the page scrolling while a card is held, which React's own
  // onTouchMove cannot promise.
  const cardRef = useRef<HTMLElement>(null);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  useEffect(() => {
    const el = cardRef.current;
    if (!el || readOnly) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Buttons and the details marker keep their own taps.
      if ((e.target as HTMLElement).closest("button, a, [data-details-marker]")) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      last = start;
      clear();
      timer = setTimeout(() => {
        timer = null;
        active = true;
        touchRef.current.begin(row, last.x, last.y);
      }, LONG_PRESS_MS);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      last = { x: t.clientX, y: t.clientY };
      if (!active) {
        if (Math.hypot(last.x - start.x, last.y - start.y) > SCROLL_SLOP_PX) clear();
        return;
      }
      e.preventDefault();
      touchRef.current.move(last.x, last.y);
    };
    const onEnd = () => {
      clear();
      if (active) { active = false; touchRef.current.end(last.x, last.y); }
    };
    const onCancel = () => {
      clear();
      if (active) { active = false; touchRef.current.cancel(); }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      clear();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [row, readOnly]);
  const waiting = isWaitingInColumn(row.workflowState);
  const stage = STAGES.find((s) => s.key === row.workflowState);
  const next = NEXT_STAGE[row.workflowState as StageKey];
  const nextStage = next ? STAGES.find((s) => s.key === next) : undefined;
  const tone = petAlertTone({ alertLevel: row.petAlertLevel, warnings: row.petWarnings });
  const hasCodes = hasPetCodes(row.petMoegoCodeLabels);
  const seconds = getLiveStageElapsedSeconds({
    workflowState: row.workflowState,
    stageStartedAt: row.stageStartedAt ?? null,
    checkedInAt: row.checkedInAt ?? null,
    scheduledStart: row.scheduledStart,
  }, now);
  const minutes = seconds === null ? null : Math.floor(seconds / 60);
  const isOut = column.key === "out";

  return (
    <article
      ref={cardRef}
      data-kanban-card={row.id}
      // Mouse drag where there is a mouse; on a touch screen the long press
      // above does the job, and iPad Safari's own drag must not race it.
      draggable={!readOnly && !COARSE_POINTER}
      onDragStart={readOnly ? undefined : onDragStart}
      onContextMenu={readOnly ? undefined : (e) => e.preventDefault()}
      className={`group relative select-none rounded-xl border bg-card p-2.5 shadow-sm transition ${readOnly ? "" : "cursor-grab hover:shadow-md active:cursor-grabbing"} ${isOut ? "opacity-60" : ""} ${lifted ? "scale-[0.97] opacity-50 ring-2 ring-primary" : ""}`}
      style={{ borderLeft: `4px solid ${serviceColour(row.serviceType)}`, WebkitTouchCallout: "none" }}
    >
      <div className="flex items-start gap-2">
        <PetAvatar petId={row.petId} petName={row.petName} className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <HoverCard openDelay={200} closeDelay={80}>
            <HoverCardTrigger asChild>
              <p className="flex items-center gap-1 truncate text-sm font-semibold leading-tight">
                <span className="truncate">{row.petName}</span>
                {row.isVipMember && <VipMark />}
              </p>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-auto p-2">
              <DogBoardHoverCard row={row} />
            </HoverCardContent>
          </HoverCard>
          <p className="truncate text-xs text-muted-foreground">{row.clientLastName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(row.scheduledStart)}</span>
          <DetailsMarker row={row} tone={tone} hasCodes={hasCodes} />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <span className="truncate rounded-md px-1.5 py-0.5 font-semibold text-white" style={{ background: serviceColour(row.serviceType) }}>
          {serviceBoardLabel(row.serviceType)}
        </span>
        {(row.cageNumber || row.tagNumber) && (
          <span className="whitespace-nowrap text-muted-foreground" title="Cage and tag">
            {row.cageNumber ? `C${row.cageNumber}` : ""}{row.cageNumber && row.tagNumber ? " · " : ""}{row.tagNumber ? `T${row.tagNumber}` : ""}
          </span>
        )}
        <span className="flex-1" />
        {staff && <StaffAvatar photoUrl={staff.photoUrl} name={staff.name} colourHex={staff.colourHex} className="h-5 w-5" ring={false} />}
      </div>

      {!isOut && (
        // Wraps rather than overflows: on a phone the card is ~200px and the
        // next-stage button ("WAIT DRY") ran past the card's edge.
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${waiting ? "bg-muted text-muted-foreground" : "text-white"}`}
            style={waiting ? undefined : { background: stageColour(row.workflowState) }}
          >
            {stage?.label ?? row.workflowState}
          </span>
          {minutes !== null && (
            <span className={`text-[11px] tabular-nums ${minutes >= 60 ? "font-semibold text-red-600" : minutes >= 30 ? "text-amber-600" : "text-muted-foreground"}`}>
              {formatLiveStageElapsed(seconds)}
            </span>
          )}
          {!readOnly && nextStage && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={busy}
              className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: stageColour(nextStage.key) }}
              aria-label={`Move ${row.petName ?? "dog"} to ${nextStage.label}`}
            >
              {nextStage.short} <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * The one way to everything the card leaves out. A tablet has no hover, so
 * this is a tap target too: red or amber when the dog carries an alert,
 * grey when it only has codes, and a plain info mark otherwise.
 */
function DetailsMarker({ row, tone, hasCodes }: { row: any; tone: "caution" | "danger" | null; hasCodes: boolean }) {
  const label = tone === "danger" ? "Warning" : tone === "caution" ? "Caution" : hasCodes ? "Pet codes" : "Details";
  const className = tone === "danger"
    ? "bg-red-600 text-white"
    : tone === "caution"
      ? "bg-amber-400 text-amber-950"
      : hasCodes ? "bg-muted text-foreground" : "text-muted-foreground/60 hover:bg-muted";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold ${className}`}
          aria-label={`${label} for ${row.petName ?? "this dog"}`}
          data-details-marker={tone ?? (hasCodes ? "codes" : "none")}
        >
          {tone ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
          {tone || hasCodes ? <span>{tone ? "!" : "Codes"}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-auto p-2">
        <DogBoardHoverCard row={row} />
      </PopoverContent>
    </Popover>
  );
}
