import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const calendarSource = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

describe("grooming card and last completed style", () => {
  it("limits the reusable style snapshot to a completed appointment", () => {
    expect(routerSource).toContain("getLastCompletedStyle");
    expect(routerSource).toContain("innerJoin(appointments, eq(groomStyleNotes.appointmentId, appointments.id))");
    expect(routerSource).toContain('eq(appointments.workflowState, "complete")');
    expect(routerSource).toContain("orderBy(desc(appointments.completedAt), desc(groomStyleNotes.createdAt))");
  });

  it("keeps the current completed snapshot separate from full grooming history", () => {
    expect(calendarSource).toContain("Last completed groom");
    expect(calendarSource).toContain("Full style history");
    expect(calendarSource).toContain("Use last style");
    expect(calendarSource).toContain("save as a new style");
  });

  it("shows the groomer in the card and requires a manual confirmed email action", () => {
    expect(calendarSource).toContain("Groomed by");
    expect(calendarSource).toContain("Email card");
    expect(calendarSource).toContain("window.confirm");
    expect(routerSource).toContain("saved email address");
  });
});
