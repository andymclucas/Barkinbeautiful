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
  const [period, setPeriod] = useState<TargetPeriod>("daily");
  const today = brisbaneToday();
  const range = useMemo(() => rangeForPeriod(period, today), [period, today]);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.revenueTargets.list.useQuery(
    { from: range.from, to: range.to },
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
          {range.from === range.to
            ? `Today, ${range.to}`
            : `${range.from} to ${range.to} — ${data?.days ?? 0} days so far`}
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

                <span className="text-sm tabular-nums">{money(row.actual)}</span>

                {row.target === null ? (
                  <span className="text-xs text-muted-foreground">no target</span>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      of {money(row.target)}
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
