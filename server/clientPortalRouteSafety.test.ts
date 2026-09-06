import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const portalPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/ClientPortal.tsx"), "utf8");
const portalStart = routerSource.indexOf("// ─── Client portal");
const portalRouter = routerSource.slice(portalStart, routerSource.indexOf("// ─── App Router", portalStart));

describe("client portal route safety", () => {
  it("requires an administrator to issue a link and revokes the preceding active link", () => {
    expect(portalRouter).toContain("getAccessStatus: adminProcedure");
    expect(portalRouter).toContain("revokeAccess: adminProcedure");
    expect(portalRouter).toContain("issueAccessLink: adminProcedure");
    expect(portalRouter).toContain('set({ status: "revoked" })');
    expect(portalRouter).toContain("manualShareOnly: true");
    expect(portalRouter).not.toContain("sendEmail(");
    expect(portalRouter).not.toContain("sendSms(");
  });

  it("limits public portal data to the token-linked client and approved grooming cards", () => {
    expect(portalRouter).toContain("eq(clientPortalAccess.tokenHash, hashClientPortalToken(input.token))");
    expect(portalRouter).toContain("eq(appointments.clientId, access.clientId)");
    expect(portalRouter).toContain('eq(groomingReports.status, "sent")');
    expect(portalRouter).not.toContain("groomerNotes: groomingReports.groomerNotes");
  });

  it("keeps the client page separate from staff dashboard navigation and payment actions", () => {
    expect(portalPageSource).not.toContain("DashboardLayout");
    expect(portalPageSource).not.toContain("Payment");
    expect(portalPageSource).not.toContain("Book Appointment");
  });
});
