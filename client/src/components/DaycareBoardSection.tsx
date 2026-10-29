import { Sun, LogIn, LogOut, AlertTriangle } from "lucide-react";
import { fmtTime } from "@/components/WorkflowBoardTable";
import { PetCodeChips } from "@/components/PetCodeChips";
import { daycarePresence, daycareTimes, overdueForCollection } from "@shared/daycareBoard";

/**
 * Day care, below the grooming board and deliberately unlike it.
 *
 * A day care dog is not moving through a pipeline. It arrives, it is
 * here, it goes home. Andy, 28/10/2026: a section "that doesn't have
 * moveable grooming cycle sections and just has a time in and time out
 * based on the appt terms". So there are no stage controls here at
 * all — two buttons, In and Out, and the times.
 *
 * Those two buttons write the same `checked_in` and `complete` states
 * grooming uses, because for a day care dog that is precisely what
 * arriving and leaving mean. What is missing is the ten states in
 * between, which a day care dog would never pass through and which
 * made the grooming board the wrong shape for them.
 */
export type DaycareRow = {
  id: number;
  petName: string | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  petMoegoCodeLabels?: string | null;
  serviceType?: string | null;
  workflowState?: string | null;
  status?: string | null;
  scheduledStart: Date | string | number;
  scheduledEnd: Date | string | number;
  /** Epoch milliseconds from the board query, not a Date. */
  checkedInAt?: Date | string | number | null;
  notes?: string | null;
};

export function DaycareBoardSection({
  rows,
  now,
  onArrive,
  onCollect,
  busy = false,
}: {
  rows: DaycareRow[];
  now: number;
  onArrive: (id: number) => void;
  onCollect: (id: number) => void;
  busy?: boolean;
}) {
  // Nothing on the wall when nobody is booked in. The grooming board
  // is long enough without an empty heading under it.
  if (rows.length === 0) return null;

  const at = new Date(now);
  const stillHere = rows.filter((r) => daycarePresence(r) === "here").length;
  const late = rows.filter((r) => overdueForCollection(r, at)).length;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Sun className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Day care</h2>
        <span className="text-xs text-muted-foreground">
          {stillHere} here &middot; {rows.length} booked today
        </span>
        {late > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertTriangle className="h-3 w-3" />
            {late} past collection time
          </span>
        )}
      </header>

      <div className="space-y-1.5">
        {rows.map((row) => {
          const presence = daycarePresence(row);
          const times = daycareTimes(row);
          const isLate = overdueForCollection(row, at);
          const client = [row.clientFirstName, row.clientLastName].filter(Boolean).join(" ").trim();

          return (
            <div
              key={row.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 ${
                isLate
                  ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
                  : presence === "gone"
                    ? "opacity-60"
                    : ""
              }`}
            >
              <div className="min-w-[8rem] flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{row.petName ?? "Dog"}</span>
                  {presence === "here" && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      here
                    </span>
                  )}
                  {presence === "gone" && (
                    <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      gone home
                    </span>
                  )}
                  {presence === "cancelled" && (
                    <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      cancelled
                    </span>
                  )}
                </div>
                {client && <p className="text-xs text-muted-foreground">{client}</p>}
                <PetCodeChips codes={row.petMoegoCodeLabels} size="xs" className="mt-0.5" />
              </div>

              {/* The BOOKED window, both ends. That is what the owner
                  agreed to and what the floor plans around. Putting the
                  real arrival in "In" made Lola and Ollie read as
                  "In 12:16 pm · Out 11:00 am" — out before in — so the
                  arrival now sits beside the booking instead of
                  replacing it, and only when it differs. */}
              <div className="flex items-center gap-4 text-xs tabular-nums">
                <span className="flex items-center gap-1">
                  <LogIn className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">In</span>
                  <span className="font-semibold">{fmtTime(times.in)}</span>
                  {times.arrivedLate && times.arrivedAt && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300">
                      arrived {fmtTime(times.arrivedAt)}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <LogOut className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Out</span>
                  <span className={`font-semibold ${isLate ? "text-amber-700 dark:text-amber-300" : ""}`}>
                    {fmtTime(times.out)}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-1">
                {presence === "expected" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onArrive(row.id)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    Arrived
                  </button>
                )}
                {presence === "here" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCollect(row.id)}
                    className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    Collected
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
