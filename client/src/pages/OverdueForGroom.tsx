import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { describeOverdue, OVERDUE_BAND_LABEL, type OverdueBand } from "@shared/overdueForGroom";

/**
 * Dogs that have slipped past their own grooming rhythm.
 *
 * Sorted worst first, because the dog furthest past its own pattern is
 * the one most likely to have found another groomer. Everything about
 * who qualifies lives in shared/overdueForGroom.ts; this only renders it.
 */

const BAND_STYLE: Record<OverdueBand, string> = {
  overdue_7_13: "bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200",
  overdue_14_plus: "bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-200",
};

const formatDay = (day: string) =>
  // Rendered as the plain calendar day it is, with no zone conversion —
  // converting a date-only value can only move it.
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });

export default function OverdueForGroom() {
  const { data, isLoading, isError } = trpc.clients.overdueForGroom.useQuery({});

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Working out who is overdue…</p>;
  if (isError) return <p className="p-6 text-sm text-red-600">Could not load the overdue list.</p>;

  const pets = data?.pets ?? [];
  const counts = pets.reduce<Record<string, number>>((acc, p) => {
    acc[p.band] = (acc[p.band] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Overdue for a groom</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each dog measured against its own rhythm, not the salon average — a four-weekly
          cavoodle and a twelve-weekly labrador are both regulars. Dogs with a booking
          already in the diary never appear here.
        </p>
      </header>

      {pets.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Nobody is overdue. Every regular either came back on time or has a booking in.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(OVERDUE_BAND_LABEL) as OverdueBand[]).map((band) => (
              <Badge key={band} className={`text-xs ${BAND_STYLE[band]}`}>
                {OVERDUE_BAND_LABEL[band]}: {counts[band] ?? 0}
              </Badge>
            ))}
            {data && data.total > pets.length && (
              <Badge className="bg-muted text-xs text-muted-foreground">
                showing {pets.length} of {data.total}
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Dog</th>
                  <th className="p-3">Owner</th>
                  <th className="p-3 hidden md:table-cell">Their rhythm</th>
                  <th className="p-3 hidden sm:table-cell">Last in</th>
                  <th className="p-3 hidden lg:table-cell">Was due</th>
                  <th className="p-3">Overdue</th>
                  <th className="p-3 hidden md:table-cell">Contact</th>
                </tr>
              </thead>
              <tbody>
                {pets.map((pet) => (
                  <tr key={pet.petId} className="border-t">
                    <td className="p-3 font-medium text-slate-900 dark:text-white">
                      {pet.petName ?? `Pet ${pet.petId}`}
                      {pet.breed && (
                        <span className="block text-xs font-normal text-muted-foreground">{pet.breed}</span>
                      )}
                    </td>
                    <td className="p-3">
                      {pet.clientId ? (
                        <Link href={`/clients/${pet.clientId}`} className="text-violet-700 hover:underline dark:text-violet-300">
                          {[pet.firstName, pet.lastName].filter(Boolean).join(" ") || "Client"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">
                      every {pet.medianWeeks}w
                      {/* How many gaps that rhythm is drawn from — three is
                          a pattern, the minimum two is a hint. */}
                      <span className="block text-xs">from {pet.intervalCount} visits apart</span>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{formatDay(pet.lastVisit)}</td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground">{formatDay(pet.dueOn)}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${BAND_STYLE[pet.band as OverdueBand]}`}>
                        {describeOverdue(pet.daysOverdue)}
                      </Badge>
                    </td>
                    <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
                      {pet.phone ? <a href={`tel:${pet.phone}`} className="hover:underline">{pet.phone}</a> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
