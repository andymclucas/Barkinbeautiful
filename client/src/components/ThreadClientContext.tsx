import { CalendarDays, Dog, PawPrint, Scissors } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { clientVisitDates, BRISBANE_TIME_ZONE, brisbaneDayOf, isVisit } from "@shared/clientVisitDates";

/**
 * Who is texting, beside their conversation.
 *
 * A client writes "I'm on my way, sorry I lost track of time" and the
 * person reading it has no idea which dog, what time, or whether they are
 * even booked today — they had to leave Messages, search the client, read
 * the calendar, and come back. This puts the answer next to the question.
 *
 * Deliberately read-only. Messages is for replying; acting on the booking
 * belongs on the calendar, and a reschedule button here would be a second
 * path to the same thing with none of the conflict checks.
 */
function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tone === "warn" ? "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30" : "bg-card"}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone === "warn" ? "text-amber-800 dark:text-amber-300" : ""}`}>{value}</p>
    </div>
  );
}

export function ThreadClientContext({ clientId }: { clientId: number | null }) {
  const { data, isLoading } = trpc.calendar.appointmentsForClient.useQuery(
    { clientId: clientId ?? 0 },
    { enabled: !!clientId },
  );
  const { data: stats } = trpc.clients.messageContext.useQuery(
    { clientId: clientId ?? 0 },
    { enabled: !!clientId },
  );

  if (!clientId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-xs text-muted-foreground">
          This number isn&rsquo;t linked to a client, so there&rsquo;s nothing to show.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="space-y-2 p-4">{[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  // Last / Today / Next by Brisbane calendar day (shared/clientVisitDates.ts):
  // today's appointment is "today" until the day passes (Andy, 11/11/2026).
  const { last, today, next } = clientVisitDates(data ?? []);
  // Same Brisbane-day line for the counts: today and later is upcoming.
  const todayKey = brisbaneDayOf(new Date());
  const visits = (data ?? []).filter(isVisit);
  const upcomingCount = visits.filter((a) => brisbaneDayOf(a.scheduledStart) >= todayKey).length;
  const pastCount = visits.length - upcomingCount;
  const petNames = Array.from(new Set((data ?? []).map((a) => a.petName).filter(Boolean)));

  const when = (value: Date | string | number) =>
    new Date(value as string).toLocaleString("en-AU", {
      timeZone: BRISBANE_TIME_ZONE,
      weekday: "short", day: "numeric", month: "short",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

  return (
    <div className="space-y-4 p-4 text-sm">
      {stats && (
        <section className="grid grid-cols-2 gap-2">
          <Stat label="Upcoming" value={String(stats.upcoming)} />
          <Stat label="Finished" value={String(stats.finished)} />
          <Stat label="Cancelled" value={String(stats.cancelled)} />
          <Stat label="No-show" value={String(stats.noShow)} />
          <Stat label="Total paid" value={`$${stats.totalPaid.toFixed(2)}`} />
          <Stat
            label="Unpaid"
            value={`$${stats.outstanding.toFixed(2)}`}
            tone={stats.outstanding > 0 ? "warn" : undefined}
          />
        </section>
      )}

      {today.length > 0 && (
        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <CalendarDays className="h-3.5 w-3.5" /> Today
          </h4>
          {today.map((t, i) => (
            <div key={i} className="mb-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="font-medium">{when(t.scheduledStart)}</p>
              <p className="text-xs text-muted-foreground">
                {t.petName ?? "Pet"}{t.staffName ? ` · ${t.staffName}` : ""}
              </p>
            </div>
          ))}
        </section>
      )}

      <section>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> Next visit
        </h4>
        {next ? (
          <div className="rounded-lg border bg-card p-2.5">
            <p className="font-medium">{when(next.scheduledStart)}</p>
            <p className="text-xs text-muted-foreground">
              {next.petName ?? "Pet"}{next.staffName ? ` · ${next.staffName}` : ""}
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-2.5 py-3 text-center text-xs text-muted-foreground">
            Nothing booked
          </p>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Scissors className="h-3.5 w-3.5" /> Last visit
        </h4>
        {last ? (
          <div className="rounded-lg border bg-card p-2.5">
            <p className="font-medium">{when(last.scheduledStart)}</p>
            <p className="text-xs text-muted-foreground">{last.petName ?? "Pet"}</p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-2.5 py-3 text-center text-xs text-muted-foreground">
            No previous visits
          </p>
        )}
      </section>

      {petNames.length > 0 && (
        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Dog className="h-3.5 w-3.5" /> Dogs
          </h4>
          <div className="flex flex-wrap gap-1">
            {petNames.map((name) => (
              <span key={name} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                <PawPrint className="h-3 w-3" />{name}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="border-t pt-3 text-[11px] text-muted-foreground">
        {upcomingCount} upcoming · {pastCount} past
      </p>
    </div>
  );
}
