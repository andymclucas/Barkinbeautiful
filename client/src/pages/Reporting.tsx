import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { FileBarChart2, TrendingUp, Users, Calendar, DollarSign, Download, Clock, PhoneOff } from "lucide-react";
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

/** What is actually in each tab, for the hover. */
const REPORT_TABS = [
  { value: "staff", label: "Staff", contains: "Productivity per groomer — appointments, revenue and clips over the period." },
  { value: "financial", label: "Financial", contains: "Revenue by service, daily net sales, memberships and discounts." },
  { value: "timing", label: "Timing", contains: "How long each stage takes, and where the day runs late." },
  { value: "clients", label: "Clients", contains: "Lapsed customers to ring back, and retention per dog." },
  { value: "exports", label: "Exports", contains: "Download appointments, clients and invoices as CSV." },
] as const;

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
  /*
   * Which tab is open, because every query below is gated on it.
   *
   * The page was uncontrolled — `defaultValue="staff"` — so a load of
   * /reporting fired EVERY tab's query whatever you were looking at.
   * Two of them, clientRetention and lapsedClients, each pull the
   * salon's whole completed-appointment history into memory: two full
   * scans per page load, on a 512MB instance that idles near 300MB.
   *
   * It ran out of memory three times on 05/11/2026 — 2:36, 2:52 and
   * 4:05 PM — and Render killed the process each time. The salon got
   * 502s while the board was in use. Render's own event log names it:
   * "Ran out of memory (used over 512MB) while running your code."
   *
   * A report nobody is looking at should cost nothing.
   */
  const [reportTab, setReportTab] = useState("staff");

  const { data: retention, isLoading: loadingRetention } = trpc.clients.clientRetention.useQuery(
    { limit: 500 },
    { enabled: reportTab === "clients" },
  );
  /* How many of their own gaps away counts as gone rather than late.
     Left open because the right answer differs by salon and by season. */
  const [lapsedFactor, setLapsedFactor] = useState(2);
  const { data: lapsed, isLoading: loadingLapsed } =
    trpc.clients.lapsedClients.useQuery(
      { limit: 200, overdueFactor: lapsedFactor },
      { enabled: reportTab === "clients" },
    );
  /* From the server, over every lapsed client — NOT a sum of the rows
     on screen, which stop at the query limit and would print a figure
     for two hundred beside a count for all of them. Membership rows
     contribute nothing by design, their grooms carrying no price, so
     this is money the salon has not taken rather than the full cost of
     the people on the list. */
  const lapsedLost = lapsed?.totalLostRevenue ?? 0;
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

  const { data: staffData, isLoading: loadingStaff } = trpc.analytics.staffProductivity.useQuery(
    { dateFrom: from, dateTo: to },
    { enabled: reportTab === "staff" },
  );

  const { data: financials, isLoading: loadingFinancials } = trpc.analytics.financialBreakdown.useQuery(
    { dateFrom: from, dateTo: to },
    { enabled: reportTab === "financial" },
  );

  const { data: timing, isLoading: loadingTiming } = trpc.analytics.workflowTiming.useQuery(
    { dateFrom: from, dateTo: to },
    { enabled: reportTab === "timing" },
  );

  /* The per-day report runs on its own date, not the 30-day range above.
     "Where did today go wrong" is a question about one day; averaging a
     month is what hid it in the first place. */
  const [timingDay, setTimingDay] = useState(() => brisbaneDateKey(new Date()));
  const { data: dayTiming, isLoading: loadingDayTiming } = trpc.analytics.dayTiming.useQuery(
    { date: timingDay },
    { enabled: reportTab === "timing" },
  );
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
        <Tabs value={reportTab} onValueChange={setReportTab}>
          {/*
            * Andy, 05/11/2026: "make it more prominent and hover
            * features when hovering over each title."
            *
            * The prominence is in index.css and applies to every tab bar.
            * This is the second half: what is actually inside each tab,
            * on hover, so the sections can be found without opening all
            * five. The contrast problem had hidden that they were even
            * tabs.
            */}
          <TabsList className="tabs-scroll">
            {REPORT_TABS.map((tab) => (
              <Tooltip key={tab.value}>
                <TooltipTrigger asChild>
                  <TabsTrigger value={tab.value}>{tab.label}</TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[15rem]">
                  <p className="font-semibold">{tab.label}</p>
                  <p className="text-xs opacity-90">{tab.contains}</p>
                </TooltipContent>
              </Tooltip>
            ))}
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
        {/*
          * Lapsed customers — the win-back call list.
          *
          * Above retention on purpose. Retention tells you who is
          * slipping; this tells you who has already gone, with a phone
          * number and a figure beside it, so it is the one that has an
          * action attached.
          */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PhoneOff className="h-4 w-4 text-primary" /> Lapsed Customers
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Clients who have stopped coming and have nothing in the diary, measured against
              their own usual gap rather than one figure for the salon. Ranked by what their
              absence is costing &mdash; except anyone still paying a membership, who comes first
              whatever the spend says.
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Gone when they are</span>
              {/* The one judgement in the report worth leaving open: at
                  1.5 it is a chase list, at 3 it is the people who are
                  genuinely not coming back. */}
              {[1.5, 2, 3].map((factor) => (
                <button
                  key={factor}
                  type="button"
                  onClick={() => setLapsedFactor(factor)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    lapsedFactor === factor
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {factor}&times; their gap
                </button>
              ))}
              {lapsed && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {lapsed.total} {lapsed.total === 1 ? "client" : "clients"}
                  {lapsedLost > 0 && <> &middot; {money(lapsedLost)} not taken</>}
                </span>
              )}
            </div>
            {loadingLapsed ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading&hellip;</p>
            ) : !lapsed || lapsed.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody is more than {lapsedFactor}&times; their usual gap overdue. That is the
                answer you want.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">Client</th>
                      <th className="py-2 pr-3 font-medium text-right">Visits</th>
                      <th className="py-2 pr-3 font-medium text-right">Usual gap</th>
                      <th className="py-2 pr-3 font-medium">Last seen</th>
                      <th className="py-2 pr-3 font-medium text-right">Away</th>
                      <th className="py-2 pr-3 font-medium text-right">Missed</th>
                      <th className="py-2 pr-3 font-medium text-right">Not taken</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {lapsed.rows.map((r) => (
                      <tr key={r.clientId} className="hover:bg-muted/40">
                        <td className="py-2 pr-3">
                          <span className="font-semibold">
                            {`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "\u2014"}
                          </span>
                          {r.onMembership && (
                            <span
                              className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                              title="Still paying a membership and not coming in. Ring this one first."
                            >still paying</span>
                          )}
                          {r.smsOptedOut && (
                            <span
                              className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground"
                              title="Opted out of messages — call, do not text"
                            >no texts</span>
                          )}
                          {r.phone && <span className="block text-xs text-muted-foreground">{r.phone}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.visits}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round(r.usualGapDays / 7)} wks
                        </td>
                        <td className="py-2 pr-3">{localCalendarDayKey(r.lastVisit)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round(r.daysSince / 7)} wks
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.missedVisits}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {/* A membership client's grooms are $0, so this
                              is genuinely nil for them — the weekly fee
                              is what they are losing, and it is still
                              being charged. The badge says so. */}
                          {r.estimatedLostRevenue > 0
                            ? money(r.estimatedLostRevenue)
                            : <span className="text-muted-foreground">&mdash;</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

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
                { name: "Lapsed Customers", desc: "Who has stopped coming, and what it is costing", ready: true },
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
