import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { FileBarChart2, TrendingUp, Users, Calendar, DollarSign, Download, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { useReportRange, ReportRangePicker } from "@/components/ReportRange";
import { WorkflowTimingChart } from "@/components/WorkflowTimingChart";
import { DayTimingReport } from "@/components/DayTimingReport";
import { brisbaneDateKey, localCalendarDay, localCalendarDayKey } from "@shared/localDateTime";
import { Input } from "@/components/ui/input";
import {
  filterRetention, sortRetention, pageRetention, isOverdue,
  RETENTION_PAGE_SIZE, type RetentionSort, type RetentionRow,
} from "@shared/clientRetentionView";

/** Same shape as the figures in the cards above the table. */
const money = (amount: number) =>
  `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom", styled_groom: "Styled Groom", bath_only: "Bath",
  fft: "FFT (Face, Feet & Hygiene Tidy)", nail_trim: "Nail Trim", daycare: "Daycare", deshed: "De-shed", other: "Other",
};

export default function Reporting() {
  // The same period control Analytics uses, so the two pages cannot
  // report different revenue for the same month. This page used to build
  // its dates from the browser's clock and send them bare, which the
  // server reads as UTC midnight — "last 30 days" ended at 10am Brisbane
  // today and silently dropped the rest of the trading day.
  const range = useReportRange("d30");
  const from = range.dateFrom.toISOString();
  const to = range.dateTo.toISOString();

  /*
   * Andy, 04/11/2026: "Build the client retention report - add in the
   * client & dog details, avg weeks between appts and their average
   * spend." Not date-ranged like the cards above it: a dog's rhythm is
   * its whole history, and asking "how often does Bella come" over the
   * last 30 days answers nothing.
   */
  const { data: retention, isLoading: loadingRetention } = trpc.clients.clientRetention.useQuery({ limit: 500 });
  /* Andy, 05/11/2026: "Add sorting and filters for Client Retention and
     only show 20 per page." Pulled whole and worked on here: the book
     is a few hundred dogs, and sorting a page of twenty server-side
     would mean a round trip for every column heading. */
  const [retentionSort, setRetentionSort] = useState<RetentionSort>("total");
  const [retentionDesc, setRetentionDesc] = useState(true);
  const [retentionSearch, setRetentionSearch] = useState("");
  const [retentionUnbooked, setRetentionUnbooked] = useState(false);
  const [retentionOverdue, setRetentionOverdue] = useState(false);
  const [retentionPage, setRetentionPage] = useState(1);
  const retentionView = (() => {
    const all = (retention?.rows ?? []) as unknown as RetentionRow[];
    const matched = filterRetention(all, {
      search: retentionSearch,
      unbooked: retentionUnbooked,
      overdue: retentionOverdue,
    });
    return pageRetention(sortRetention(matched, retentionSort, retentionDesc), retentionPage);
  })();
  /* Clicking a heading sorts by it, clicking it again flips the
     direction — and always returns to page one, because staying on
     page seven of a freshly reordered table shows nothing you asked
     for. */
  const sortBy = (column: RetentionSort) => {
    if (retentionSort === column) setRetentionDesc((d) => !d);
    else { setRetentionSort(column); setRetentionDesc(true); }
    setRetentionPage(1);
  };

  const { data: summary, isLoading: loadingSummary } = trpc.analytics.summary.useQuery({
    dateFrom: from, dateTo: to,
  });

  const { data: staffData, isLoading: loadingStaff } = trpc.analytics.staffProductivity.useQuery({
    dateFrom: from, dateTo: to,
  });

  const { data: financials, isLoading: loadingFinancials } = trpc.analytics.financialBreakdown.useQuery({
    dateFrom: from, dateTo: to,
  });

  const { data: timing, isLoading: loadingTiming } = trpc.analytics.workflowTiming.useQuery({
    dateFrom: from, dateTo: to,
  });

  /* The per-day report runs on its own date, not the 30-day range above.
     "Where did today go wrong" is a question about one day; averaging a
     month is what hid it in the first place. */
  const [timingDay, setTimingDay] = useState(() => brisbaneDateKey(new Date()));
  const { data: dayTiming, isLoading: loadingDayTiming } = trpc.analytics.dayTiming.useQuery({
    date: timingDay,
  });
  const shiftDay = (days: number) => {
    const d = localCalendarDay(timingDay);
    d.setDate(d.getDate() + days);
    setTimingDay(localCalendarDayKey(d));
  };
  const isToday = timingDay === brisbaneDateKey(new Date());

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      // Encoded: these are now full ISO instants, not bare dates.
      const res = await fetch(
        `/api/reports/export?tenantId=1&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `barkin-beautiful-report-${range.fromKey}-to-${range.toKey}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch {
      toast.error("Couldn't export the report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reporting</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Business performance and operational reports
            </p>
            {/* Name the actual dates, so no figure is read as a period it
                does not cover. */}
            <p className="text-muted-foreground text-sm">{range.dates}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-9 gap-1.5" disabled={exporting} onClick={handleExport}>
              <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export full report"}
            </Button>
          </div>
        </div>

        <ReportRangePicker range={range} />

        {/* KPI summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              icon: DollarSign,
              label: "Revenue",
              value: loadingSummary ? "…" : `$${(summary?.revenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              sub: range.label,
            },
            {
              icon: Calendar,
              label: "Appointments",
              value: loadingSummary ? "…" : (summary?.appointments ?? 0).toLocaleString(),
              sub: range.label,
            },
            {
              icon: Users,
              label: "Active Clients",
              value: loadingSummary ? "…" : (summary?.activeClients ?? 0).toLocaleString(),
              sub: "All time",
            },
            {
              icon: TrendingUp,
              label: "Active Memberships",
              value: loadingSummary ? "…" : (summary?.activeMemberships ?? 0).toLocaleString(),
              sub: "Current",
            },
          ].map((k) => (
            <Card key={k.label} className="border-border/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <k.icon className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">{k.label}</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/*
          * Andy, 05/11/2026: "Set out the analytics and reporting sections
          * into different tab groups at the top of the page so it's not one
          * long scroll for all features."
          *
          * The range picker and the four headline figures stay above the
          * tabs. They are the answer to "how did we do", which is the
          * question every one of these sections is a different cut of —
          * putting them inside a tab would mean picking a tab to find out.
          */}
        <Tabs defaultValue="staff">
          <TabsList className="tabs-scroll sm:w-[560px]">
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="timing">Timing</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="exports">Exports</TabsTrigger>
          </TabsList>

          <TabsContent value="staff" className="mt-4 space-y-6">
        {/* Staff productivity */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Staff Productivity — {range.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStaff ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : !staffData || staffData.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No appointment data for this period.
              </div>
            ) : (
              <div className="space-y-3">
                {staffData.map((s, i) => {
                  const maxCount = Math.max(...staffData.map((x) => x.appointmentCount));
                  const pct = maxCount > 0 ? (s.appointmentCount / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: s.staffColour || "#6366f1" }}
                          />
                          <span className="font-medium">{s.staffName || "Unassigned"}</span>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground text-xs">
                          <span>{s.appointmentCount} appts</span>
                          <span className="font-medium text-foreground">
                            ${parseFloat(s.revenue || "0").toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: s.staffColour || "#6366f1" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="financial" className="mt-4 space-y-6">
        {/* Financial breakdown */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Financial Breakdown — {range.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFinancials ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : !financials || financials.byServiceType.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No completed appointments for this period.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                    <p className="text-lg font-bold mt-0.5">${financials.totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Membership</p>
                    <p className="text-lg font-bold mt-0.5">${financials.membershipRevenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">One-off</p>
                    <p className="text-lg font-bold mt-0.5">${financials.oneOffRevenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By service type</p>
                  {financials.byServiceType.map((s: any) => {
                    const pct = financials.totalRevenue > 0 ? (s.revenue / financials.totalRevenue) * 100 : 0;
                    return (
                      <div key={s.serviceType} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{SERVICE_LABELS[s.serviceType] ?? s.serviceType}</span>
                          <div className="flex items-center gap-4 text-muted-foreground text-xs">
                            <span>{s.count} appts</span>
                            <span className="font-medium text-foreground">${s.revenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="timing" className="mt-4 space-y-6">
        {/* Workflow timing */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Workflow Timing — {range.label}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Average time spent in each stage, from check-in to completion.</p>
          </CardHeader>
          <CardContent>
            {loadingTiming ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : !timing || timing.sampleSize === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No workflow timing data for this period.
              </div>
            ) : (
              <WorkflowTimingChart stages={timing.stages} sampleSize={timing.sampleSize} />
            )}
          </CardContent>
        </Card>

        {/* Per-dog timing for one day */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Where the day went
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Every dog on one day, stage by stage — including how long each waited before a bath.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => shiftDay(-1)}>
                ‹ <span className="sr-only">Previous day</span>
              </Button>
              <DateField
                value={timingDay}
                onChange={(next) => next && setTimingDay(next)}
                aria-label="Day to report on"
                wrapperClassName="w-[9.5rem]"
                className="h-8 text-sm"
              />
              <Button
                variant="outline" size="sm" className="h-8 px-2"
                disabled={isToday}
                onClick={() => shiftDay(1)}
              >
                › <span className="sr-only">Next day</span>
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" className="h-8"
                  onClick={() => setTimingDay(brisbaneDateKey(new Date()))}>
                  Today
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingDayTiming ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : (
              <DayTimingReport dogs={dayTiming?.dogs ?? []} />
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="clients" className="mt-4 space-y-6">
        {/* Client retention */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Client Retention
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Every dog with grooming history, most valuable first. The gap is that dog&rsquo;s own
              median, so one missed season does not rewrite its rhythm; the spend is the mean of
              the grooms that carry a price.
            </p>
          </CardHeader>
          <CardContent>
            {/* The two questions this report is actually opened for sit
                as switches, because "overdue with nothing booked" was a
                scroll past the hundred biggest spenders before. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input
                value={retentionSearch}
                onChange={(e) => { setRetentionSearch(e.target.value); setRetentionPage(1); }}
                placeholder="Search dog, owner or phone"
                className="h-8 w-full sm:w-64"
              />
              <Button
                variant={retentionUnbooked ? "default" : "outline"}
                size="sm" className="h-8"
                onClick={() => { setRetentionUnbooked((v) => !v); setRetentionPage(1); }}
              >
                Nothing booked
              </Button>
              <Button
                variant={retentionOverdue ? "default" : "outline"}
                size="sm" className="h-8"
                onClick={() => { setRetentionOverdue((v) => !v); setRetentionPage(1); }}
              >
                Overdue
              </Button>
              {(retentionSearch || retentionUnbooked || retentionOverdue) && (
                <Button
                  variant="ghost" size="sm" className="h-8 text-muted-foreground"
                  onClick={() => { setRetentionSearch(""); setRetentionUnbooked(false); setRetentionOverdue(false); setRetentionPage(1); }}
                >
                  Clear
                </Button>
              )}
            </div>
            {loadingRetention ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : !retention || retention.rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No grooming history yet.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        {([
                          ["name", "Dog", "left"], [null, "Client", "left"],
                          ["visits", "Visits", "right"], ["gap", "Usual gap", "right"],
                          ["spend", "Avg spend", "right"], ["total", "Total", "right"],
                          ["lastVisit", "Last visit", "left"], ["nextVisit", "Next", "left"],
                        ] as [RetentionSort | null, string, "left" | "right"][]).map(([column, label, align]) => (
                          <th key={label} className={`py-2 pr-3 font-medium ${align === "right" ? "text-right" : ""}`}>
                            {column ? (
                              <button
                                type="button"
                                onClick={() => sortBy(column)}
                                className="inline-flex items-center gap-1 hover:text-foreground"
                                aria-label={`Sort by ${label}`}
                              >
                                {label}
                                {retentionSort === column && <span aria-hidden>{retentionDesc ? "\u2193" : "\u2191"}</span>}
                              </button>
                            ) : label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {retentionView.rows.map((r) => (
                        <tr key={r.petId} className="hover:bg-muted/40">
                          <td className="py-2 pr-3">
                            <span className="font-semibold">{r.petName ?? "—"}</span>
                            {r.breed && <span className="block text-xs text-muted-foreground">{r.breed}</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <span>{`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—"}</span>
                            {r.phone && <span className="block text-xs text-muted-foreground">{r.phone}</span>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{r.visits}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {/* Null means too little history to call it a
                                rhythm — two visits is not a pattern. */}
                            {r.usualGapWeeks === null
                              ? <span className="text-muted-foreground">—</span>
                              : `${r.usualGapWeeks} wks`}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {r.averageSpend === null ? <span className="text-muted-foreground">—</span> : money(r.averageSpend)}
                            {r.onMembership && (
                              <span
                                className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                title="On a membership — the groom carries no price because the weekly fee covers it"
                              >plan</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium">{money(r.totalSpend)}</td>
                          <td className="py-2 pr-3 whitespace-nowrap text-xs">
                            {r.lastVisit ? new Date(r.lastVisit).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td className="py-2 whitespace-nowrap text-xs">
                            {r.nextVisit
                              ? new Date(r.nextVisit).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                              : (
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  nothing booked{isOverdue(r as RetentionRow) ? " · overdue" : ""}
                                </span>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                  <p className="text-xs text-muted-foreground">
                    {retentionView.matched === 0
                      ? "Nothing matches those filters."
                      : `Showing ${retentionView.from}–${retentionView.to} of ${retentionView.matched}`}
                    {retentionView.matched !== (retention?.rows.length ?? 0) &&
                      ` (filtered from ${retention?.rows.length ?? 0})`}
                  </p>
                  {retentionView.pageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7"
                        disabled={retentionView.page <= 1}
                        onClick={() => setRetentionPage((p) => p - 1)}>Previous</Button>
                      <span className="px-1 text-xs text-muted-foreground tabular-nums">
                        {retentionView.page} / {retentionView.pageCount}
                      </span>
                      <Button variant="outline" size="sm" className="h-7"
                        disabled={retentionView.page >= retentionView.pageCount}
                        onClick={() => setRetentionPage((p) => p + 1)}>Next</Button>
                    </div>
                  )}
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  {retention.total > (retention.rows.length ?? 0) &&
                    `The ${retention.rows.length} most valuable of ${retention.total} dogs with history. `}
                  Built from
                  completed grooms only — a visit nobody closed out on the board does not count, and
                  roughly half the salon&rsquo;s past appointments are still sitting at{" "}
                  <em>scheduled</em>. Prices are as MoeGo recorded them: a handful of imported
                  bookings covered more than one dog and put the whole figure on each, so a
                  multi-dog family can read high.
                </p>
              </>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="exports" className="mt-4 space-y-6">
        {/* Placeholder reports */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Available Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/40">
              {[
                { name: "Appointment History", desc: "Full list of all appointments with filters", ready: true },
                { name: "Revenue by Service Type", desc: "Breakdown of income by groom type", ready: true },
                { name: "Client Retention", desc: "Avg. weeks between visits per client", ready: true },
                { name: "Membership Billing", desc: "Subscription revenue and failed payments", ready: true },
                { name: "Staff Hours & Pay", desc: "Timesheet summary for payroll", ready: false },
                { name: "Retail Sales", desc: "Product sales and stock movement", ready: false },
              ].map((r) => (
                <div key={r.name} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.ready ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {r.ready ? "Available" : "Coming soon"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
