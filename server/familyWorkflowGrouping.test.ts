import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupFamilyWorkflowRows } from "../shared/familyWorkflowGrouping";
import { getFamilySessionTimeAlignments } from "../shared/familyAppointmentAlignment";

const at = (time: string) => `2026-09-02T${time}:00.000Z`;

describe("family Workflow grouping", () => {
  it("keeps linked family pets adjacent when they share an appointment session, anchored to the earliest recorded time", () => {
    const rows = groupFamilyWorkflowRows([
      { id: 1, scheduledStart: at("08:00"), petFamilyGroupId: 42, sessionId: "family-session" },
      { id: 2, scheduledStart: at("08:30"), petFamilyGroupId: null, sessionId: null },
      { id: 3, scheduledStart: at("18:00"), petFamilyGroupId: 42, sessionId: "family-session" },
      { id: 4, scheduledStart: at("09:00"), petFamilyGroupId: null, sessionId: null },
    ]);

    expect(rows.map(row => row.id)).toEqual([1, 3, 2, 4]);
    expect(rows[1]?.scheduledStart).toBe(at("18:00"));
  });

  it("does not group separate appointments merely because their pets share a family link", () => {
    const rows = groupFamilyWorkflowRows([
      { id: 1, scheduledStart: at("08:00"), petFamilyGroupId: 42, sessionId: null },
      { id: 2, scheduledStart: at("08:30"), petFamilyGroupId: null, sessionId: null },
      { id: 3, scheduledStart: at("18:00"), petFamilyGroupId: 42, sessionId: null },
    ]);

    expect(rows.map(row => row.id)).toEqual([1, 2, 3]);
  });

  it("groups family-linked pets with the same recorded appointment time even without a legacy session identifier", () => {
    const rows = groupFamilyWorkflowRows([
      { id: 4, scheduledStart: at("10:00"), petFamilyGroupId: null, sessionId: null },
      { id: 1, scheduledStart: at("08:00"), petFamilyGroupId: 42, sessionId: null },
      { id: 2, scheduledStart: at("08:00"), petFamilyGroupId: 42, sessionId: null },
      { id: 3, scheduledStart: at("08:30"), petFamilyGroupId: null, sessionId: null },
    ]);

    expect(rows.map(row => row.id)).toEqual([1, 2, 3, 4]);
  });

  it("uses the same family ordering on the controller and independent Workflow display", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    expect(routerSource).toContain("sessionId: appointments.sessionId");
    expect(boardSource).toContain("groupFamilyWorkflowRows((boardData ?? []).filter");
    expect(boardSource).toContain("Dogs linked as family!");
    expect(displaySource).toContain("const dayRows = groupFamilyWorkflowRows(boardData ?? [])");
  });

  it("aligns only later active appointments in a family shared session, while preserving past and terminal records", () => {
    const now = new Date("2026-09-02T00:00:00.000Z").getTime();
    const alignments = getFamilySessionTimeAlignments([
      { id: 1, petFamilyGroupId: 42, sessionId: "family-session", scheduledStart: "2026-09-01T22:00:00.000Z", scheduledEnd: "2026-09-02T00:00:00.000Z", status: "pending", workflowState: "grooming" },
      { id: 2, petFamilyGroupId: 42, sessionId: "family-session", scheduledStart: "2026-09-02T08:00:00.000Z", scheduledEnd: "2026-09-02T10:00:00.000Z", status: "pending", workflowState: "ready" },
      { id: 3, petFamilyGroupId: 42, sessionId: "family-session", scheduledStart: "2026-09-02T12:00:00.000Z", scheduledEnd: "2026-09-02T13:00:00.000Z", status: "confirmed", workflowState: "complete" },
      { id: 4, petFamilyGroupId: 42, sessionId: "separate-session", scheduledStart: "2026-09-02T08:00:00.000Z", scheduledEnd: "2026-09-02T10:00:00.000Z", status: "pending", workflowState: "scheduled" },
    ], now);

    expect(alignments).toHaveLength(1);
    expect(alignments[0]).toMatchObject({ appointmentId: 2 });
    expect(alignments[0]?.scheduledStart.toISOString()).toBe("2026-09-01T22:00:00.000Z");
    expect(alignments[0]?.scheduledEnd.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });

  it("runs future shared-family alignment from the family-link action without rescheduling unrelated family bookings", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("const timeAlignments = getFamilySessionTimeAlignments(linkedAppointments)");
    expect(routerSource).toContain("alignedAppointmentIds: timeAlignments.map");
    expect(routerSource).toContain("eq(pets.familyGroupId, resolvedGroupId), eq(appointments.tenantId, tenantId)");
  });

  it("returns all family dog names and makes the Workflow family control explicit and accessible", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
    expect(routerSource).toContain("familyPetNames: row.petFamilyGroupId");
    expect(routerSource).toContain("familyPetNamesByGroup");
    expect(boardSource).toContain("<Link2 className=");
    expect(boardSource).toContain("const familyTooltip = linkedPetNames.length > 0");
    expect(boardSource).toContain("Family linked:");
    expect(boardSource).toContain("Manage or unlink");
  });

  it("allows approved staff to unlink only the selected dog from its family without altering booking or workflow history", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
    expect(routerSource).toContain("unlinkPet: operationalProcedure");
    expect(routerSource).toContain("requireApprovedStaffPetAccess(db, ctx.user, input.petId)");
    expect(routerSource).toContain("set({ familyGroupId: null })");
    expect(boardSource).toContain("Need separate processing?");
    expect(boardSource).toContain("Appointments and workflow history are not changed.");
    expect(boardSource).toContain('"Unlink dog"');
  });

  it("draws an explicit connector only between consecutive Workflow rows in the same family group", () => {
    const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
    expect(boardSource).toContain("const linkedAbove = familyGroupId != null");
    expect(boardSource).toContain("const linkedBelow = familyGroupId != null");
    expect(boardSource).toContain("isolate overflow-visible");
    expect(boardSource).toContain('data-family-bracket="above"');
    expect(boardSource).toContain('data-family-bracket="below"');
    expect(boardSource).toContain("border-b-4 border-l-4 border-slate-800");
    expect(boardSource).toContain("border-l-4 border-t-4 border-slate-800");
    expect(boardSource).toContain("w-12");
    expect(boardSource).toContain('data-family-connector={linkedAbove || linkedBelow ? "connected" : "standalone"}');
  });
});
