import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAustralianAuditTimestamp } from "../shared/auditTimestamp";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const staffSource = readFileSync(resolve(process.cwd(), "client/src/pages/Staff.tsx"), "utf8");
const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

describe("staff activity audit timestamps", () => {
  it("formats an immutable activity instant with a complete Australian local date, time, seconds and zone", () => {
    const rendered = formatAustralianAuditTimestamp(Date.UTC(2026, 8, 1, 2, 3, 4, 567));
    expect(rendered).toContain("01 Sept 2026");
    expect(rendered).toMatch(/12:03:04\s?(pm|PM)/);
    expect(rendered).toContain("AEST");
  });

  it("uses exact activity and workflow audit columns without discarding the established timestamp history", () => {
    expect(schemaSource).toContain('occurredAtMs: bigint("occurred_at_ms", { mode: "number" })');
    expect(schemaSource).toContain('changedAtMs: bigint("changed_at_ms", { mode: "number" })');
    expect(schemaSource).toContain('createdAt: timestamp("created_at").defaultNow().notNull()');
    expect(schemaSource).toContain('changedAt: timestamp("changed_at").defaultNow().notNull()');
  });

  it("records each workflow state change in both audit trails with the same captured instant", () => {
    expect(routerSource).toContain("const occurredAtMs = Date.now();");
    expect(routerSource).toContain("recordStaffAccessEvent");
    expect(routerSource.match(/db\.insert\(staffAccessEvents\)/g)).toHaveLength(1);
    expect(routerSource).toContain("let workflowChangedAtMs: number | null = null;");
    expect(routerSource).toContain("changedAtMs: workflowChangedAtMs");
    expect(routerSource).toContain("eventType: \"workflow_updated\"");
    expect(routerSource).toContain("occurredAtMs: staffAccessEvents.occurredAtMs");
  });

  it("renders the precise audit instant and full raw timestamp from the staff activity history", () => {
    expect(staffSource).toContain("formatAustralianAuditTimestamp(timestamp)");
    expect(staffSource).toContain("Audit timestamp:");
    expect(staffSource).toContain("Recorded by");
  });

  it("links workflow activity to its appointment and exact from/to states for review matching", () => {
    expect(schemaSource).toContain('appointmentId: int("appointment_id")');
    expect(schemaSource).toContain('workflowFromState: varchar("workflow_from_state", { length: 32 })');
    expect(schemaSource).toContain('workflowToState: varchar("workflow_to_state", { length: 32 })');
    expect(schemaSource).toContain('index("idx_staff_access_events_appointment").on(t.appointmentId)');
    expect(routerSource).toContain("appointmentId,");
    expect(routerSource).toContain("workflowFromState: currentAppointment.workflowState");
    expect(routerSource).toContain("workflowToState: fields.workflowState");
    expect(routerSource).toContain("appointmentId: staffAccessEvents.appointmentId");
  });

  it("provides administrator audit filters, chronological sort, review highlighting and a filtered CSV export", () => {
    expect(staffSource).toContain('const [activitySearch, setActivitySearch] = useState("")');
    expect(staffSource).toContain('const [activityType, setActivityType] = useState("all")');
    expect(staffSource).toContain('const [activityScope, setActivityScope] = useState<"selected_dates" | "all_time">("selected_dates")');
    expect(staffSource).toContain('const [activitySort, setActivitySort] = useState<"newest" | "oldest">("newest")');
    expect(staffSource).toContain("const filteredActivity = accessHistory");
    expect(staffSource).toContain("const reviewFindingsForActivity");
    expect(staffSource).toContain("Timing review trigger");
    expect(staffSource).toContain("Triggered review details");
    expect(staffSource).toContain("exportActivityCsv");
    expect(staffSource).toContain("groomigo-${staffNameForFile}-activity-audit.csv");
    expect(staffSource).toContain("No staff activity matches these filters.");
  });
});
