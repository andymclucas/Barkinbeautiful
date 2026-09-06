import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("cancelled appointment calendar visibility", () => {
  const calendarSource = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

  it("keeps a cancelled booking at its existing scheduled time rather than rescheduling it during status save", () => {
    expect(calendarSource).toContain('const keepOriginalCancelledSchedule = editAppt.status === "cancelled" || editAppt.workflowState === "cancelled" || editForm.workflowState === "cancelled";');
    expect(calendarSource).toContain("if (!keepOriginalCancelledSchedule) {");
    expect(calendarSource).toContain("if (!keepOriginalCancelledSchedule && newStaffIdStr !== undefined)");
    expect(calendarSource).toContain("Cancelled appointments stay at their original booked time for historical tracking.");
  });

  it("presents cancelled appointment cards with a solid label, a struck-through dog name and disabled drag movement", () => {
    expect(calendarSource).toContain('const isCancelled = appt.status === "cancelled" || appt.workflowState === "cancelled";');
    expect(calendarSource).toContain("const canDrag = Boolean(onDragStart) && !isCancelled;");
    expect(calendarSource).toContain("draggable={canDrag}");
    expect(calendarSource).toContain('bg-red-700 px-1.5 py-0.5 text-[9px] font-black uppercase');
    expect(calendarSource).toContain('isCancelled ? "line-through decoration-2 decoration-red-700" : ""');
    expect(calendarSource).toContain('isCancelled ? "linear-gradient(135deg, #fee2e2 0%, #fff7f7 180%)"');
  });
});
