import { Link } from "wouter";
import { Clock, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * How long is left of the trial, and what happened when it ran out.
 *
 * On every page rather than tucked into Settings, because the deadline
 * matters most to the person who has not gone looking for it. It renders
 * nothing at all for a salon that is exempt or paying — Barkin' Beautiful
 * must never see a word of this.
 *
 * When the trial HAS ended this banner is very nearly the whole app: the
 * server refuses the procedures behind every screen, so the pages
 * underneath will be empty. That is why the wording has to carry the full
 * explanation and say plainly that the salon's records are safe.
 */
export function TrialBanner() {
  const { data } = trpc.trial.get.useQuery(undefined, {
    // A day is the unit; polling harder than this tells nobody anything.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    // Still useful on the day the trial ends, when the answer changes
    // under a tab somebody left open overnight.
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  });

  if (!data?.show) return null;
  return <TrialBannerView ended={data.ended} daysLeft={data.daysLeft} trialDays={data.trialDays} />;
}

/**
 * The bar itself, given a state.
 *
 * Separate from the query so all three of its appearances — comfortable,
 * urgent, expired — can be looked at without arranging a salon whose trial
 * has actually run out.
 */
export function TrialBannerView({
  ended,
  daysLeft,
  trialDays,
}: {
  ended: boolean;
  daysLeft: number | null;
  trialDays: number;
}) {
  if (ended) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm"
      >
        <TriangleAlert
          className="size-4 shrink-0 text-destructive"
          aria-hidden
        />
        <span className="font-medium text-destructive">
          Your trial has ended.
        </span>
        <span className="text-muted-foreground">
          Every client, pet and appointment you entered is still here and still
          yours — choose a plan to pick up exactly where you left off.
        </span>
        <Button asChild size="sm" variant="destructive" className="ml-auto">
          <Link href="/settings">Choose a plan</Link>
        </Button>
      </div>
    );
  }

  const days = daysLeft ?? 0;
  // Three days is where "some day" becomes "this week".
  const urgent = days <= 3;

  return (
    <div
      className={
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm " +
        (urgent
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-border/80 bg-muted/40")
      }
    >
      <Clock
        className={
          "size-4 shrink-0 " +
          (urgent ? "text-amber-600" : "text-muted-foreground")
        }
        aria-hidden
      />
      <span
        className={
          urgent
            ? "font-medium text-amber-700 dark:text-amber-400"
            : "font-medium"
        }
      >
        {days === 0
          ? "Last day of your trial"
          : `${days} ${days === 1 ? "day" : "days"} left in your trial`}
      </span>
      <span className="text-muted-foreground">
        {urgent
          ? "Add a plan now and nothing stops."
          : `Your ${trialDays}-day trial of Groomigo.`}
      </span>
      <Button
        asChild
        size="sm"
        variant={urgent ? "default" : "outline"}
        className="ml-auto"
      >
        <Link href="/settings">Choose a plan</Link>
      </Button>
    </div>
  );
}
