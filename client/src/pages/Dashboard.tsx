import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useTimezone } from "@/lib/timezone";
import { brisbaneDateKey } from "@shared/localDateTime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, CreditCard, TrendingUp, AlertTriangle, Dog, Clock, ArrowRight, MessageSquare, Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { getActiveTimeZone } from "@/lib/timezone";

const STAGES = ["scheduled", "checked_in", "bathing", "grooming", "ready", "complete"] as const;
const STAGE_LABELS: Record<string, string> = {
  scheduled: "Scheduled", checked_in: "Checked In", bathing: "Bathing",
  grooming: "Grooming", ready: "Ready", complete: "Complete",
};
const STAGE_COLOURS: Record<string, { bg: string; fg: string }> = {
  scheduled:  { bg: "bg-muted",    fg: "text-muted-foreground" },
  checked_in: { bg: "bg-violet-100 dark:bg-violet-950/50",   fg: "text-violet-700 dark:text-violet-300" },
  bathing:    { bg: "bg-blue-100 dark:bg-blue-950/50",     fg: "text-blue-700 dark:text-blue-300" },
  grooming:   { bg: "bg-violet-100 dark:bg-violet-950/50",   fg: "text-violet-700 dark:text-violet-300" },
  ready:      { bg: "bg-emerald-100 dark:bg-emerald-950/50",  fg: "text-emerald-700 dark:text-emerald-300" },
  complete:   { bg: "bg-emerald-600",  fg: "text-white" },
};

function staffInitials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatTime(dt: Date | string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("en-AU", {
    timeZone: getActiveTimeZone(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatServiceType(s: string | null) {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(dt: Date | string | null) {
  if (!dt) return "";
  const ms = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();

  // The header names the clock every time on this page is measured against —
  // the signed-in user's own timezone, which every other time now follows too.
  // The abbreviation is derived through Intl, so it stays correct for any zone
  // and across DST for the ones that observe it.
  //
  // The formatted string is what lives in state: setting it to an equal string
  // is a no-op in React, so this checks every second but only re-renders on the
  // minute, and can never display a stale minute.
  const tz = useTimezone();
  const [salonTime, setSalonTime] = useState(() => tz.timeWithZone(Date.now()));
  useEffect(() => {
    setSalonTime(tz.timeWithZone(Date.now()));
    const timer = window.setInterval(() => setSalonTime(tz.timeWithZone(Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [tz]);

  // The salon's day, and it has to keep up with the clock.
  //
  // This used to be `new Date(); d.setHours(0,0,0,0)` in a useMemo with no
  // dependencies: the browser's midnight, worked out once when the page
  // mounted. A dashboard left open overnight - which is how it is actually
  // used, on the salon screen - kept showing the previous day indefinitely.
  // dashboardDate additionally hand-rolled Brisbane as `Date.now() + 10h`.
  const [dashboardDate, setDashboardDate] = useState(() => brisbaneDateKey());
  useEffect(() => {
    const id = window.setInterval(() => {
      const key = brisbaneDateKey();
      setDashboardDate((current) => (current === key ? current : key));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Brisbane midnight expressed as an instant: 14:00 UTC the previous day.
  const [year, month, day] = dashboardDate.split("-").map(Number);
  const tomorrow = useMemo(() => new Date(Date.UTC(year, month - 1, day, 14, 0, 0, 0)), [year, month, day]);
  const monthStart = useMemo(() => new Date(Date.UTC(year, month - 1, 0, 14, 0, 0, 0)), [year, month]);

  // The board and the unread count are what the salon reads off the wall, so
  // they poll rather than sitting on whatever was true at page load.
  const live = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const;

  const { data: boardData } = trpc.workflow.getTodayBoard.useQuery({ tenantId: 1 }, live);
  const { data: analytics } = trpc.analytics.summary.useQuery({ tenantId: 1, dateFrom: monthStart.toISOString(), dateTo: tomorrow.toISOString() }, live);
  const { data: failedPayments } = trpc.memberships.getFailedPayments.useQuery({ tenantId: 1 });
  const { data: timingReviewAlerts } = trpc.workflowReview.getAlerts.useQuery({ tenantId: 1, date: dashboardDate }, { ...live, enabled: user?.role === "admin" });
  const { data: messagePreview } = trpc.sms.getUnreadPreview.useQuery({ tenantId: 1, limit: 5 }, live);

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
      <Link href="/login">
        <Button size="lg" className="gap-2">Sign In to Continue <ArrowRight className="h-4 w-4" /></Button>
      </Link>
    </div>
  );

  const todayCount = boardData?.length ?? 0;
  const inProgress = boardData?.filter(a => !["scheduled", "complete", "cancelled", "no_show"].includes(a.workflowState)).length ?? 0;
  const readyCount = boardData?.filter(a => a.workflowState === "ready").length ?? 0;
  const unreadMsgs = messagePreview?.unreadCount ?? 0;
  const activeAppts = boardData?.filter(a => !["cancelled", "no_show"].includes(a.workflowState)) ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-5 brand-dashboard">

        {/* Header */}
        {/* Stacks on a phone. Three actions in a shrink-0 row ran off the
            right edge - "New Appointment" was cut in half at 375px. */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground mb-1">Salon control centre</p>
            <h1 className="text-[30px] font-bold font-display tracking-tight leading-tight">
              Good morning{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-[13.5px] text-muted-foreground mt-0.5">
              {tz.longDate(Date.now())}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tz.differsFromSalon ? "Your time" : "Salon time"}</span>
              <time className="font-semibold tabular-nums text-foreground" dateTime={new Date().toISOString()}>{salonTime}</time>
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
            <Link href="/calendar" className="flex-1 sm:flex-none">
              <Button variant="outline" className="h-10 w-full sm:w-auto rounded-[14px] brand-lift bg-card hover:bg-accent hover:text-accent-foreground">Calendar</Button>
            </Link>
            <Link href="/workflow" className="flex-1 sm:flex-none">
              <Button variant="outline" className="h-10 w-full sm:w-auto rounded-[14px] brand-lift bg-card hover:bg-accent hover:text-accent-foreground">Workflow</Button>
            </Link>
            <Link href="/calendar" className="flex-1 sm:flex-none">
              <Button className="h-10 w-full sm:w-auto rounded-[14px] gap-2 whitespace-nowrap shadow-[0_10px_22px_-12px_var(--brand-primary-strong)] hover:shadow-[0_14px_26px_-12px_var(--brand-primary-strong)]">
                <CalendarDays className="h-4 w-4 shrink-0" />
                {/* "New Appointment" cannot fit a third of a 375px phone. */}
                <span className="sm:hidden">New</span>
                <span className="hidden sm:inline">New Appointment</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 gm-stagger">
          {[
            { tint: "gm-tint-violet", Icon: CalendarDays, label: "Today's Appointments", value: todayCount,  sub: `${inProgress} in progress` },
            { tint: "gm-tint-mint",   Icon: Dog,          label: "Ready for Pickup",      value: readyCount,  sub: "dogs waiting" },
            { tint: "gm-tint-amber",  Icon: TrendingUp,   label: "Monthly Revenue",       value: `$${(analytics?.revenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: "this month" },
            { tint: "gm-tint-sky",    Icon: CreditCard,   label: "Active Memberships",    value: analytics?.activeMemberships ?? 0, sub: "currently active" },
          ].map(({ tint, Icon, label, value, sub }) => (
            <Card key={label} className="brand-lift py-[18px]">
              <CardContent className="flex flex-col items-start gap-2 px-[18px] sm:flex-row sm:items-center sm:gap-3.5">
                <div className={`${tint} flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl`}>
                  <Icon className="h-[19px] w-[19px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11.5px] font-medium text-muted-foreground leading-snug">{label}</p>
                  <p className="text-[21px] font-bold font-display leading-[1.15] tabular-nums sm:text-[25px]">{value}</p>
                  <p className="text-[11.5px] text-muted-foreground leading-snug">{sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alerts */}
        {failedPayments && failedPayments.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                {failedPayments.length} Failed Membership Payment{failedPayments.length > 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {failedPayments.slice(0, 3).map((fp) => (
                  <div key={fp.membershipId} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-amber-900 dark:text-amber-200">{fp.clientFirstName} {fp.clientLastName} — {fp.petName}</span>
                    <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300 text-xs">
                      {fp.failedCount} failed attempt{fp.failedCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
              <Link href="/memberships">
                <Button variant="outline" size="sm" className="mt-3 gap-1 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:bg-amber-950/50">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* The timing-review alert card sat here. Removed with the rest
            of the review feature: threshold alerts were noise, and naming a
            staff member beside an amber warning read as a fault rather than
            a question. The per-stage timing is still recorded, and
            shared/stageDurations.ts now derives the WAIT between stages too,
            which is the number that tells capacity apart from training. */}

        {/* Schedule + Workflow two-column */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-3.5">

          {/* Today's schedule */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 pt-5 px-[22px] flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[15px] font-semibold font-display">Today's schedule</CardTitle>
              <Link href="/calendar">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
                  View calendar <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-[22px] pb-5">
              {activeAppts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No appointments today.</p>
              ) : (
                <div>
                  <div
                    className="grid gap-3 pb-2 border-b border-border text-[11px] font-medium text-muted-foreground tracking-[0.02em] uppercase"
                    style={{ gridTemplateColumns: "72px minmax(0,1fr) 130px 140px" }}
                  >
                    <div>Time</div><div>Pet</div><div>Service</div><div>Groomer</div>
                  </div>
                  <div className="overflow-y-auto max-h-80">
                    {activeAppts.map((a) => (
                      <div
                        key={a.id}
                        className="grid gap-3 items-center py-[9px] border-b border-border/50 text-[13px] last:border-0"
                        style={{ gridTemplateColumns: "72px minmax(0,1fr) 130px 140px" }}
                      >
                        <div className="tabular-nums text-muted-foreground font-medium">{formatTime(a.scheduledStart)}</div>
                        <div className="min-w-0">
                          <span className="font-semibold block truncate">{a.petName}</span>
                          <span className="text-xs text-muted-foreground block truncate">{a.clientFirstName} {a.clientLastName}</span>
                        </div>
                        <div className="text-muted-foreground truncate">{formatServiceType(a.serviceType)}</div>
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                            style={{ background: a.staffColour ?? "#7c3aed" }}
                          >
                            {staffInitials(a.staffName ?? null)}
                          </span>
                          <span className="truncate">{a.staffName ?? "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow right now */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 pt-5 px-[22px] space-y-0">
              <CardTitle className="text-[15px] font-semibold font-display">Workflow right now</CardTitle>
            </CardHeader>
            <CardContent className="px-[22px] pb-5 flex flex-col gap-[9px] flex-1">
              {STAGES.map(stage => {
                const count = boardData?.filter(a => a.workflowState === stage).length ?? 0;
                const { bg, fg } = STAGE_COLOURS[stage];
                return (
                  <div key={stage} className="flex items-center justify-between gap-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium ${bg} ${fg}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-[14px] font-bold font-display tabular-nums">{count}</span>
                  </div>
                );
              })}
              <div className="flex-1" />
              <Link href="/workflow" className="block mt-2">
                <Button className="w-full h-10 rounded-[14px] shadow-[0_10px_22px_-12px_var(--brand-primary-strong)] hover:shadow-[0_14px_26px_-12px_var(--brand-primary-strong)]">
                  Open workflow board
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* New messages preview */}
        {unreadMsgs > 0 && messagePreview && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                {unreadMsgs} Unread Message{unreadMsgs !== 1 ? "s" : ""}
              </CardTitle>
              <Link href="/messages">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  All messages <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {messagePreview.recent.map((item) => (
                <Link key={item.id} href="/messages">
                  <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 hover:bg-muted/60 transition-colors cursor-pointer">
                    <div className={`mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full ${item.kind === "missed_call" ? "bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400" : "bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400"}`}>
                      {item.kind === "missed_call" ? <Phone className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{String(item.clientName || item.toNumber || "Unknown")}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(item.at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.kind === "missed_call" ? "📞 Missed call — " : ""}{item.body?.slice(0, 80)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/clients",     Icon: Users,      label: "Clients",            sub: `${analytics?.activeClients ?? 0} active` },
            { href: "/memberships", Icon: CreditCard, label: "Memberships",        sub: `${analytics?.activeMemberships ?? 0} active` },
            { href: "/analytics",   Icon: TrendingUp, label: "Analytics",          sub: "Reports & insights" },
            { href: "/staff",       Icon: Clock,      label: "Staff & Timesheets", sub: "Manage team" },
          ].map(({ href, Icon, label, sub }) => (
            <Link key={href} href={href}>
              <Card className="cursor-pointer brand-lift">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{label}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{sub}</p>
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
