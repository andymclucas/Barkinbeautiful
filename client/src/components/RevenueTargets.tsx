import { useMemo, useState } from "react";
import { Target, TrendingUp, TrendingDown, Minus, Lock, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TARGET_PERIODS, TARGET_PERIOD_LABELS, rangeForPeriod, brisbaneToday,
  type TargetPeriod,
} from "@shared/revenueTargets";
import { SIZE_BAND_IDS, sizeBandLabel, type DogSizeBand } from "@shared/dogSizeBand";

/**
 * The size mix behind a number.
 *
 * Revenue alone says two groomers had a similar week; it does not say one
 * of them spent it on giants. Shown as a stacked bar rather than six
 * numbers, because the shape is the point — a bar leaning right is a week
 * of big dogs.
 */
const BAND_SHADE: Record<DogSizeBand, string> = {
  small: "bg-violet-200 dark:bg-violet-900",
  small_medium: "bg-violet-300 dark:bg-violet-800",
  medium: "bg-violet-400 dark:bg-violet-700",
  large: "bg-violet-500 dark:bg-violet-600",
  extra_large: "bg-violet-600 dark:bg-violet-500",
  giant: "bg-violet-700 dark:bg-violet-400",
};

function SizeMix({ mix, unbanded, dogs }: {
  mix: Partial<Record<DogSizeBand, number>>;
  unbanded: number;
  dogs: number;
}) {
  if (dogs === 0) return null;
  const parts = SIZE_BAND_IDS
    .map((band) => ({ band, n: mix[band] ?? 0 }))
    .filter((p) => p.n > 0);
  const title = [
    ...parts.map((p) => `${p.n} ${sizeBandLabel(p.band)}`),
    unbanded > 0 ? `${unbanded} with no size recorded` : null,
  ].filter(Boolean).join(", ");

  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className="flex h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        {parts.map((p) => (
          <span key={p.band} className={BAND_SHADE[p.band]} style={{ width: `${(p.n / dogs) * 100}%` }} />
        ))}
        {unbanded > 0 && (
          <span className="bg-muted-foreground/25" style={{ width: `${(unbanded / dogs) * 100}%` }} />
        )}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{dogs} dogs</span>
    </span>
  );
}

/**
 * What each groomer is expected to bring in, against what they have.
 *
 * Owner-only — the server refuses this data to anyone else, and the caller
 * is responsible for not rendering it. Both, deliberately: the gate that
 * matters is the server one, and hiding the card as well means nobody has
 * to see a permission error to learn the figures exist.
 *
 * The comparison is period-TO-DATE on both sides. A whole month's target
 * against three weeks of takings would show everyone behind until the last
 * day of the month, so the target is scaled to the same number of days the
 * revenue was earned over.
 */
const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export function RevenueTargets() {
  /**
   * null means "each person over their own target period", which is the
   * default and the honest one: a monthly target runs from the first of
   * the month and does not go back to zero until the month does. The old
   * default was a single daily window for everybody, so every target
   * appeared to reset at breakfast whatever period it was set for.
   */
  const [period, setPeriod] = useState<TargetPeriod | null>(null);
  const today = brisbaneToday();
  const range = useMemo(
    () => (period === null ? null : rangeForPeriod(period, today)),
    [period, today],
  );

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.revenueTargets.list.useQuery(
    range ? { from: range.from, to: range.to } : {},
    { staleTime: 60 * 1000, refetchOnWindowFocus: true },
  );

  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [storedPeriod, setStoredPeriod] = useState<TargetPeriod>("weekly");

  const save = trpc.revenueTargets.set.useMutation({
    onSuccess: () => {
      toast.success("Target saved");
      utils.revenueTargets.list.invalidate();
      setEditing(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const openEdit = (row: { id: number; name: string; storedTarget: string | null; storedPeriod: TargetPeriod }) => {
    setEditing({ id: row.id, name: row.name });
    setAmount(row.storedTarget ?? "");
    setStoredPeriod(row.storedPeriod);
  };

  const rows = data?.staff ?? [];
  const withTargets = rows.filter((r) => r.storedTarget !== null);
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0);
  const totalTarget = rows.reduce((sum, r) => sum + (r.target ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Revenue targets
            <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
              <Lock className="h-3 w-3" /> Owner only
            </span>
          </CardTitle>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setPeriod(null)}
              title="Measure everyone over their own target period"
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                (period === null
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Each target
            </button>
            {TARGET_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                  (period === p
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {TARGET_PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {range === null
            ? "Each person measured over their own target period, to date"
            : range.from === range.to
              ? `Today, ${range.to}`
              : `${range.from} to ${range.to}`}
          {totalTarget > 0 && (
            <> · salon {money(totalActual)} of {money(totalTarget)}</>
          )}
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No active staff.</p>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: row.colourHex ?? "#6366f1" }}
                  aria-hidden
                />
                <span className="min-w-0 basis-full truncate text-sm font-medium sm:basis-0 sm:flex-1">{row.name}</span>

                {range === null && row.storedTarget !== null && (
                  <span
                    className="text-[11px] text-muted-foreground"
                    title={`${row.window.from} to ${row.window.to}`}
                  >
                    {TARGET_PERIOD_LABELS[row.storedPeriod].toLowerCase()}, day {row.window.days}
                  </span>
                )}

                <SizeMix mix={row.sizeMix} unbanded={row.unbandedDogs} dogs={row.dogs} />

                <span className="text-sm tabular-nums">{money(row.actual)}</span>

                {row.target === null ? (
                  <span className="text-xs text-muted-foreground">no target</span>
                ) : (
                  <>
                    <span
                      className="text-xs text-muted-foreground tabular-nums"
                      title={
                        row.weightedTarget
                          ? `Set at ${money(row.weightedTarget.flat)} for this period. ${row.difficultyNote ?? ""}`
                          : undefined
                      }
                    >
                      of {money(row.target)}
                      {row.weightedTarget && row.weightedTarget.difficulty !== 1 && (
                        <span className={row.weightedTarget.difficulty < 1 ? "ml-1 text-violet-600 dark:text-violet-400" : "ml-1 text-sky-600 dark:text-sky-400"}>
                          ({row.weightedTarget.difficulty < 1 ? "↓" : "↑"} size)
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums " +
                        (row.status === "ahead"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : row.status === "behind"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-muted text-muted-foreground")
                      }
                    >
                      {row.status === "ahead" ? <TrendingUp className="h-3 w-3" />
                        : row.status === "behind" ? <TrendingDown className="h-3 w-3" />
                          : <Minus className="h-3 w-3" />}
                      {row.difference !== null && row.difference >= 0 ? "+" : ""}
                      {row.difference !== null ? money(row.difference) : ""}
                    </span>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-3 w-3" />
                  {row.storedTarget === null ? "Set" : "Edit"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!isLoading && rows.some((r) => r.dogs > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-muted-foreground">
            <span>Size mix:</span>
            {SIZE_BAND_IDS.map((band) => (
              <span key={band} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${BAND_SHADE[band]}`} aria-hidden />
                {sizeBandLabel(band)}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-muted-foreground/25" aria-hidden /> no size recorded
            </span>
          </div>
        )}

        {!isLoading && rows.some((r) => r.weightedTarget && r.weightedTarget.difficulty !== 1) && (
          <p className="pt-2 text-[11px] text-muted-foreground">
            Targets marked ↓ or ↑ have been moved for the size of dogs that person was given. A
            giant takes three times a small's chair time and earns about half as much an hour, so
            a heavy book is measured against a lower figure. Hover a target to see what it was set
            at and why it moved.
          </p>
        )}

        {!isLoading && rows.length > 0 && withTargets.length < rows.length && (
          <p className="pt-3 text-xs text-muted-foreground">
            {rows.length - withTargets.length} of {rows.length} have no target set. Someone with no
            target is left out of the salon total rather than counted as zero.
          </p>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Revenue target — {editing?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="target-amount">
                Amount ($)
              </label>
              <Input
                id="target-amount"
                inputMode="decimal"
                placeholder="e.g. 2000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Per</label>
              <Select value={storedPeriod} onValueChange={(v) => setStoredPeriod(v as TargetPeriod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>{TARGET_PERIOD_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              One figure is stored per person. The Day, Week, Month and Quarter views above are
              scaled from it, so you only ever keep this one up to date.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() => editing && save.mutate({ staffId: editing.id, amount: null, period: storedPeriod })}
            >
              Clear target
            </Button>
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => {
                if (!editing) return;
                const parsed = Number(amount.replace(/[$,\s]/g, ""));
                if (!Number.isFinite(parsed) || parsed < 0) {
                  toast.error("Enter an amount like 2000");
                  return;
                }
                save.mutate({ staffId: editing.id, amount: parsed, period: storedPeriod });
              }}
            >
              {save.isPending ? "Saving…" : "Save target"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * One staff member's target against what they actually brought in, for the
 * staff profile panel.
 *
 * Reuses revenueTargets.list rather than adding a per-staff endpoint, so
 * there is exactly one owner-gated door to this data and no second place to
 * get the permission wrong. The caller must not render it for anyone else —
 * the server refuses them regardless, but a permission error is a poor way
 * to learn the figures exist.
 *
 * The date range is the profile panel's own, so the money and the timing
 * analytics above it describe the same days.
 */
export function StaffRevenueTarget({ staffId, from, to }: { staffId: number; from: string; to: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.revenueTargets.list.useQuery(
    { from, to },
    { staleTime: 60 * 1000, retry: false },
  );
  const row = data?.staff.find((s) => s.id === staffId);

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [storedPeriod, setStoredPeriod] = useState<TargetPeriod>("weekly");

  const save = trpc.revenueTargets.set.useMutation({
    onSuccess: () => {
      toast.success("Target saved");
      utils.revenueTargets.list.invalidate();
      setEditing(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !row) return null;

  const open = () => {
    setAmount(row.storedTarget ?? "");
    setStoredPeriod(row.storedPeriod);
    setEditing(true);
  };

  return (
    <section className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-4 dark:border-violet-950/50 dark:from-violet-950/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-violet-950 dark:text-violet-100">
            <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" /> Revenue
            <span className="flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-normal text-violet-800 dark:bg-violet-900/60 dark:text-violet-200">
              <Lock className="h-3 w-3" /> Owner only
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-violet-800 dark:text-violet-300">
            {from} to {to} — the same days as the timing above. The target is scaled to match.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 bg-card text-xs" onClick={open}>
          <Pencil className="h-3 w-3" /> {row.storedTarget === null ? "Set target" : "Edit target"}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Brought in" value={money(row.actual)} />
        <Figure
          label={row.weightedTarget && row.weightedTarget.difficulty !== 1 ? "Target (for this book)" : "Target"}
          value={row.target === null ? "—" : money(row.target)}
        />
        <Figure
          label={row.difference !== null && row.difference < 0 ? "Short by" : "Ahead by"}
          value={row.difference === null ? "—" : money(Math.abs(row.difference))}
          tone={row.status === "ahead" ? "good" : row.status === "behind" ? "warn" : "flat"}
        />
        <Figure label="Dogs" value={String(row.dogs)} />
      </div>

      {row.dogs > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-violet-800 dark:text-violet-300">Size mix</span>
          <SizeMix mix={row.sizeMix} unbanded={row.unbandedDogs} dogs={row.dogs} />
        </div>
      )}

      {row.storedTarget !== null && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Target set as {money(Number(row.storedTarget))} per {TARGET_PERIOD_LABELS[row.storedPeriod].toLowerCase()}
          {row.weightedTarget && row.weightedTarget.difficulty !== 1 && (
            <> — {money(row.weightedTarget.flat)} for these days, {row.difficultyNote?.toLowerCase()}</>
          )}
          {row.weightedTarget && row.weightedTarget.difficulty === 1 && <>.</>}
          {!row.weightedTarget && <>.</>}
        </p>
      )}

      <Dialog open={editing} onOpenChange={(value) => { if (!value) setEditing(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Revenue target — {row.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`bio-target-${staffId}`}>Amount ($)</label>
              <Input id={`bio-target-${staffId}`} inputMode="decimal" placeholder="e.g. 2000"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Per</label>
              <Select value={storedPeriod} onValueChange={(v) => setStoredPeriod(v as TargetPeriod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_PERIODS.map((p) => <SelectItem key={p} value={p}>{TARGET_PERIOD_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" disabled={save.isPending}
              onClick={() => save.mutate({ staffId, amount: null, period: storedPeriod })}>
              Clear target
            </Button>
            <Button size="sm" disabled={save.isPending} onClick={() => {
              const parsed = Number(amount.replace(/[$,\s]/g, ""));
              if (!Number.isFinite(parsed) || parsed < 0) { toast.error("Enter an amount like 2000"); return; }
              save.mutate({ staffId, amount: parsed, period: storedPeriod });
            }}>
              {save.isPending ? "Saving…" : "Save target"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Figure({ label, value, tone = "flat" }: { label: string; value: string; tone?: "good" | "warn" | "flat" }) {
  return (
    <div className="rounded-lg border bg-card/70 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={
        "text-sm font-bold tabular-nums " +
        (tone === "good" ? "text-emerald-700 dark:text-emerald-300"
          : tone === "warn" ? "text-amber-700 dark:text-amber-300" : "")
      }>{value}</p>
    </div>
  );
}
