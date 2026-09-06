import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, type TooltipProps } from "recharts";
import { TrendingUp, Users, CreditCard, CalendarDays, Scissors, Heart, Download } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

const RANGES = [
  { label: "This Week", days: 7 },
  { label: "This Month", days: 30 },
  { label: "Last 3 Months", days: 90 },
  { label: "This Year", days: 365 },
];

export default function Analytics() {
  const [rangeDays, setRangeDays] = useState(30);

  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [rangeDays]);

  const dateTo = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const { data: summary } = trpc.analytics.summary.useQuery({
    tenantId: 1,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  });

  const { data: staffProductivity } = trpc.analytics.staffProductivity.useQuery({
    tenantId: 1,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  });

  const { data: revenueStreams } = trpc.analytics.membershipAttributedRevenue.useQuery({
    tenantId: 1,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  });

  const { data: membershipBreakdown } = trpc.analytics.membershipBreakdown.useQuery({ tenantId: 1 });

  const { data: groomInterval } = trpc.analytics.averageGroomInterval.useQuery({ tenantId: 1 });

  const { data: timeSeries } = trpc.analyticsExt.revenueTimeSeries.useQuery({
    tenantId: 1,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  });

  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["Period", RANGES.find(r => r.days === rangeDays)?.label ?? `${rangeDays} days`],
      [],
      ["Revenue Streams", ""],
      ["Appointment Revenue", `$${(revenueStreams?.appointmentRevenue ?? 0).toFixed(2)}`],
      ["Membership Revenue", `$${(revenueStreams?.membershipRevenue ?? 0).toFixed(2)}`],
      ["Total Revenue", `$${(revenueStreams?.totalRevenue ?? 0).toFixed(2)}`],
      ["Avg Ticket (All)", `$${(revenueStreams?.avgTicketAll ?? 0).toFixed(2)}`],
      ["Avg Weeks Between Completed Grooms", groomInterval?.averageWeeks != null ? `${groomInterval.averageWeeks} weeks` : "Not enough repeat-groom history"],
      ["Repeat Pets Included", groomInterval?.returningPetCount ?? 0],
      [],
      ["Membership Breakdown by Tier", "Count", "Weekly Revenue", "Monthly Estimate"],
      ...(membershipBreakdown?.tiers.map(t => [t.tier, t.count, `$${t.weeklyRevenue.toFixed(2)}`, `$${t.monthlyRevenue.toFixed(2)}`]) ?? []),
      ["TOTAL", "", `$${membershipBreakdown?.totalWeeklyRevenue?.toFixed(2) ?? "0.00"}`, `$${membershipBreakdown?.totalMonthlyRevenue?.toFixed(2) ?? "0.00"}`],
      [],
      ["Staff Performance", "Appointments", "Revenue", "Avg per Appt"],
      ...staffChartData.map(s => [s.name, s.appointments, `$${s.revenue.toFixed(2)}`, s.appointments > 0 ? `$${(s.revenue / s.appointments).toFixed(2)}` : "—"]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `groomigo-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TIER_COLOURS: Record<string, string> = {
    diamond: "#a78bfa", platinum: "#94a3b8", gold: "#f59e0b",
    silver: "#6b7280", bronze: "#b45309",
  };
  const TIER_ICONS: Record<string, string> = {
    diamond: "💎", platinum: "🥇", gold: "🏆", silver: "🥈", bronze: "🏅",
  };

  const staffChartData = staffProductivity?.map(s => ({
    name: (s.staffName ?? "Unassigned").split(" ")[0],
    appointments: s.appointmentCount,
    revenue: parseFloat(s.revenue ?? "0"),
    colour: s.staffColour ?? "#6366f1",
  })) ?? [];

  const pieData = staffChartData.filter(s => s.appointments > 0);
  const totalRevenue = pieData.reduce((sum, s) => sum + s.revenue, 0);

  const PieTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as typeof pieData[0];
    const pct = totalRevenue > 0 ? ((d.revenue / totalRevenue) * 100).toFixed(1) : "0.0";
    return (
      <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs space-y-1 min-w-[160px]">
        <div className="flex items-center gap-2 font-semibold text-sm pb-1 border-b">
          <div className="h-3 w-3 rounded-full shrink-0" style={{ background: d.colour }} />
          {d.name}
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Revenue</span>
          <span className="font-medium">${d.revenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Appointments</span>
          <span className="font-medium">{d.appointments}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Share</span>
          <span className="font-medium">{pct}%</span>
        </div>
        {d.appointments > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Avg per appt</span>
            <span className="font-medium">${(d.revenue / d.appointments).toFixed(0)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Analytics</h1>
            <p className="text-sm text-muted-foreground">Business performance insights</p>
          </div>
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Select value={String(rangeDays)} onValueChange={v => setRangeDays(parseInt(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map(r => (
                <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total Revenue", value: `$${(revenueStreams?.totalRevenue ?? summary?.revenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`, icon: TrendingUp, colour: "text-emerald-600" },
            { label: "Appointments", value: String(summary?.appointments ?? 0), icon: CalendarDays, colour: "text-blue-600" },
            { label: "Active Clients", value: String(summary?.activeClients ?? 0), icon: Users, colour: "text-violet-600" },
            { label: "Active Memberships", value: String(summary?.activeMemberships ?? 0), icon: CreditCard, colour: "text-amber-600" },
            { label: "Avg Groom Cycle", value: groomInterval?.averageWeeks != null ? `${groomInterval.averageWeeks} wks` : "—", detail: groomInterval?.returningPetCount ? `${groomInterval.returningPetCount} repeat pets` : "completed visits only", icon: Scissors, colour: "text-rose-600" },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                  <kpi.icon className={`h-4 w-4 ${kpi.colour}`} />
                </div>
                <p className={`text-3xl font-bold font-display ${kpi.colour}`}>{kpi.value}</p>
                {kpi.detail && <p className="mt-1 text-xs text-muted-foreground">{kpi.detail}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revenue Streams */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Appointment Revenue */}
          <Card className="border-blue-200/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appointment Revenue</p>
                <Scissors className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-3xl font-bold text-blue-600">
                ${(revenueStreams?.appointmentRevenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {revenueStreams?.completedAppts ?? 0} completed appts
                {(revenueStreams?.avgTicketNonMember ?? 0) > 0 && ` · avg $${revenueStreams?.avgTicketNonMember}`}
              </p>
            </CardContent>
          </Card>

          {/* Membership Revenue */}
          <Card className="border-amber-200/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Membership Revenue</p>
                <Heart className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-3xl font-bold text-amber-600">
                ${(revenueStreams?.membershipRevenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.activeMemberships ?? 0} active members
                {(membershipBreakdown?.totalWeeklyRevenue ?? 0) > 0 && ` · $${membershipBreakdown?.totalWeeklyRevenue?.toLocaleString("en-AU", { minimumFractionDigits: 0 })}/wk`}
              </p>
            </CardContent>
          </Card>

          {/* Combined + Avg Ticket */}
          <Card className="border-emerald-200/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Ticket (All Clients)</p>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-3xl font-bold text-emerald-600">
                ${(revenueStreams?.avgTicketAll ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(revenueStreams?.membershipAppts ?? 0)} member visits included
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Membership Revenue Breakdown by Tier */}
        {membershipBreakdown && membershipBreakdown.tiers.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Active Membership Revenue by Tier</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {membershipBreakdown.tiers.map(t => (
                  <div key={t.tier} className="bg-muted/40 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{TIER_ICONS[t.tier] ?? "🏷️"}</span>
                      <span className="font-semibold capitalize">{t.tier}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{t.count} members</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Weekly</span>
                      <span className="font-semibold" style={{ color: TIER_COLOURS[t.tier] }}>${t.weeklyRevenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monthly est.</span>
                      <span className="font-medium">${t.monthlyRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Weekly</p>
                  <p className="text-xl font-bold text-emerald-600">${membershipBreakdown.totalWeeklyRevenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Monthly Estimate</p>
                  <p className="text-xl font-bold text-emerald-600">${membershipBreakdown.totalMonthlyRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Annual Estimate</p>
                  <p className="text-xl font-bold text-emerald-600">${(membershipBreakdown.totalWeeklyRevenue * 52).toLocaleString("en-AU", { minimumFractionDigits: 0 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Staff productivity charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Appointments by Groomer</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {staffChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data for this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={staffChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [v, "Appointments"]} />
                    <Bar dataKey="appointments" radius={[4, 4, 0, 0]}>
                      {staffChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.colour} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Revenue by Groomer</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {pieData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data for this period.</div>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={pieData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={false}>
                        {pieData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.colour} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {pieData.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.colour }} />
                          <span>{s.name}</span>
                        </div>
                        <span className="font-medium">${s.revenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Revenue Trend Chart */}
        {timeSeries && timeSeries.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Revenue Trends — Appointment vs Membership</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={timeSeries} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip formatter={(v: number, name: string) => [`$${v.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`, name === "apptRevenue" ? "Appointment Revenue" : "Membership Revenue"]} />
                  <Legend formatter={(v: string) => v === "apptRevenue" ? "Appointment Revenue" : "Membership Revenue"} />
                  <Line type="monotone" dataKey="apptRevenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="apptRevenue" />
                  <Line type="monotone" dataKey="memberRevenue" stroke="#f59e0b" strokeWidth={2} dot={false} name="memberRevenue" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Staff productivity table */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Staff Performance — Combined Revenue Contribution</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Groomer</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Appointments</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Avg per Appt</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Share</th>
                </tr>
              </thead>
              <tbody>
                {staffChartData.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No data for this period.</td></tr>
                )}
                {staffChartData.map((s, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ background: s.colour }} />
                        {s.name}
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-medium">{s.appointments}</td>
                    <td className="py-2.5 text-right font-medium">${s.revenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {s.appointments > 0 ? `$${(s.revenue / s.appointments).toFixed(0)}` : "—"}
                    </td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {totalRevenue > 0 ? `${((s.revenue / totalRevenue) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
