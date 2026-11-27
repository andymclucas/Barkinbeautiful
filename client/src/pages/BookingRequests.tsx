import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Check, Inbox, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { getActiveTimeZone } from "@/lib/timezone";
import DashboardLayout from "@/components/DashboardLayout";
import { onlineBookingServiceLabel } from "@shared/onlineBookingWeightEligibility";

/**
 * Bookings clients made themselves, waiting for the salon to approve.
 *
 * Andy, 27/11/2026: "a section on the platform where staff can see the
 * booking requests and click these to take them to the live calendar date
 * and approve and add in any extra details". Approving here or on the
 * calendar does the same thing (bookingRequests.approve).
 */
export default function BookingRequests() {
  const utils = trpc.useUtils();
  const requests = trpc.bookingRequests.list.useQuery(undefined, { refetchInterval: 60000 });
  const approve = trpc.bookingRequests.approve.useMutation({
    onSuccess: (r) => {
      toast.success(r.approved > 1 ? `Approved ${r.approved} bookings` : "Booking approved");
      void utils.bookingRequests.list.invalidate();
      void utils.sidebarCounts.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const tz = getActiveTimeZone();
  const when = (d: Date | string) =>
    new Date(d).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
  const rows = requests.data ?? [];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Inbox className="h-6 w-6 text-primary" /> Booking requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookings clients made online or in their portal. Each one is tentative, holding its time, until someone here approves it.
            Open it on the calendar to check the details first.
          </p>
        </div>

        {requests.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : rows.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No booking requests waiting.</CardContent></Card>
        ) : (
          <ul className="space-y-3" data-testid="booking-requests">
            {rows.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">{when(r.scheduledStart)}</p>
                      <p className="text-sm">
                        <span className="font-medium">{r.petName}</span>
                        <span className="text-muted-foreground"> · {[r.clientFirstName, r.clientLastName].filter(Boolean).join(" ")}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary">{onlineBookingServiceLabel(r.serviceType ?? "")}</Badge>
                        {r.staffName && <span>with {r.staffName}</span>}
                        {r.price && Number(r.price) > 0 && <span>· estimate ${Number(r.price).toFixed(2)}</span>}
                        <span>· requested {when(r.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link href={r.calendarHref}><CalendarDays className="h-4 w-4" /> Open in calendar</Link>
                      </Button>
                      <Button size="sm" className="gap-1.5" disabled={approve.isPending} onClick={() => approve.mutate({ appointmentId: r.id })}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
