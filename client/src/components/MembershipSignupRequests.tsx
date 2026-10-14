import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CalendarClock, CreditCard, Dog, Phone } from "lucide-react";
import { toast } from "sonner";

/**
 * Memberships clients have asked for, waiting on somebody.
 *
 * This is the whole point of making sign-up a request rather than a
 * purchase, so the screen shows the three things a decision turns on and
 * does not make anyone go looking for them:
 *
 *   the weight the CLIENT typed, beside the dog's name, because "Rosie,
 *   Mastiff X, 10 kg" is wrong in a way no validation rule can see;
 *   whether a card is actually on file, because approving without one
 *   creates a membership that cannot bill;
 *   the real dates, planned against the diary as it is right now, with
 *   the moved ones called out.
 */

const brisbane = (value: string | number | Date) =>
  new Date(value).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane",
  });

const brisbaneDay = (value: string | number | Date) =>
  new Date(value).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane",
  });

function RequestCard({ request, onDecided }: { request: any; onDecided: () => void }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const preview = trpc.membershipSignup.previewSeries.useQuery({ requestId: request.id });

  const approve = trpc.membershipSignup.approve.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.visitsBooked} visits booked for ${request.clientName}`);
      if (result.billingProblems?.length) {
        toast.error("The memberships and appointments are in, but billing did not start. Check Memberships.");
      }
      onDecided();
    },
    onError: (error) => toast.error(error.message),
  });
  const decline = trpc.membershipSignup.decline.useMutation({
    onSuccess: () => { toast.success("Request declined"); onDecided(); },
    onError: (error) => toast.error(error.message),
  });

  const plan = preview.data?.plan;
  const moved = plan?.occurrences.filter((o: any) => o.start && (o.shiftedDays !== 0 || o.shiftedMinutes !== 0)) ?? [];
  const unplaced = plan?.occurrences.filter((o: any) => !o.start) ?? [];
  const priceChanged = preview.data?.priceChanged ?? null;
  const catalogueProblems = preview.data?.catalogueProblems ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{request.clientName}</CardTitle>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{request.clientPhone}</span>
              <span>Asked {brisbaneDay(request.createdAt)}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums">${Number(request.weeklyTotal).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">a week · every {request.intervalWeeks} weeks</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          {request.dogs.map((dog: any) => (
            <div key={dog.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Dog className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{dog.packageName}</span>
                {/* The weight the client typed, stated plainly: it chose
                    the price band and it is the likeliest thing to be wrong. */}
                <Badge variant="outline">{Number(dog.weightKg)} kg, as entered</Badge>
              </span>
              <span className="tabular-nums text-muted-foreground">${Number(dog.weeklyPrice).toFixed(2)}</span>
            </div>
          ))}
        </div>

        {request.clientNote && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm italic">"{request.clientNote}"</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span>First visit {brisbane(request.firstScheduledStart)}</span>
          {request.groomerName
            ? <Badge variant="secondary">{request.groomerName}</Badge>
            : <Badge variant="outline">No groomer chosen</Badge>}
        </div>

        {!request.hasCardOnFile && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
            No card on file yet. Approving will book the appointments, but the weekly billing will not start
            until they save a card.
          </p>
        )}

        {priceChanged && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            The price list has changed since they asked: ${priceChanged.currentWeekly.toFixed(2)} a week now,
            not the ${priceChanged.quotedWeekly.toFixed(2)} they were quoted. Approving charges the new price.
          </p>
        )}

        {catalogueProblems.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {catalogueProblems.join(" ")}
          </p>
        )}

        <div className="rounded-lg border p-3">
          {preview.isLoading ? (
            <p className="text-sm text-muted-foreground">Working out the next 12 months…</p>
          ) : !plan ? (
            <p className="text-sm text-muted-foreground">Could not plan the appointments.</p>
          ) : (
            <>
              <p className="text-sm font-medium">{preview.data?.summary}</p>
              {moved.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {moved.map((o: any) => (
                    <li key={o.index}>
                      Visit {o.index} moved from {brisbaneDay(o.idealStart)} to {brisbane(o.start)}
                    </li>
                  ))}
                </ul>
              )}
              {unplaced.length > 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {unplaced.length} visit{unplaced.length === 1 ? "" : "s"} could not be placed
                  ({unplaced.map((o: any) => brisbaneDay(o.idealStart)).join(", ")}) — arrange
                  {unplaced.length === 1 ? " it" : " them"} with the client.
                </p>
              )}
            </>
          )}
        </div>

        {declining ? (
          <div className="space-y-2">
            <Textarea rows={2} placeholder="Why? (optional — not sent to the client)"
              value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={decline.isPending}
                onClick={() => decline.mutate({ requestId: request.id, reason: reason.trim() || undefined })}>
                {decline.isPending ? "Declining…" : "Confirm decline"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeclining(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={approve.isPending || !plan || plan.placedCount === 0 || catalogueProblems.length > 0}
              onClick={() => approve.mutate({ requestId: request.id, acceptPriceChange: Boolean(priceChanged) })}
            >
              {approve.isPending ? "Approving…" : priceChanged ? "Approve at the new price" : "Approve and book"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeclining(true)}>Decline</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MembershipSignupRequests() {
  const pending = trpc.membershipSignup.listRequests.useQuery({ status: "pending" });

  // Nothing waiting means no panel. An empty "0 requests" card on a busy
  // screen is a thing to scroll past every day for the sake of the rare
  // day it has something in it.
  if (!pending.data?.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Membership sign-ups waiting</h2>
        <Badge>{pending.data.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Nothing has been charged and no appointments are held. Approving creates the memberships,
        books the year ahead and starts the weekly payment.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {pending.data.map((request: any) => (
          <RequestCard key={request.id} request={request} onDecided={() => pending.refetch()} />
        ))}
      </div>
    </section>
  );
}
