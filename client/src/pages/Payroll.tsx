import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, FileText, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export default function Payroll() {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const { data: staffList } = trpc.staff.list.useQuery({ tenantId: 1 });

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Staff hours, timesheets and pay summaries
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Clock, label: "Hours This Week", value: "—", sub: "Timesheets pending" },
            { icon: DollarSign, label: "Gross Pay (Est.)", value: "—", sub: "Based on hours" },
            { icon: FileText, label: "Timesheets", value: String(staffList?.length ?? 0), sub: "Staff members" },
            { icon: TrendingUp, label: "Xero Sync", value: "Not connected", sub: "Coming soon" },
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

        {/* Staff timesheet table */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Staff Timesheets — This Week</CardTitle>
          </CardHeader>
          <CardContent>
            {!staffList || staffList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No staff members found. Add staff in the Staff tab first.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {staffList.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: s.colourHex || "#6366f1" }}
                      >
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{s.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">0 hrs logged</span>
                      <Badge variant="outline" className="text-xs">No timesheets</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-muted-foreground text-sm">
          <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Xero Payroll Integration</p>
          <p className="mt-1 text-xs">Connect your Xero account to sync timesheets and run payroll automatically.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
