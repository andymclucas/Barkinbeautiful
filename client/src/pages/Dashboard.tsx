import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, CreditCard, TrendingUp, AlertTriangle, Dog, Clock, ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "wouter";

const STAGES = ["scheduled", "checked_in", "bathing", "grooming", "ready", "complete"] as const;
const STAGE_LABELS: Record<string, string> = {
  scheduled: "Scheduled", checked_in: "Checked In", bathing: "Bathing",
  grooming: "Grooming", ready: "Ready", complete: "Complete",
};
const STAGE_COLOURS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  checked_in: "bg-cyan-100 text-cyan-800",
  bathing: "bg-blue-100 text-blue-800",
  grooming: "bg-violet-100 text-violet-800",
  ready: "bg-emerald-100 text-emerald-800",
  complete: "bg-emerald-600 text-white",
};

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);
  const monthStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(1);
    return d;
  }, [today]);

  const { data: boardData } = trpc.workflow.getTodayBoard.useQuery({ tenantId: 1 });
  const { data: analytics } = trpc.analytics.summary.useQuery({
    tenantId: 1,
    dateFrom: monthStart.toISOString(),
    dateTo: tomorrow.toISOString(),
  });
  const { data: failedPayments } = trpc.memberships.getFailedPayments.useQuery({ tenantId: 1 });
  const dashboardDate = useMemo(() => new Date(Date.now() + 10 * 3600000).toISOString().slice(0, 10), []);
  const { data: timingReviewAlerts } = trpc.workflowReview.getAlerts.useQuery({ tenantId: 1, date: dashboardDate }, { enabled: user?.role === "admin" });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold font-display text-foreground">GSOS</h1>
        <p className="text-muted-foreground">Grooming Salon Operating System</p>
      </div>
      <Button onClick={() => startLogin()} size="lg" className="gap-2">
        Sign In to Continue <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const todayCount = boardData?.length ?? 0;
  const inProgress = boardData?.filter(a => !["scheduled", "complete", "cancelled", "no_show"].includes(a.workflowState)).length ?? 0;
  const readyCount = boardData?.filter(a => a.workflowState === "ready").length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 brand-dashboard">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] uppercase text-primary mb-1">Salon control centre</p>
            <h1 className="text-3xl font-bold font-display tracking-tight">Good morning{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/calendar"><Button title="Open the day calendar" variant="outline" className="brand-lift border-primary/25 bg-white/80 hover:bg-primary/10">Calendar</Button></Link>
            <Link href="/workflow"><Button title="View live grooming workflow" variant="outline" className="brand-lift border-primary/25 bg-white/80 hover:bg-primary/10">Workflow</Button></Link>
            <Link href="/calendar"><Button title="Book a new appointment" className="gap-2 shadow-[0_10px_22px_-12px_var(--brand-primary-strong)] hover:shadow-[0_14px_26px_-12px_var(--brand-primary-strong)]"><CalendarDays className="h-4 w-4" /> New Appointment</Button></Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="brand-lift overflow-hidden border-primary/20 bg-gradient-to-br from-white via-white to-primary/10">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Appointments</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold font-display">{todayCount}</span>
                <span className="text-sm text-muted-foreground mb-1">{inProgress} in progress</span>
              </div>
            </CardContent>
          </Card>
          <Card className="brand-lift overflow-hidden border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ready for Pickup</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold font-display text-emerald-600">{readyCount}</span>
                <span className="text-sm text-muted-foreground mb-1">dogs waiting</span>
              </div>
            </CardContent>
          </Card>
          <Card className="brand-lift overflow-hidden border-violet-200 bg-gradient-to-br from-white via-white to-violet-50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold font-display">
                  ${(analytics?.revenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="brand-lift overflow-hidden border-pink-200 bg-gradient-to-br from-white via-white to-pink-50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Memberships</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold font-display">{analytics?.activeMemberships ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Failed payment alerts */}
        {failedPayments && failedPayments.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {failedPayments.length} Failed Membership Payment{failedPayments.length > 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {failedPayments.slice(0, 3).map((fp) => (
                  <div key={fp.membershipId} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-amber-900">{fp.clientFirstName} {fp.clientLastName} — {fp.petName}</span>
                    <Badge variant="outline" className="border-amber-400 text-amber-800 text-xs">
                      {fp.failedCount} failed attempt{fp.failedCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
              <Link href="/memberships">
                <Button variant="outline" size="sm" className="mt-3 gap-1 border-amber-400 text-amber-800 hover:bg-amber-100">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {timingReviewAlerts && timingReviewAlerts.length > 0 && (
          <Card className="border-amber-300 bg-gradient-to-r from-amber-50 via-white to-white">
            <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-900"><Clock className="h-4 w-4" /> {timingReviewAlerts.length} Workflow Timing Review{timingReviewAlerts.length === 1 ? "" : "s"} Open</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4"><p className="mb-3 text-xs text-amber-900">Completed workflow stages that exceeded the configured review trigger. These are prompts for review, not automatic staff judgements.</p><div className="space-y-2">{timingReviewAlerts.slice(0, 3).map((alert) => <div key={`${alert.appointmentId}-${alert.key}-${alert.staffId}`} className="flex flex-col justify-between gap-2 rounded-lg border border-amber-200 bg-white/85 p-2.5 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{alert.staffName} · {alert.petName} <span className="font-normal text-slate-500">· {alert.clientName}</span></p><p className="text-xs text-amber-900">{alert.stage}: {alert.durationMinutes} min, above the {alert.thresholdMinutes}-minute trigger <span className="text-slate-500">({alert.thresholdSource})</span></p></div><Link href={`/staff/review/${alert.staffId}?date=${alert.date}`}><Button size="sm" variant="outline" className="shrink-0 gap-1 border-amber-300 text-amber-900 hover:bg-amber-100">Review <ArrowRight className="h-3.5 w-3.5" /></Button></Link></div>)}</div>{timingReviewAlerts.length > 3 && <Link href="/workflow"><Button variant="ghost" size="sm" className="mt-3 gap-1 text-amber-900">View all in Workflow <ArrowRight className="h-3 w-3" /></Button></Link>}</CardContent>
          </Card>
        )}

        {/* Today's workflow snapshot */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Today's Workflow</CardTitle>
            <Link href="/workflow">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                Full Board <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!boardData || boardData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No appointments scheduled for today.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {STAGES.map(stage => {
                  const stageAppts = boardData.filter(a => a.workflowState === stage);
                  return (
                    <div key={stage} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">{STAGE_LABELS[stage]}</span>
                        <Badge className={`text-xs px-1.5 py-0 ${STAGE_COLOURS[stage]}`}>{stageAppts.length}</Badge>
                      </div>
                      <div className="space-y-1">
                        {stageAppts.slice(0, 3).map(a => (
                          <div key={a.id} className="text-xs bg-muted rounded p-1.5 truncate">
                            <span className="font-medium">{a.petName}</span>
                            <span className="text-muted-foreground"> · {a.clientFirstName}</span>
                          </div>
                        ))}
                        {stageAppts.length > 3 && (
                          <div className="text-xs text-muted-foreground text-center">+{stageAppts.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/clients", icon: Users, label: "Clients", sub: `${analytics?.activeClients ?? 0} active` },
            { href: "/memberships", icon: CreditCard, label: "Memberships", sub: `${analytics?.activeMemberships ?? 0} active` },
            { href: "/analytics", icon: TrendingUp, label: "Analytics", sub: "Reports & insights" },
            { href: "/staff", icon: Clock, label: "Staff & Timesheets", sub: "Manage team" },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
