/**
 * How many dogs there are between the salon and Christmas.
 *
 * Andy, 02/11/2026, with a screenshot of MoeGo's "498 pets to groom till
 * Thanksgiving": "add something like this for Christmas in Groomigo."
 *
 * Renders nothing outside the run-up. The server returns null from
 * 25 December until the next 1 November, so there is one place that
 * decides the season and the card simply believes it — a second copy of
 * the dates here would be the thing that drifts.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { countdownHeadline, countdownSubtitle } from "@shared/christmasCountdown";
import { trpc } from "@/lib/trpc";

export function ChristmasCountdownCard() {
  const { data } = trpc.analytics.christmasCountdown.useQuery({});
  if (!data) return null;

  return (
    <Card className="overflow-hidden border-rose-200/80 dark:border-rose-900/50 bg-gradient-to-br from-rose-50 via-white to-emerald-50 dark:from-rose-950/40 dark:via-background dark:to-emerald-950/30">
      <CardContent className="px-5 py-4">
        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-[26px] leading-none dark:bg-rose-900/40"
          >
            🎄
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-medium uppercase tracking-wide text-rose-700/90 dark:text-rose-300/90">
              Christmas countdown
            </p>
            <p className="font-display text-[26px] font-bold leading-[1.15] tabular-nums sm:text-[30px]">
              {data.remaining.toLocaleString()}{" "}
              <span className="text-[15px] font-semibold text-muted-foreground sm:text-[16px]">
                {countdownHeadline(data.remaining)}
              </span>
            </p>
            {/* The bar is decoration over a number that is already stated,
                so it is hidden from screen readers rather than read out
                as a second, vaguer version of the same thing. */}
            <div className="mt-2.5 flex items-center gap-3">
              <Progress value={data.percent} className="h-2 flex-1" aria-hidden />
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                {data.percent}%
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
              {countdownSubtitle(data)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ChristmasCountdownCard;
