import { CalendarDays, Dog, PawPrint, Scissors } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { splitAppointmentsByTime } from "@shared/appointmentHistorySplit";
import { getActiveTimeZone } from "@/lib/timezone";

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
    { tenantId: 1, clientId: clientId ?? 0 },
    { enabled: !!clientId },
  );
  const { data: stats } = trpc.clients.messageContext.useQuery(
    { tenantId: 1, clientId: clientId ?? 0 },
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

  const { upcoming, past } = splitAppointmentsByTime(data ?? [], new Date());
  const next = upcoming[0];
  const last = past[0];
  const petNames = Array.from(new Set((data ?? []).map((a) => a.petName).filter(Boolean)));

  const when = (value: Date | string | number) =>
    new Date(value as string).toLocaleString("en-AU", {
      timeZone: getActiveTimeZone(),
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
        {upcoming.length} upcoming · {past.length} past
      </p>
    </div>
  );
}
