import { describe, expect, it } from "vitest";
import { canStaffUpdateAppointment } from "./staffPortalAccess";
import { canApprovedStaffAccessPortal, isLinkedStaffUser } from "../shared/staffInvitation";
import { readFileSync } from "node:fs";

describe("canStaffUpdateAppointment", () => {
  const appointment = { staffId: 4, bathStaffId: 7, dryStaffId: 8 };

  it("allows the assigned groomer, bather, and dryer", () => {
    expect(canStaffUpdateAppointment(4, appointment)).toBe(true);
    expect(canStaffUpdateAppointment(7, appointment)).toBe(true);
    expect(canStaffUpdateAppointment(8, appointment)).toBe(true);
  });

  it("denies an unrelated staff member", () => {
    expect(canStaffUpdateAppointment(99, appointment)).toBe(false);
  });

  it("requires the restricted staff role and administrator approval before portal operations", () => {
    expect(canApprovedStaffAccessPortal("staff", "approved")).toBe(true);
    expect(canApprovedStaffAccessPortal("staff", "invited")).toBe(false);
    expect(canApprovedStaffAccessPortal("staff", "awaiting_approval")).toBe(false);
    expect(canApprovedStaffAccessPortal("user", "approved")).toBe(false);
  });

  it("only permits an existing account to be reused when it is linked to the same staff profile", () => {
    expect(isLinkedStaffUser(42, 42)).toBe(true);
    expect(isLinkedStaffUser(42, 99)).toBe(false);
    expect(isLinkedStaffUser(null, 42)).toBe(false);
  });

  it("keeps revoked existing-account reinvitation approval-gated", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain('member.portalStatus === "revoked" && isLinkedStaffUser(member.userId, existing?.id)');
    expect(routerSource).toContain('member.portalStatus === "invited" && isLinkedStaffUser(member.userId, existing?.id)');
    expect(routerSource).toContain('portalStatus: "awaiting_approval"');
  });

  it("permits approved staff across their salon operations and controlled membership setup while preserving administrator-only financial and email controls", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const dashboardSource = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
    expect(routerSource).toContain("requireApprovedStaffAppointmentAccess");
    expect(routerSource).toContain("deleteAppointment: operationalProcedure");
    expect(routerSource).toContain("undoDeleteAppointment: operationalProcedure");
    expect(routerSource).toContain("This appointment is not available to your salon staff profile");
    expect(routerSource).toContain('Only administrators can email grooming cards to clients');
    expect(dashboardSource).toContain("staffOperationMenuItems");
    expect(dashboardSource).toContain('[' + '"/calendar", "/workflow", "/memberships"' + ']');
  });

  it("treats Bathers as first-class approved operations users without opening administrator areas", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const staffSource = readFileSync(new URL("../client/src/pages/Staff.tsx", import.meta.url), "utf8");
    const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    expect(schemaSource).toContain('"owner", "groomer", "bather", "receptionist", "manager"');
    expect(routerSource).toContain("createAppointment: operationalProcedure");
    expect(routerSource).toContain("updateDetails: operationalProcedure");
    expect(routerSource).toContain("updateStage: operationalProcedure");
    expect(routerSource).not.toContain('portalStaff.role === "groomer"');
    expect(staffSource).toContain("Bathers and groomers have the same approved operational access to appointment details and Workflow.");
  });

  it("allows approved Groomers and Bathers to create tenant-scoped family links from Workflow", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("linkPets: operationalProcedure");
    expect(routerSource).toContain("searchPets: operationalProcedure");
    expect(routerSource).toContain("requireApprovedFamilyLinkStaff(db, ctx.user)");
    expect(routerSource).toContain('portalStaff.role !== "groomer" && portalStaff.role !== "bather"');
    expect(routerSource).toContain("Family links are limited to dogs in your salon");
    expect(routerSource).toContain("eq(pets.tenantId, portalStaff.tenantId)");
    expect(routerSource).toContain("tenantId, name: input.groupName ?? null");
  });

  it("allows approved staff to search only their salon clients while creating an appointment", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("searchClients: operationalProcedure");
    expect(routerSource).toContain("requireApprovedStaffTenant(db, ctx.user)");
    expect(routerSource).toContain("Client search is limited to your salon");
    expect(routerSource).toContain("const tenantId = portalStaff?.tenantId ?? input.tenantId");
  });

  it("allows approved staff to create tenant-scoped bookings and grooming notes without opening client messaging", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("createAppointment: operationalProcedure");
    expect(routerSource).toContain("createMultiPetAppointment: operationalProcedure");
    expect(routerSource).toContain("The selected client and pets are not available to this salon");
    expect(routerSource).toContain("listByClient: operationalProcedure");
    expect(routerSource).toContain("This client is not available to your salon staff profile");
    expect(routerSource).toContain("const groomStyleNotesRouter = router({\n  listByPet: operationalProcedure");
    expect(routerSource).toContain("staffId: portalStaff?.id ?? input.staffId ?? null");
    expect(routerSource).toContain("getSessionReports: operationalProcedure");
    expect(routerSource).toContain("Only administrators can email grooming cards to clients");
  });

  it("renders approved staff operations routes and redirects unauthenticated sessions instead of holding the layout skeleton", () => {
    const dashboardSource = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
    expect(dashboardSource).toContain('if (!user) {\n      if (window.location.pathname !== "/login") window.location.href = "/login";');
    expect(dashboardSource).toContain('if (user.role === "staff" && !["/calendar", "/workflow", "/memberships"].includes(window.location.pathname))');
    expect(dashboardSource).not.toContain('if (user.role === "staff") {\n    const isStaffOperationRoute');
  });

  it("keeps the TV workflow display on a separate route and opens it independently of the controller board", () => {
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8")
      + readFileSync(new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url), "utf8");
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    expect(appSource).toContain('<Route path="/workflow/display" component={WorkflowDisplay} />');
    expect(boardSource).toContain('href="/workflow/display" target="_blank"');
    expect(displaySource).toContain("Independent read-only display");
    expect(displaySource).toContain("controller changes do not navigate or replace this display");
  });

  it("keeps long TV appointment lists hands-free and readable from a distance", () => {
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    expect(displaySource).toContain('aria-label="Auto-scrolling live appointment list"');
    expect(displaySource).toContain("beginScrollCycle");
    expect(displaySource).toContain("Salon time");
    expect(displaySource).toContain("Clock3");
    // Stage colour and the running-late signal now come from the shared table:
    // a coloured stage chip, plus amber/red row tinting past the thresholds.
    const sharedTable = readFileSync(new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url), "utf8");
    expect(sharedTable).toContain("style={{ background: stage.colour }}");
    expect(sharedTable).toContain('timerAlert ? "bg-red-50/40"');
    expect(sharedTable).toContain('timerWarn ? "bg-amber-50/30"');
    // Alternating row striping is what keeps a long list readable across a room.
    // It now comes from the shared table, so the wall display stripes exactly as
    // the staff board does.
    expect(readFileSync(new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url), "utf8"))
      .toContain('idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"');
    expect(displaySource).toContain("useDisplayTheme");
  });

  it("renders all three board surfaces from one shared table", () => {
    const tableSource = readFileSync(new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url), "utf8");
    const boardSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");

    // The point of this test. There were three board tables — the staff board,
    // the TV overlay and the wall display — written separately and drifting.
    // The wall display ended up with seven columns against the board's fifteen,
    // missing the dog photos, family links, cage and tag, bath priority and
    // membership. One component now renders all three.
    expect(tableSource).toContain("export function WorkflowBoardTable(");
    for (const source of [boardSource, displaySource]) {
      expect(source).toContain('from "@/components/WorkflowBoardTable"');
      expect(source).toContain("<WorkflowBoardTable");
    }
    // Two read-only surfaces (TV overlay, wall display) and one interactive.
    expect(boardSource.match(/<WorkflowBoardTable/g)).toHaveLength(2);
    expect(displaySource.match(/<WorkflowBoardTable/g)).toHaveLength(1);
    expect(boardSource).toContain("actions={{");
    expect(displaySource).toContain("readOnly");
    // A second table would mean a copy is back.
    expect(tableSource.match(/min-w-\[980px\]/g)).toHaveLength(1);
    expect(boardSource).not.toContain("min-w-[980px]");
    expect(displaySource).not.toContain("min-w-[980px]");

    // Read-only keeps every cell's appearance and drops only the ability to
    // change anything — a wall display has nobody to click it.
    expect(tableSource).toContain("draggable={!readOnly}");
    expect(tableSource).toContain("{!readOnly && (<>");
    expect(tableSource).toContain('<span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded border border-emerald-300">READY</span>');
    for (const prop of ['tone="cage"', 'tone="tag"', 'placeholder="Bath"', 'placeholder="Dry"', 'placeholder="Groomer"']) {
      expect(tableSource).toContain(`${prop}\n                        readOnly={readOnly}`);
    }

    // What staff actually asked for, on every surface: the photos and the
    // family linkage the wall display never had.
    expect(tableSource).toContain("<PetAvatar petId={appt.petId} petName={appt.petName}");
    expect(tableSource).toContain("<StaffAvatar photoUrl={selected.photoUrl}");
    expect(tableSource).toContain("petFamilyGroupId");
    // The display needs its own staff query to resolve those staff photos.
    expect(displaySource).toContain("trpc.workflow.getStaff.useQuery");

    // The wall display keeps what makes it a wall display.
    expect(displaySource).toContain('aria-label="Auto-scrolling live appointment list"');
    expect(displaySource).toContain("focusRegisterZoom");
  });

  it("summarises salon workload, flags past scheduled appointments and exposes controlled TV scrolling", () => {
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    expect(displaySource).toContain("const waitingRows");
    expect(displaySource).toContain("const inProgressCount");
    expect(displaySource).toContain("const completedRows");
    expect(displaySource).toContain("dailyCompletionPercent");
    expect(displaySource).toContain("Auto-scroll:");
    expect(displaySource).toContain('{ label: "Off", tickMs: null }');
    expect(displaySource).toContain('if (scrollIntervalMs === null) return;');
    expect(displaySource).toContain("TOP_PAUSE_MS");
    expect(displaySource).toContain("BOTTOM_PAUSE_MS");
  });

  it("keeps completed dogs out of the active TV register and enlarges the remaining small workload", () => {
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    expect(displaySource).toContain("!isTerminalWorkflowState(row.workflowState)");
    // Few dogs left: the display scales the whole board up rather than
    // restyling each cell, so it cannot drift from the table it is scaling.
    expect(displaySource).toContain("const isFocusRegister = activeRows.length > 0 && activeRows.length <= 4");
    expect(displaySource).toContain("const focusRegisterZoom = isFocusRegister ? 1.35 : 1;");
    expect(displaySource).toContain("style={{ zoom: focusRegisterZoom }}");
    expect(displaySource).toContain("All dogs are complete");
  });

  it("provides a graceful completed-dog exit, review toggle and celebratory all-complete screen", () => {
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    // Completed dogs are dimmed by the shared table rather than faded out by a
    // bespoke animation the display used to own.
    expect(readFileSync(new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url), "utf8"))
      .toContain('isComplete ? "bg-slate-50 opacity-60"');
    expect(displaySource).toContain("Review completed dogs");
    expect(displaySource).toContain("Hide completed dogs");
    expect(displaySource).toContain("All dogs are complete");
    expect(displaySource).toContain("A great day’s work from the Barkin Beautiful team.");
  });

  it("adds daily progress, an explicit completed-dog restore and a next-day TV reset", () => {
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(displaySource).toContain("dailyCompletionPercent");
    expect(displaySource).toContain('aria-label="Daily completion progress"');
    expect(displaySource).toContain("Reset for tomorrow");
    expect(displaySource).toContain("setBoardDate");
    expect(displaySource).toContain('newState: "ready"');
    // Undoing a mis-tapped OUT is the display's one permitted mutation, so it
    // survives the move into the shared table.
    expect(displaySource).toContain("onRestoreCompleted={restoreCompletedDog}");
    expect(readFileSync(new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url), "utf8"))
      .toContain('{restorePending ? "…" : "Undo"}');
    expect(routerSource).toContain('actualEnd: input.newState === "complete" ? new Date(now) : appt.workflowState === "complete" ? null : appt.actualEnd');
  });

  it("renders a scannable TV display QR shortcut without bypassing sign-in", () => {
    const displaySource = readFileSync(new URL("../client/src/pages/WorkflowDisplay.tsx", import.meta.url), "utf8");
    expect(displaySource).toContain('import { QRCodeSVG } from "qrcode.react"');
    expect(displaySource).toContain('`${window.location.origin}/workflow/display`');
    expect(displaySource).toContain('aria-label="TV display QR access"');
    expect(displaySource).toContain("Scan to open TV display");
    expect(displaySource).toContain("Sign-in is still required.");
  });

  it("exposes clear staff invitation actions, role configuration and invitation-status badges", () => {
    const staffSource = readFileSync(new URL("../client/src/pages/Staff.tsx", import.meta.url), "utf8");
    expect(staffSource).toContain("PORTAL_STATUS_META");
    expect(staffSource).toContain('label: "Uninvited"');
    expect(staffSource).toContain('label: "Awaiting approval"');
    expect(staffSource).toContain('"Send invite"');
    expect(staffSource).toContain('"Add email"');
    expect(staffSource).toContain("Salon role");
    expect(staffSource).toContain("Approved mobile users retain Operations access");
  });
});
