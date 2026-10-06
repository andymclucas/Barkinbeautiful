import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Banknote, ExternalLink, Loader2, RotateCcw, TriangleAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { describeFeeBps, MAX_PLATFORM_FEE_BPS } from "@shared/stripeConnect";

/**
 * Connecting the salon's own Stripe account.
 *
 * Every payment currently runs through one platform key, so a client
 * paying their groomer is paying Groomigo. Connecting puts the money in
 * the salon's own bank instead, and charges go directly on their account
 * — it never touches Groomigo's balance.
 *
 * Four states, because they need four different things from the person
 * reading: start, finish, wait, or nothing at all. The language avoids
 * "Connect account" and "capabilities" — a salon owner should not have to
 * learn Stripe's vocabulary to get paid.
 */
export function StripeConnectCard() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.stripeConnect.status.useQuery(undefined, {
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const [feeInput, setFeeInput] = useState("");
  const handledReturn = useRef(false);

  const refresh = trpc.stripeConnect.refresh.useMutation({
    onSuccess: () => { void utils.stripeConnect.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const startOnboarding = trpc.stripeConnect.startOnboarding.useMutation({
    // Stripe's onboarding link is one-time and short-lived, so it is
    // followed immediately rather than stored or opened in a new tab,
    // where it could sit unused until it expired.
    onSuccess: (r) => { if (r?.url) window.location.href = r.url; },
    onError: (e) => toast.error("Could not start Stripe setup", { description: e.message }),
  });
  const dashboardLink = trpc.stripeConnect.dashboardLink.useMutation({
    onSuccess: (r) => { if (r?.url) window.open(r.url, "_blank", "noopener"); },
    onError: (e) => toast.error(e.message),
  });
  const setFee = trpc.stripeConnect.setPlatformFee.useMutation({
    onSuccess: (r) => { toast.success(`Platform fee set to ${r.feeLabel}`); void utils.stripeConnect.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Stripe sends them back here when they finish or when the link expired.
  // Ask Stripe what actually happened rather than assuming success, and
  // clear the parameter so a reload does not re-run it.
  useEffect(() => {
    if (handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("stripe_connect");
    if (!flag) return;
    handledReturn.current = true;
    params.delete("stripe_connect");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (flag === "refresh") {
      toast.info("That Stripe link had expired", { description: "Start again and it will pick up where you left off." });
    }
    refresh.mutate(undefined as never);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Checking Stripe…</CardContent></Card>;
  }
  // The query is admin-only; a non-admin simply sees nothing here.
  if (!status) return null;

  const busy = startOnboarding.isPending || refresh.isPending || dashboardLink.isPending;

  return (
    <StripeConnectCardView
      status={status}
      busy={busy}
      feeInput={feeInput}
      setFeeInput={setFeeInput}
      onStart={() => startOnboarding.mutate(undefined as never)}
      onDashboard={() => dashboardLink.mutate(undefined as never)}
      onRefresh={() => refresh.mutate(undefined as never)}
      refreshing={refresh.isPending}
      starting={startOnboarding.isPending}
      savingFee={setFee.isPending}
      onSaveFee={(bps) => { setFee.mutate({ feeBps: bps }); setFeeInput(""); }}
    />
  );
}

/**
 * The card itself, separated from the data so each state can be looked at.
 *
 * Four states need four different things from the person reading: start,
 * finish, wait, or nothing at all.
 */
export function StripeConnectCardView({
  status, busy, feeInput = "", setFeeInput = () => {}, onStart = () => {}, onDashboard = () => {},
  onRefresh = () => {}, refreshing = false, starting = false, savingFee = false, onSaveFee = () => {},
}: {
  status: {
    state: "not_started" | "onboarding" | "restricted" | "ready";
    accountId: string | null; chargesEnabled: boolean; payoutsEnabled: boolean;
    detailsSubmitted: boolean; requirementsDue: string[]; platformFeeBps: number | null;
    description: string; feeLabel: string;
  };
  busy: boolean;
  feeInput?: string; setFeeInput?: (v: string) => void;
  onStart?: () => void; onDashboard?: () => void; onRefresh?: () => void;
  refreshing?: boolean; starting?: boolean; savingFee?: boolean;
  onSaveFee?: (bps: number | null) => void;
}) {
  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-5 w-5 text-primary" /> Payouts to your bank
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-sm">
        <p className="text-muted-foreground">{status.description}</p>

        {status.state === "ready" && (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              Client payments go straight to your account.
              {!status.payoutsEnabled && " Stripe is still reviewing your payouts, so money may sit with them for a few days — you can take payments in the meantime."}
            </span>
          </p>
        )}

        {status.state === "restricted" && (
          <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="flex gap-2">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Stripe needs more before payments can be taken. Until then they go through Groomigo as before, so nothing is interrupted.</span>
            </p>
            {status.requirementsDue.length > 0 && (
              <ul className="ml-5 list-disc opacity-90">
                {status.requirementsDue.slice(0, 6).map(r => (
                  // Stripe's own identifiers, tidied into something readable.
                  <li key={r}>{r.replace(/_/g, " ").replace(/\./g, " → ")}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(status.state === "not_started" || status.state === "onboarding" || status.state === "restricted") && (
            <Button size="sm" disabled={busy} onClick={onStart}>
              {starting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {status.state === "not_started" ? "Connect payouts" : "Continue with Stripe"}
            </Button>
          )}
          {status.accountId && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onDashboard}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open Stripe
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRefresh}>
            <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Re-check
          </Button>
        </div>

        {status.state === "not_started" && (
          <p className="text-xs text-muted-foreground">
            Stripe asks for your bank details and some identification. It takes about five minutes and
            happens on Stripe&rsquo;s own site &mdash; Groomigo never sees your banking details.
          </p>
        )}

        {/* Groomigo's cut. Shown even at "not set", because an owner
            deciding whether to connect should be able to see there is no
            hidden percentage waiting for them. */}
        <div className="space-y-1.5 border-t pt-3">
          <Label className="text-xs">Groomigo&rsquo;s share of each client payment</Label>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-28 text-xs" inputMode="decimal" placeholder={describeFeeBps(status.platformFeeBps)}
              value={feeInput} onChange={e => setFeeInput(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">%</span>
            <Button
              size="sm" variant="outline" disabled={savingFee}
              onClick={() => {
                const trimmed = feeInput.trim();
                if (trimmed === "") { onSaveFee(null); return; }
                const percent = Number(trimmed);
                if (!Number.isFinite(percent) || percent < 0) { toast.error("Enter a percentage, or leave it empty for none"); return; }
                // Stored in basis points — 2.5% is 250 — so a slipped
                // decimal cannot become a hundredfold overcharge.
                const bps = Math.round(percent * 100);
                if (bps > MAX_PLATFORM_FEE_BPS) { toast.error(`That is above the ${MAX_PLATFORM_FEE_BPS / 100}% limit`); return; }
                onSaveFee(bps);
              }}
            >Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently <strong>{status.feeLabel}</strong>. Leave the box empty and press Save to clear it.
            Nothing is taken while this is unset.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default StripeConnectCard;
