/**
 * The Christmas countdown, with room to breathe.
 *
 * Andy, 02/11/2026: "Add it to the sidebar too." The dashboard card is
 * the glance; this is the page behind the link, for when somebody
 * actually wants to look at it.
 *
 * Out of season the sidebar link is gone, but the route stays
 * reachable — a bookmark or a stale tab lands on an explanation
 * rather than a blank page.
 */
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { COUNTDOWN_IMAGE, countdownHeadline, countdownSubtitle } from "@shared/christmasCountdown";
import { trpc } from "@/lib/trpc";

export default function ChristmasCountdown() {
  const { data, isLoading } = trpc.analytics.christmasCountdown.useQuery({});

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        {isLoading ? null : !data ? (
          <Card>
            <CardContent className="px-6 py-10 text-center">
              <p className="text-[32px] leading-none" aria-hidden>🎄</p>
              <p className="mt-3 font-display text-lg font-semibold">Not yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The countdown runs from 1 November to Christmas Eve.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-rose-200/80 dark:border-rose-900/50 bg-gradient-to-br from-rose-50 via-white to-emerald-50 dark:from-rose-950/40 dark:via-background dark:to-emerald-950/30">
            <CardContent className="px-6 py-10 text-center sm:py-14">
              {/* The picture is the feature's face, the way MoeGo's
                  illustration is theirs. Decorative, so alt="" — the
                  count below is the content. Square source in a square
                  box crops nothing, which is why it is not a banner:
                  a 16/9 crop of this photo loses either the antlers or
                  the dog. */}
              <img
                src={COUNTDOWN_IMAGE}
                alt=""
                aria-hidden
                width={320}
                height={320}
                className="mx-auto aspect-square w-full max-w-[280px] rounded-3xl object-cover shadow-sm ring-1 ring-rose-200/80 dark:ring-rose-900/50 sm:max-w-[320px]"
              />
              <p className="mt-6 font-display text-[64px] font-bold leading-[0.95] tabular-nums sm:text-[88px]">
                {data.remaining.toLocaleString()}
              </p>
              <p className="mt-1 text-base font-semibold text-muted-foreground sm:text-lg">
                {countdownHeadline(data.remaining)}
              </p>
              <div className="mx-auto mt-7 flex max-w-sm items-center gap-3">
                {/* Decoration over a number already stated above, so it is
                    not read out as a second, vaguer version of it. */}
                <Progress value={data.percent} className="h-2.5 flex-1" aria-hidden />
                <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                  {data.percent}%
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{countdownSubtitle(data)}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
