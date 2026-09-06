import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileBarChart2, TrendingUp, Users, Calendar, DollarSign } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from: Date;
  if (period === "7d") { from = new Date(now); from.setDate(now.getDate() - 7); }
  else if (period === "30d") { from = new Date(now); from.setDate(now.getDate() - 30); }
  else if (period === "90d") { from = new Date(now); from.setDate(now.getDate() - 90); }
  else if (period === "ytd") { from = new Date(now.getFullYear(), 0, 1); }
  else { from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); }
  return { from: from.toISOString().split("T")[0], to };
}

export default function Reporting() {
  const [period, setPeriod] = useState("30d");
  const { from, to } = getDateRange(period);

  const { data: summary, isLoading: loadingSummary } = trpc.analytics.summary.useQuery({
    tenantId: 1, dateFrom: from, dateTo: to,
  });

  const { data: staffData, isLoading: loadingStaff } = trpc.analytics.staffProductivity.useQuery({
    tenantId: 1, dateFrom: from, dateTo: to,
  });

  const periodLabels: Record<string, string> = {
    "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
    "ytd": "Year to date", "1y": "Last 12 months",
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reporting</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Business performance and operational reports
            </p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
              <SelectItem value="1y">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              icon: DollarSign,
              label: "Revenue",
              value: loadingSummary ? "…" : `$${(summary?.revenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
              sub: periodLabels[period],
            },
            {
              icon: Calendar,
              label: "Appointments",
              value: loadingSummary ? "…" : (summary?.appointments ?? 0).toLocaleString(),
              sub: periodLabels[period],
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

        {/* Staff productivity */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Staff Productivity — {periodLabels[period]}
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
                            ${parseFloat(s.revenue || "0").toLocaleString("en-AU", { minimumFractionDigits: 0 })}
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
                { name: "Client Retention", desc: "Avg. weeks between visits per client", ready: false },
                { name: "Membership Billing", desc: "Subscription revenue and failed payments", ready: true },
                { name: "Staff Hours & Pay", desc: "Timesheet summary for payroll", ready: false },
                { name: "Retail Sales", desc: "Product sales and stock movement", ready: false },
              ].map((r) => (
                <div key={r.name} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.ready ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {r.ready ? "Available" : "Coming soon"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
