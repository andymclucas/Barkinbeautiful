import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Workflow bathing priority contract", () => {
  const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
  const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
  const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");

  it("persists only the controlled 1–5 priorities and audits staff changes", () => {
    expect(schemaSource).toContain('bathPriority: int("bath_priority")');
    expect(schemaSource).toContain('bathGroupId: varchar("bath_group_id"');
    expect(schemaSource).toContain('bathQueueOrder: int("bath_queue_order")');
    expect(schemaSource).toContain('"bath_priority_updated"');
    expect(routerSource).toContain("setBathPriority: operationalProcedure");
    expect(routerSource).toContain("z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)");
    expect(routerSource).toContain('eventType: "bath_priority_updated"');
  });

  it("allows priority changes throughout active workflow and only propagates within a shared booking or same-time linked family group", () => {
    expect(routerSource).toContain("eq(appointments.sessionId, appointment.sessionId)");
    expect(routerSource).toContain("eq(pets.familyGroupId, appointment.petFamilyGroupId)");
    expect(routerSource).toContain("eq(appointments.scheduledStart, appointment.scheduledStart)");
    expect(routerSource).toContain("isBathPriorityMutable(appointment.workflowState)");
    expect(routerSource).toContain("Bath priority cannot be changed after a terminal workflow outcome.");
  });

  it("shows the separate priority queue in both controller and read-only display without changing stages", () => {
    expect(boardSource).toContain("Bath queue");
    expect(boardSource).toContain("Priority changes do not move the appointment or change its workflow stage.");
    expect(boardSource).toContain("applyToLinkedDogs: true");
    expect(displaySource).toContain("Bath queue");
    expect(displaySource).toContain("Priority guides bathing order without changing the scheduled workflow.");
  });

  it("provides drag reordering, explicit coordinated bath groups and colour-coded priorities", () => {
    expect(routerSource).toContain("setBathGroup: operationalProcedure");
    expect(routerSource).toContain("reorderBathQueue: operationalProcedure");
    expect(routerSource).toContain("The bath queue has changed. Refresh and try reordering again.");
    expect(boardSource).toContain("data-bath-queue-item");
    expect(boardSource).toContain("Coordinate bathing");
    expect(boardSource).toContain("BATH_PRIORITY_META");
    expect(displaySource).toContain("BATH_PRIORITY_META");
  });
});
