import { MessageSquare, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

/**
 * How many texts the salon has sent this month, against what it is allowed.
 *
 * SMS is the one cost that scales with the salon's own behaviour, so the
 * salon is the only party who can do anything about it — which means the
 * number belongs where they will see it rather than on an invoice four
 * weeks later.
 *
 * Shown to everyone who can send a text, not just owners: a groomer about
 * to send a pickup message should be able to see the salon is near its
 * cap. It exposes counts, never message content.
 */
export function SmsUsageCard() {
  const { data } = trpc.smsUsage.get.useQuery({}, {
    // Moves whenever anyone texts a client, and is watched precisely when
    // somebody is wondering whether they are close to the limit.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  if (!data) return null;

  const { sent, quota, remaining, percentUsed, state } = data;
  const month = new Date().toLocaleDateString("en-AU", {
    timeZone: "Australia/Brisbane", month: "long",
  });

  // An unmetered salon still sees the count — it is useful to know — but
  // no bar, no limit and no warning, because none of those are true.
  if (state === "unlimited") {
    return (
      <Card>
        <CardHeader className="px-4 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-primary" /> Texts this month
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-sm">
          <p><span className="text-2xl font-semibold tabular-nums">{sent}</span> sent in {month}.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This salon has no monthly limit, so nothing here is capped.
          </p>
        </CardContent>
      </Card>
    );
  }

  const over = state === "exceeded";
  const near = state === "approaching";
  const barColour = over ? "bg-destructive" : near ? "bg-amber-500" : "bg-primary";
  const width = Math.min(100, percentUsed ?? 0);

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-5 w-5 text-primary" /> Texts this month
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <p>
            <span className="text-2xl font-semibold tabular-nums">{sent}</span>
            <span className="text-muted-foreground"> of {quota} in {month}</span>
          </p>
          <span className={`text-xs font-medium tabular-nums ${over ? "text-destructive" : near ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
            {percentUsed}%
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full transition-all ${barColour}`} style={{ width: `${width}%` }} />
        </div>

        {over ? (
          <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              You have gone past this month&rsquo;s {quota} included texts. Messages are still being sent
              &mdash; nobody is cut off mid-service &mdash; and the extra will appear on your next invoice.
            </span>
          </p>
        ) : near ? (
          <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{remaining} texts left of this month&rsquo;s {quota}. Going over does not stop anything; the extra is billed.</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {remaining} left. The count resets at the start of each month.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default SmsUsageCard;
