import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Check, CreditCard, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PLAN_LABELS, type Plan } from "@shared/planEntitlements";
import { salonPlanOffer } from "@shared/salonPlanOffer";

/**
 * The salon's own subscription to Groomigo.
 *
 * The other direction of money from the Payouts card beside it, and the
 * two get confused constantly: this one is the salon paying us, on our
 * Stripe account. Payouts is their clients paying them, into their own
 * bank. The wording on both keeps them apart rather than relying on
 * somebody reading the heading carefully.
 *
 * ## No card field anywhere
 *
 * Subscribing opens Stripe Checkout and changing anything opens Stripe's
 * billing portal, both hosted. A card number never reaches this app, so
 * there is nothing here to get wrong about storing one. The design
 * proposal drew the card fields inline; that would have meant Stripe
 * Elements and a different integration from the one that is built.
 *
 * ## Who sees what
 *
 * `status` is protectedProcedure, so an owner reads it and restricted
 * staff do not. The two money procedures are adminProcedure. An owner
 * who is not an administrator therefore sees the state of their own
 * bill — including "payment failed" — and is told who can act on it,
 * rather than being shown buttons that would throw.
 */
export function SalonBillingCard() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: status, isLoading } = trpc.platformBilling.status.useQuery(undefined, {
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const startCheckout = trpc.platformBilling.startCheckout.useMutation({
    // Checkout sessions are short-lived and single-use, so the link is
    // followed immediately rather than opened in a tab where it could
    // sit until it expired. Same reasoning as the Connect onboarding link.
    onSuccess: (r) => { if (r?.url) window.location.href = r.url; },
    onError: (e) => toast.error("Could not start checkout", { description: e.message }),
  });
  const managePortal = trpc.platformBilling.managePortal.useMutation({
    onSuccess: (r) => { if (r?.url) window.location.href = r.url; },
    onError: (e) => toast.error("Could not open billing", { description: e.message }),
  });

  /*
   * Stripe sends them back to /settings?billing=started or =cancelled.
   *
   * The parameter is cleared so a reload does not re-announce it, and the
   * status is invalidated rather than assumed: `started` means they
   * finished Checkout, not that our webhook has landed yet, so the card
   * may still read "Free trial" for a moment. The copy says so instead of
   * claiming a subscription that is not recorded.
   */
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("billing");
    if (!flag) return;
    handledReturn.current = true;
    params.delete("billing");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (flag === "started") {
      toast.success("Stripe has your card", {
        description: "The subscription appears here once Stripe confirms it — usually seconds.",
      });
    } else if (flag === "cancelled") {
      toast.info("Checkout cancelled", { description: "Nothing was charged." });
    }
    void utils.platformBilling.status.invalidate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Checking your subscription…</CardContent></Card>;
  }
  // Restricted staff are rejected by protectedProcedure; they see nothing
  // rather than an error where a bill should be.
  if (!status) return null;

  return (
    <SalonBillingCardView
      status={status}
      isAdmin={isAdmin}
      startingPlan={startCheckout.isPending ? (startCheckout.variables?.plan ?? null) : null}
      managing={managePortal.isPending}
      onSubscribe={(plan) => startCheckout.mutate({ plan })}
      onManage={() => managePortal.mutate(undefined as never)}
    />
  );
}

export type SalonBillingStatus = {
  plan: string;
  status: "active" | "past_due" | "cancelled" | "trialing";
  description: string;
  hasAccess: boolean;
  billingSetUp: boolean;
  subscribed: boolean;
  purchasablePlans: readonly ("starter" | "professional" | "enterprise")[];
};

/**
 * The card itself, separated from the data so each state can be looked
 * at on its own — and tested without a tRPC provider.
 */
export function SalonBillingCardView({
  status, isAdmin, startingPlan = null, managing = false,
  onSubscribe = () => {}, onManage = () => {},
}: {
  status: SalonBillingStatus;
  isAdmin: boolean;
  startingPlan?: string | null;
  managing?: boolean;
  onSubscribe?: (plan: "starter" | "professional" | "enterprise") => void;
  onManage?: () => void;
}) {
  const busy = startingPlan !== null || managing;
  const planLabel = PLAN_LABELS[status.plan as Plan] ?? status.plan;
  const offers = status.purchasablePlans.map((plan) => salonPlanOffer(plan));

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5 text-primary" /> Your Groomigo subscription
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-sm">
        <div>
          <p className="font-semibold">{planLabel}</p>
          <p className="text-muted-foreground">{status.description}</p>
        </div>

        {status.status === "past_due" && (
          <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {/* Nothing is taken away for a failed card: a salon mid-service
                has real dogs in the building. planEntitlements says so and
                this says so too, or an owner reads "payment failed" and
                starts ringing round. */}
            <span>Nothing has been switched off. The diary, the board and your messages all keep working while this is sorted.</span>
          </p>
        )}

        {!status.hasAccess && (
          <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your subscription has ended. You can still open the diary, read your history and export
              your data &mdash; that is yours either way &mdash; but messaging, memberships and the
              workflow board are paused until a plan is active.
            </span>
          </p>
        )}

        {/* The offer, only when there is nothing running. Changing or
            cancelling an existing subscription happens in Stripe's portal,
            which is what startCheckout's own error tells you to use. */}
        {!status.subscribed && offers.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {offers.map((offer) => (
              <div key={offer.plan} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{offer.label}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {offer.includes.map((item) => (
                        <li key={item} className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> {item}
                        </li>
                      ))}
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> {offer.smsLabel}
                      </li>
                    </ul>
                  </div>
                  {isAdmin && (
                    <Button size="sm" disabled={busy} onClick={() => onSubscribe(offer.plan)}>
                      {startingPlan === offer.plan && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Choose
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {/* The price is Stripe's to state, not ours — see
                shared/salonPlanOffer.ts. Saying so beats a blank space
                where a figure should be. */}
            <p className="text-xs text-muted-foreground">
              Stripe shows you the price and the billing date before you enter a card. Nothing is
              charged until you confirm it there.
            </p>
          </div>
        )}

        {/* Groomigo has not finished setting its prices up. Not the
            salon's problem and not something they can fix, so it does not
            name an environment variable at them. */}
        {!status.subscribed && offers.length === 0 && (
          <p className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Plans are not open for self-service yet. Talk to us and we will set your subscription up
            with you.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && status.billingSetUp && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onManage}>
              {managing
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
              Manage billing
            </Button>
          )}
        </div>

        {isAdmin && status.billingSetUp && (
          <p className="text-xs text-muted-foreground">
            Cards, invoices, receipts and cancelling all live on Stripe&rsquo;s own pages. Groomigo
            never sees your card number.
          </p>
        )}

        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            An administrator has to make billing changes. You can see the state of the subscription
            here.
          </p>
        )}

        {/* The confusion worth pre-empting, in the design proposal's own
            words. Two Stripe relationships, opposite directions, and the
            salon has no reason to assume they are different. */}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">This is not where your clients&rsquo; money goes.</strong>{" "}
          Payments from clients land in your own bank, set up under Payouts in Integrations. This
          page is only your own bill for using Groomigo.
        </p>
      </CardContent>
    </Card>
  );
}

export default SalonBillingCard;
