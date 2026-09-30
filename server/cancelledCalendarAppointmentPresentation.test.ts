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

  it("still marks a cancelled card clearly and refuses to let it be dragged", () => {
    expect(calendarSource).toContain('const isCancelled = appt.status === "cancelled" || appt.workflowState === "cancelled";');
    expect(calendarSource).toContain("const canDrag = Boolean(onDragStart) && !isCancelled;");
    expect(calendarSource).toContain("draggable={canDrag}");
    // Still labelled and struck through - it must remain identifiable.
    expect(calendarSource).toMatch(/>Cancelled<\/div>/);
    expect(calendarSource).toContain("line-through");
  });

  it("makes a cancelled card recede rather than dominate the board", () => {
    // Cancelled bookings used to be the loudest thing on the calendar: a red
    // wash, a red 4px spine, a red shadow and a white-on-red badge, so a dog
    // who was NOT coming drew more attention than the ones who were. They are
    // now faded and neutral. Asserted as the absence of the red treatment plus
    // the presence of the fade, rather than one exact gradient string.
    expect(calendarSource).toContain("opacity: isCancelled ? 0.45 : 1");
    expect(calendarSource).toContain('isCancelled ? "dashed #cbd5e1"');
    expect(calendarSource).not.toContain("bg-red-700 px-1.5 py-0.5 text-[9px] font-black uppercase");
    expect(calendarSource).not.toContain("decoration-red-700");
    expect(calendarSource).not.toContain('linear-gradient(135deg, #fee2e2 0%, #fff7f7 180%)');
  });
});
