import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const workflowSource = readFileSync(resolve(process.cwd(), "client/src/pages/WorkflowBoard.tsx"), "utf8");
const staffSource = readFileSync(resolve(process.cwd(), "client/src/pages/Staff.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");
const settingsSource = readFileSync(resolve(process.cwd(), "client/src/pages/Settings.tsx"), "utf8");
const staffRouterStart = routerSource.indexOf("const staffRouter = router({");
const staffRouterEnd = routerSource.indexOf("const timesheetsRouter", staffRouterStart);
const staffRouterSource = routerSource.slice(staffRouterStart, staffRouterEnd);

describe("workflow timing review and staff analytics", () => {
  it("keeps recorded stage and total timing fields available to the workflow board", () => {
    expect(routerSource).toContain("bathingStartedAt: appointments.bathingStartedAt");
    expect(routerSource).toContain("bathingCompletedAt: appointments.bathingCompletedAt");
    expect(routerSource).toContain("dryingStartedAt: appointments.dryingStartedAt");
    expect(routerSource).toContain("dryingCompletedAt: appointments.dryingCompletedAt");
    expect(routerSource).toContain("groomingStartedAt: appointments.groomingStartedAt");
    expect(routerSource).toContain("groomingCompletedAt: appointments.groomingCompletedAt");
    expect(routerSource).toContain("checkedInAt: appointments.checkedInAt");
    expect(routerSource).toContain("completedAt: appointments.completedAt");
  });

  it("links every timing review row to the matching staff profile using its staff identifier", () => {
    expect(workflowSource).toContain("type Person = { staffId: number;");
    expect(workflowSource).toContain("staffId: id,");
    expect(workflowSource).toContain("navigate(`/staff/review/${person.staffId}?date=${boardDate}`)");
    expect(workflowSource).toContain("Review ${person.name}'s timing exceptions and recommended actions");
    expect(workflowSource).toContain("View profile");
  });

  it("returns selected-period averages only from completed recorded stages in the selected tenant", () => {
    expect(staffRouterSource).toContain("getProfile: adminProcedure");
    expect(staffRouterSource).toContain("tenantId: z.number().default(1)");
    expect(staffRouterSource).toContain("dateFrom: z.string().regex");
    expect(staffRouterSource).toContain("dateTo: z.string().regex");
    expect(staffRouterSource).toContain("rangeDays > 366");
    expect(staffRouterSource).toContain("scheduled_start >= ${rangeStart}");
    expect(staffRouterSource).toContain("scheduled_start < ${rangeEndExclusive}");
    expect(staffRouterSource).toContain('timeZone: "Australia/Brisbane"');
    expect(staffRouterSource).toContain('T00:00:00.000+10:00');
    expect(staffRouterSource).toContain("CONVERT_TZ(scheduled_start, '+00:00', '+10:00')");
    expect(staffRouterSource).toContain("status NOT IN ('cancelled', 'no_show')");
    expect(staffRouterSource).toContain("FLOOR((bathing_completed_at - bathing_started_at) / 60000)");
    expect(staffRouterSource).toContain("FLOOR((drying_completed_at - drying_started_at) / 60000)");
    expect(staffRouterSource).toContain("FLOOR((grooming_completed_at - grooming_started_at) / 60000)");
    expect(staffRouterSource).toContain("FLOOR((completed_at - checked_in_at) / 60000)");
    expect(staffRouterSource).not.toContain("TIMESTAMPDIFF(MINUTE");
    expect(staffRouterSource).toContain("timingAnalytics:");
    expect(staffRouterSource).toContain("dailyTrend,");
    expect(staffRouterSource).toContain("dailyByDate");
    expect(staffRouterSource).toContain("reviewFindingRows");
    expect(staffRouterSource).toContain("reviewFindings");
    expect(staffRouterSource).toContain("const reviewRules = timingReviewRules(reviewThresholdRows);");
    expect(staffRouterSource).toContain("resolveTimingReviewThreshold");
    expect(staffRouterSource).toContain("threshold.thresholds.bathMinutes");
    expect(staffRouterSource).toContain("threshold.thresholds.dryMinutes");
    expect(staffRouterSource).toContain("threshold.thresholds.groomMinutes");
    expect(staffRouterSource).toContain("threshold.thresholds.totalMinutes");
    expect(routerSource).toContain("const workflowReviewRouter = router({");
    expect(routerSource).toContain("getThresholds: adminProcedure");
    expect(routerSource).toContain("upsertThreshold: adminProcedure");
    expect(routerSource).toContain("removeThreshold: adminProcedure");
    expect(routerSource).toContain("getAlerts: adminProcedure");
    expect(routerSource).toContain("resolveTimingReviewThreshold");
  });

  it("denies the full staff timing profile to non-administrator accounts", async () => {
    const ctx = {
      user: {
        id: 998,
        openId: "non-admin-staff-profile-check",
        name: "Non-admin",
        email: "non-admin@example.test",
        loginMethod: "email",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} },
      res: {},
    } as TrpcContext;
    const caller = appRouter.createCaller(ctx);

    await expect(caller.staff.getProfile({ staffId: 1, tenantId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workflowReview.getThresholds({ tenantId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workflowReview.getAlerts({ tenantId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("opens a dedicated selected-profile view from the review query and presents range-filtered metrics, trends and CSV export", () => {
    expect(appSource).toContain('path="/staff/review/:staffId" component={StaffReviewProfile}');
    expect(staffSource).toContain("export function StaffReviewProfile()");
    expect(staffSource).toContain("const params = useParams<{ staffId: string }>();");
    expect(staffSource).toContain("const staffId = Number(params.staffId);");
    expect(staffSource).toContain("makeTimingRange(7, reviewDate)");
    expect(staffSource).toContain("Workflow timing review");
    expect(staffSource).toContain("<StaffProfilePanel staffId={staffId} onClose={() => navigate(\"/staff\")} initialTimingRange={initialTimingRange} />");
    expect(staffSource).toContain("Back to staff");
    expect(staffSource).toContain("Timing performance");
    expect(staffSource).toContain("timingRange");
    expect(staffSource).toContain('type="date"');
    expect(staffSource).toContain("Last 4 weeks");
    expect(staffSource).toContain("Export CSV");
    expect(staffSource).toContain("text/csv;charset=utf-8;");
    expect(staffSource).toContain("csvCell");
    expect(staffSource).toContain("Daily average timing trend");
    expect(staffSource).toContain("No completed workflow timings were recorded in this period.");
    expect(staffSource).toContain("<BarChart");
    expect(staffSource).toContain('dataKey="totalAverageMinutes"');
    expect(staffSource).toContain("Timing exceptions requiring review");
    expect(staffSource).toContain("Recommended action:");
    expect(staffSource).toContain("Review booking");
    expect(staffSource).toContain("reviewAppointment=${finding.appointmentId}");
    expect(workflowSource).toContain("workflow-appointment-${reviewAppointmentId}");
    expect(workflowSource).toContain("data-review-focused");
    expect(dashboardSource).toContain("trpc.workflowReview.getAlerts.useQuery");
    expect(dashboardSource).toContain("Workflow Timing Review");
    expect(dashboardSource).toContain("/staff/review/${alert.staffId}?date=${alert.date}");
    expect(settingsSource).toContain("Workflow timing review triggers");
    expect(settingsSource).toContain("Pet-size preset");
    expect(settingsSource).toContain("Breed override");
    expect(settingsSource).toContain("Save trigger");
    expect(staffSource).toContain('{ label: "Bath",');
    expect(staffSource).toContain('{ label: "Dry",');
    expect(staffSource).toContain('{ label: "Groom",');
    expect(staffSource).toContain('{ label: "Total",');
    expect(staffSource).toContain("{item.label} average");
  });
});
