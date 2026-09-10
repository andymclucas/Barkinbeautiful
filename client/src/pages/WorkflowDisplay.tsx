import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Clock3, Dog, RefreshCw, Sparkles, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { workflowBoardRefreshOptions } from "@/lib/workflowBoardRefresh";
import { isTerminalWorkflowState } from "@/lib/workflowTerminalStates";
import { groupFamilyWorkflowRows } from "@shared/familyWorkflowGrouping";
import { BATH_PRIORITY_META, buildBathPriorityQueue } from "@shared/bathPriorityQueue";
import { PetAvatar } from "@/components/PetAvatar";

const STAGES = [
  { key: "scheduled", label: "Waiting", colour: "#94a3b8" },
  { key: "checked_in", label: "Checked in", colour: "#06b6d4" },
  { key: "waiting_for_bath", label: "Wait Bath", colour: "#64748b" },
  { key: "bathing", label: "Bath", colour: "#3b82f6" },
  { key: "waiting_for_dry", label: "Wait Dry", colour: "#7c3aed" },
  { key: "drying", label: "Dry", colour: "#8b5cf6" },
  { key: "waiting_for_groom", label: "Wait Groom", colour: "#b45309" },
  { key: "grooming", label: "Groom", colour: "#f59e0b" },
  { key: "ready", label: "Ready", colour: "#10b981" },
] as const;

const INTER_STAGE_WAIT_STATES = new Set(["waiting_for_bath", "waiting_for_dry", "waiting_for_groom"]);

function isInterStageWaitState(workflowState: string) {
  return INTER_STAGE_WAIT_STATES.has(workflowState);
}

const SCROLL_SPEEDS = [
  { label: "Off", tickMs: null },
  { label: "Slow", tickMs: 70 },
  { label: "Normal", tickMs: 45 },
  { label: "Fast", tickMs: 25 },
] as const;
const TOP_PAUSE_MS = 4500;
const BOTTOM_PAUSE_MS = 4500;

function formatDuration(minutes: number | null) {
  if (minutes === null || minutes < 0) return "";
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

export default function WorkflowDisplay() {
  const { loading, user } = useAuth();
  const displayUrl = typeof window === "undefined"
    ? "https://groomingsos-mqzfsvzv.manus.space/workflow/display"
    : `${window.location.origin}/workflow/display`;
  const [now, setNow] = useState(Date.now());
  const [scrollSpeedIndex, setScrollSpeedIndex] = useState(2);
  const [showCompleted, setShowCompleted] = useState(false);
  const [leavingAppointmentIds, setLeavingAppointmentIds] = useState<number[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const knownActiveIdsRef = useRef<number[] | null>(null);
  const [boardDate, setBoardDate] = useState(() => new Date(Date.now() + 10 * 3600000).toISOString().slice(0, 10));
  const { data: boardData, refetch, isFetching, isLoading: isBoardLoading, isError } = trpc.workflow.getBoard.useQuery(
    { tenantId: 1, date: boardDate },
    { ...workflowBoardRefreshOptions, enabled: !!user },
  );
  const restoreCompletedMutation = trpc.calendar.updateWorkflowState.useMutation({
    onSuccess: () => { void refetch(); },
  });
  const dayRows = groupFamilyWorkflowRows(boardData ?? []);
  const bathQueue = useMemo(() => buildBathPriorityQueue(dayRows), [dayRows]);
  const completedRows = dayRows.filter(row => row.workflowState === "complete");
  const waitingRows = dayRows.filter(row => row.workflowState === "scheduled" || isInterStageWaitState(row.workflowState));
  // The register intentionally contains only dogs still moving through the salon.
  // Completed dogs remain visible in the summary above, not in the active work list.
  const activeRows = dayRows.filter(row => !isTerminalWorkflowState(row.workflowState));
  const registerRows = showCompleted ? [...activeRows, ...completedRows] : activeRows;
  const inProgressCount = dayRows.filter(row => !isTerminalWorkflowState(row.workflowState) && row.workflowState !== "scheduled" && !isInterStageWaitState(row.workflowState)).length;
  const scrollSpeed = SCROLL_SPEEDS[scrollSpeedIndex];
  const isFocusRegister = activeRows.length > 0 && activeRows.length <= 4;
  const rowTextClass = isFocusRegister ? "text-xl md:text-2xl" : "text-sm";
  const rowDetailClass = isFocusRegister ? "text-base md:text-lg" : "text-xs";
  const rowPaddingClass = isFocusRegister ? "py-7" : "py-4";
  const stageBadgeClass = isFocusRegister ? "px-3.5 py-2 text-sm md:text-base" : "px-2.5 py-1 text-xs";
  const dailyCompletionPercent = dayRows.length === 0 ? 0 : Math.round((completedRows.length / dayRows.length) * 100);

  const restoreCompletedDog = (appointmentId: number) => {
    restoreCompletedMutation.mutate({ appointmentId, newState: "ready" });
  };

  const resetForTomorrow = () => {
    knownActiveIdsRef.current = null;
    setLeavingAppointmentIds([]);
    setShowCompleted(false);
    setBoardDate(currentDate => {
      const nextDate = new Date(`${currentDate}T00:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      return nextDate.toISOString().slice(0, 10);
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const currentActiveIds = activeRows.map(row => row.id);
    const priorActiveIds = knownActiveIdsRef.current;
    knownActiveIdsRef.current = currentActiveIds;
    if (!priorActiveIds) return;

    const justCompletedIds = priorActiveIds.filter(id => !currentActiveIds.includes(id));
    if (justCompletedIds.length === 0) return;
    setLeavingAppointmentIds(current => Array.from(new Set([...current, ...justCompletedIds])));
    const clearTimer = window.setTimeout(() => {
      setLeavingAppointmentIds(current => current.filter(id => !justCompletedIds.includes(id)));
    }, 760);
    return () => window.clearTimeout(clearTimer);
  }, [activeRows]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollIntervalMs = scrollSpeed.tickMs;
    if (scrollIntervalMs === null) return;

    let scrollTimer: number | undefined;
    let restartTimer: number | undefined;
    let cancelled = false;

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) callback();
      }, delay);
      return timer;
    };

    const beginScrollCycle = () => {
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      if (maxScrollTop <= 2) {
        restartTimer = schedule(beginScrollCycle, 5000);
        return;
      }

      scrollTimer = window.setInterval(() => {
        const nextPosition = Math.min(container.scrollTop + 1, maxScrollTop);
        container.scrollTop = nextPosition;
        if (nextPosition >= maxScrollTop) {
          if (scrollTimer) window.clearInterval(scrollTimer);
          restartTimer = schedule(() => {
            container.scrollTop = 0;
            restartTimer = schedule(beginScrollCycle, TOP_PAUSE_MS);
          }, BOTTOM_PAUSE_MS);
        }
      }, scrollIntervalMs);
    };

    restartTimer = schedule(beginScrollCycle, TOP_PAUSE_MS);
    return () => {
      cancelled = true;
      if (scrollTimer) window.clearInterval(scrollTimer);
      if (restartTimer) window.clearTimeout(restartTimer);
    };
  }, [activeRows.length, scrollSpeed.tickMs]);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading workflow board…</div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div>
          <Dog className="h-12 w-12 text-teal-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Workflow display</h1>
          <p className="mt-2 text-slate-300">Sign in on this screen to view the live grooming-room board.</p>
          <Link href="/login" className="inline-flex mt-5 px-4 py-2 rounded-lg bg-teal-500 text-slate-950 font-semibold">Sign in</Link>
        </div>
      </div>
    );
  }

  if (isBoardLoading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div>
          <Dog className="h-12 w-12 text-teal-400 mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-bold">Connecting to the workflow display</h1>
          <p className="mt-2 text-slate-300">Loading the live salon board…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div>
          <WifiOff className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Workflow display reconnecting</h1>
          <p className="mt-2 text-slate-300">The screen will retry automatically. You can also refresh this display.</p>
        </div>
      </main>
    );
  }

  const stageCounts = Object.fromEntries(STAGES.map(stage => [stage.key, activeRows.filter(row => row.workflowState === stage.key).length]));

  return (
    <main className="min-h-screen bg-slate-950 text-white p-5 md:p-8">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <img src="/barkin_beautiful_logo.png" alt="Barkin Beautiful" className="h-12 w-12 object-contain rounded bg-white p-1" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Live Workflow Board</h1>
            <p className="text-sm text-slate-400">{new Date(`${boardDate}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })} · Independent read-only display</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"><Clock3 className="h-4 w-4 text-teal-300" /> Salon time</div>
            <time className="font-mono text-3xl font-bold tabular-nums text-white md:text-4xl" dateTime={new Date(now).toISOString()}>{new Date(now).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</time>
          </div>
          <div className="hidden items-center gap-3 text-sm text-slate-400 sm:flex">
            {isFetching ? <WifiOff className="h-4 w-4 text-amber-400" /> : <Wifi className="h-4 w-4 text-emerald-400" />}
            <span>{activeRows.length} dogs in salon</span>
            <button onClick={() => refetch()} className="p-2 rounded hover:bg-white/10" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <aside className="mb-5 flex items-center gap-3 rounded-xl border border-teal-300/20 bg-teal-400/5 px-3 py-2.5" aria-label="TV display QR access">
        <div className="rounded-lg bg-white p-1.5"><QRCodeSVG value={displayUrl} size={78} level="M" includeMargin={false} /></div>
        <div>
          <p className="text-sm font-bold text-teal-100">Scan to open TV display</p>
          <p className="mt-0.5 text-xs text-slate-400">Open this display on a phone or tablet. Sign-in is still required.</p>
        </div>
      </aside>

      <section className="mb-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 text-center">
        <div className="bg-slate-700/70 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Waiting</div>
          <div className="mt-1 text-3xl font-black tabular-nums text-white">{waitingRows.length}</div>
        </div>
        <div className="bg-cyan-500/15 px-4 py-3 ring-1 ring-inset ring-cyan-400/30">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">In progress</div>
          <div className="mt-1 text-3xl font-black tabular-nums text-cyan-100">{inProgressCount}</div>
        </div>
        <div className="bg-emerald-500/15 px-4 py-3 ring-1 ring-inset ring-emerald-400/30">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Completed</div>
          <div className="mt-1 text-3xl font-black tabular-nums text-emerald-100">{completedRows.length}</div>
        </div>
      </section>

      <section className="mb-5 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3" aria-label="Daily completion progress">
        <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
          <span>Daily progress</span>
          <span className="text-emerald-200">{completedRows.length} of {dayRows.length} dogs complete · {dailyCompletionPercent}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label="Dogs completed today" aria-valuemin={0} aria-valuemax={dayRows.length} aria-valuenow={completedRows.length}>
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${dailyCompletionPercent}%` }} />
        </div>
      </section>

      {bathQueue.length > 0 && <section className="mb-5 rounded-xl border border-cyan-300/20 bg-cyan-400/5 px-4 py-3" aria-label="Bathing priority queue"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-cyan-100">Bath queue</h2><p className="mt-0.5 text-xs text-slate-400">Priority guides bathing order without changing the scheduled workflow.</p></div><span className="rounded-full bg-cyan-400 px-2 py-0.5 text-[10px] font-black text-slate-950">1 = NEXT</span></div><div className="mt-2 flex flex-wrap gap-2">{bathQueue.map((item) => { const meta = BATH_PRIORITY_META[item.priority]; return <div key={`${item.priority}-${item.rows.map((row) => row.id).join("-")}`} className="flex items-center gap-1.5 rounded-lg border bg-slate-950/50 px-2.5 py-1.5 text-xs" style={{ borderColor: meta.colour }}><span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ background: meta.colour }}>{item.priority}</span><span className="font-semibold text-white">{item.petNames.join(" & ")}</span>{item.isCoordinatedBooking && <span className="text-[10px] font-semibold text-cyan-200">together</span>}</div>; })}</div></section>}

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {STAGES.map(stage => (
          <div key={stage.key} className="rounded-xl border border-white/10 p-3" style={{ background: `${stage.colour}22` }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: stage.colour }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.colour }} />{stage.label}</div>
            <div className="mt-1 text-3xl font-bold">{stageCounts[stage.key] ?? 0}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/60">
        <div className={`grid grid-cols-[0.9fr_1.5fr_0.8fr_1.1fr_1.1fr_1.1fr_1.1fr] bg-slate-900 text-slate-400 uppercase font-semibold tracking-wide px-4 py-3 ${isFocusRegister ? "text-sm" : "text-xs"}`}>
          <span>Time</span><span>Dog / owner</span><span>Priority</span><span>Bath</span><span>Dry</span><span>Groomer</span><span>Stage</span>
        </div>
        <div ref={scrollContainerRef} className="max-h-[calc(100vh-330px)] overflow-y-auto scroll-smooth" aria-label="Auto-scrolling live appointment list">
          {registerRows.length === 0 ? (
            completedRows.length > 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center overflow-hidden p-12 text-center">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/30 motion-safe:animate-[pulse_2.8s_ease-in-out_infinite]">
                  <CheckCircle2 className="h-14 w-14" />
                </div>
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-amber-200"><Sparkles className="h-4 w-4" /> Day complete <Sparkles className="h-4 w-4" /></div>
                <h2 className="mt-3 text-4xl font-black text-white md:text-5xl">All dogs are complete</h2>
                <p className="mt-3 max-w-xl text-lg text-slate-300">A great day’s work from the Barkin Beautiful team.</p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => setShowCompleted(true)} className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20">Review completed dogs</button>
                  <button type="button" onClick={resetForTomorrow} className="rounded-lg border border-teal-300/30 bg-teal-400/10 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/20">Reset for tomorrow</button>
                </div>
              </div>
            ) : <div className="p-16 text-center text-slate-400">No dogs are currently on the workflow board.</div>
          ) : registerRows.map((appt, index) => {
            const stage = STAGES.find(item => item.key === appt.workflowState) ?? STAGES[0];
            const stageMinutes = !isInterStageWaitState(appt.workflowState) && appt.stageStartedAt ? Math.floor((now - appt.stageStartedAt) / 60000) : null;
            const alternateRow = index % 2 ? "bg-slate-800/55" : "bg-slate-950/95";
            const isPastScheduledTime = new Date(appt.scheduledStart).getTime() < now;
            const isCompletedReviewRow = appt.workflowState === "complete";
            const isLeavingRow = leavingAppointmentIds.includes(appt.id);
            return (
              <div key={appt.id} className={`grid grid-cols-[0.9fr_1.5fr_0.8fr_1.1fr_1.1fr_1.1fr_1.1fr] items-center border-b border-white/5 border-l-4 px-4 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${rowPaddingClass} ${rowTextClass} ${alternateRow} ${isCompletedReviewRow ? "opacity-65" : ""} ${isLeavingRow ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"} ${isPastScheduledTime && !isCompletedReviewRow ? "animate-[pulse_2.8s_ease-in-out_infinite] ring-1 ring-inset ring-amber-300/40" : ""}`} style={{ borderLeftColor: isCompletedReviewRow ? "#34d399" : isPastScheduledTime ? "#fbbf24" : stage.colour }}>
                <div className="font-mono text-slate-300">{new Date(appt.scheduledStart).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}</div>
                <div className="min-w-0 flex items-center gap-2.5">
                  <PetAvatar petId={appt.petId} petName={appt.petName} className={isFocusRegister ? "h-11 w-11" : "h-9 w-9"} />
                  <div className="min-w-0">
                    <div className="font-bold text-white">{appt.petName}</div>
                    <div className={`${rowDetailClass} text-slate-400`}>{appt.clientLastName}{isPastScheduledTime ? " · Past scheduled time" : ""}</div>
                    {appt.groomStyleNote && <div className={`${rowDetailClass} mt-0.5 truncate text-teal-300`} title={appt.groomStyleNote}>📝 {appt.groomStyleNote}</div>}
                  </div>
                </div>
                <div className="font-black" style={{ color: appt.bathPriority ? BATH_PRIORITY_META[appt.bathPriority as keyof typeof BATH_PRIORITY_META]?.colour : "#94a3b8" }}>{appt.bathPriority ? `#${appt.bathPriority}` : "—"}</div>
                <div className="text-slate-300">{appt.bathStaffId ? "Assigned" : "—"}</div>
                <div className="text-slate-300">{appt.dryStaffId ? "Assigned" : "—"}</div>
                <div className="font-medium text-slate-200">{appt.staffName?.split(" ")[0] ?? "—"}</div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full font-bold ${stageBadgeClass}`} style={{ background: `${stage.colour}33`, color: stage.colour }}>{stage.label}{stageMinutes !== null ? ` · ${formatDuration(stageMinutes)}` : ""}</span>
                  {isCompletedReviewRow && <button type="button" onClick={() => restoreCompletedDog(appt.id)} disabled={restoreCompletedMutation.isPending} className="rounded border border-amber-300/35 px-2 py-1 text-xs font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-50" title="Return this dog to Ready so staff can correct its workflow status">{restoreCompletedMutation.isPending ? "Restoring…" : "Undo"}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>Independent screen: controller changes do not navigate or replace this display. Completed-status recovery is available when review is open.</span>
        <button type="button" onClick={() => setShowCompleted(current => !current)} className="rounded border border-white/10 px-2 py-1 font-semibold text-slate-400 hover:bg-white/5" title="Temporarily show or hide dogs completed today">
          {showCompleted ? "Hide completed dogs" : `Review completed dogs${completedRows.length ? ` (${completedRows.length})` : ""}`}
        </button>
        <button type="button" onClick={() => setScrollSpeedIndex(index => (index + 1) % SCROLL_SPEEDS.length)} className="rounded border border-white/10 px-2 py-1 font-semibold text-slate-400 hover:bg-white/5" title="Cycle between auto-scroll Off, Slow, Normal and Fast">
          {scrollSpeed.tickMs === null ? "Auto-scroll: Off" : `Auto-scroll: ${scrollSpeed.label} · pauses ${TOP_PAUSE_MS / 1000}s top / ${BOTTOM_PAUSE_MS / 1000}s bottom`}
        </button>
        <span>Refreshes within 5 seconds while visible · Groomigo Workflow Display</span>
      </footer>
    </main>
  );
}
