import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import { CLIENT_PORTAL_COOKIE_NAME, COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import {
  clearClientPortalSessionCookie,
  createClientPortalSessionToken,
  readClientPortalSession,
  verifyClientPortalSessionToken,
} from "./clientPortalSession";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const sessionSource = readFileSync(resolve(process.cwd(), "server/clientPortalSession.ts"), "utf8");
const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const staffAuthSource = readFileSync(resolve(process.cwd(), "server/_core/sdk.ts"), "utf8");
const portalPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/ClientPortal.tsx"), "utf8");
const portalLoginPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/ClientPortalLogin.tsx"), "utf8");
const portalSetupPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/ClientPortalSetup.tsx"), "utf8");
const portalStart = routerSource.indexOf("// ─── Client portal");
const portalRouter = routerSource.slice(portalStart, routerSource.indexOf("// ─── App Router", portalStart));
const originalJwtSecret = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = "client-portal-account-regression-test-secret";
});

afterAll(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe("client portal account login isolation", () => {
  it("uses a distinct versioned client-only cookie and rejects malformed or stale tokens", async () => {
    const token = await createClientPortalSessionToken({ clientId: 42, tenantId: 1, sessionVersion: 3 });
    await expect(verifyClientPortalSessionToken(token)).resolves.toEqual({ clientId: 42, tenantId: 1, sessionVersion: 3 });
    await expect(verifyClientPortalSessionToken("not-a-jwt")).resolves.toBeNull();
    expect(CLIENT_PORTAL_COOKIE_NAME).not.toBe(COOKIE_NAME);
    expect(sessionSource).toContain('typ: "client_portal"');
    expect(sessionSource).toContain("sessionVersion: session.sessionVersion");
    expect(sessionSource).not.toContain("import { COOKIE_NAME");
    expect(sessionSource).not.toContain("cookies.get(COOKIE_NAME)");
  });

  it("reads and clears only the dedicated client portal cookie", async () => {
    const token = await createClientPortalSessionToken({ clientId: 4, tenantId: 1, sessionVersion: 0 });
    const request = { protocol: "https", headers: { cookie: `${COOKIE_NAME}=staff-session; ${CLIENT_PORTAL_COOKIE_NAME}=${encodeURIComponent(token)}` } } as Request;
    await expect(readClientPortalSession(request)).resolves.toEqual({ clientId: 4, tenantId: 1, sessionVersion: 0 });

    const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
    const response = { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) } as unknown as Response;
    clearClientPortalSessionCookie(response, request);
    expect(cleared).toEqual([{ name: CLIENT_PORTAL_COOKIE_NAME, options: expect.objectContaining({ httpOnly: true, path: "/", sameSite: "none", secure: true, maxAge: -1 }) }]);
  });

  it("keeps staff authentication limited to its own session cookie name", () => {
    expect(staffAuthSource).toContain("cookies.get(COOKIE_NAME)");
    expect(staffAuthSource).not.toContain(CLIENT_PORTAL_COOKIE_NAME);
    expect(staffAuthSource).not.toContain("client_portal");
  });

  it("denies calendar, workflow, client administration and account-administration calls when only a client cookie is present", async () => {
    const token = await createClientPortalSessionToken({ clientId: 4, tenantId: 1, sessionVersion: 0 });
    const ctx = {
      user: null,
      req: { protocol: "https", headers: { cookie: `${CLIENT_PORTAL_COOKIE_NAME}=${encodeURIComponent(token)}` } } as Request,
      res: {} as Response,
    } as TrpcContext;
    const caller = appRouter.createCaller(ctx);

    await expect(caller.calendar.getAppointments({ tenantId: 1, dateFrom: "2026-09-01", dateTo: "2026-09-01" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workflow.getTodayBoard({ tenantId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clients.list({ tenantId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientPortal.getAccountStatus({ clientId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires an administrator for client account setup or revocation and never delivers links automatically", () => {
    expect(portalRouter).toContain("getAccountStatus: adminProcedure");
    expect(portalRouter).toContain("issueAccountSetupLink: adminProcedure");
    expect(portalRouter).toContain("revokeAccount: adminProcedure");
    expect(portalRouter).toContain("manualShareOnly: true as const");
    expect(portalRouter).not.toContain("sendEmail(");
    expect(portalRouter).not.toContain("sendSms(");
  });

  it("requires the explicit portal login email, prevents duplicate assignment and removes credentials on reset paths", () => {
    expect(portalRouter).toContain("eq(clients.portalLoginEmail, loginEmail)");
    expect(portalRouter).not.toContain("or(eq(clients.portalLoginEmail, loginEmail), eq(clients.email, loginEmail))");
    expect(portalRouter).toContain("This email is already assigned to another client portal account");
    expect(schemaSource).toContain("uniqueIndex(\"uq_clients_tenant_portal_login_email\").on(t.tenantId, t.portalLoginEmail)");
    expect(portalRouter).toContain("portalPasswordHash: null");
    expect(portalRouter).toContain("portalSessionVersion: sql`${clients.portalSessionVersion} + 1`");
    expect(portalRouter).toContain("portalAccountStatus: \"setup_pending\"");
    expect(portalRouter).toContain("portalAccountStatus: \"revoked\"");
    expect(portalRouter).toContain("portalAccountStatus: \"not_enabled\"");
  });

  it("scopes account sessions and legacy links to the client, tenant and client-safe portal data", () => {
    expect(portalRouter).toContain("getMyPortal: publicProcedure");
    expect(portalRouter).toContain("readClientPortalSession(ctx.req)");
    expect(portalRouter).toContain("eq(clients.id, session.clientId)");
    expect(portalRouter).toContain("eq(clients.tenantId, session.tenantId)");
    expect(portalRouter).toContain("eq(clients.portalSessionVersion, session.sessionVersion)");
    expect(portalRouter).toContain("eq(pets.clientId, access.clientId)");
    expect(portalRouter).toContain("eq(pets.tenantId, access.tenantId)");
    expect(portalRouter).toContain('eq(groomingReports.status, "sent")');
    expect(portalRouter).toContain("eq(clients.tenantId, clientPortalAccess.tenantId)");
    expect(portalRouter).not.toContain("groomerNotes: groomingReports.groomerNotes");
  });

  it("keeps account, setup and legacy portal pages separate from staff navigation, booking and payments", () => {
    for (const pageSource of [portalPageSource, portalLoginPageSource, portalSetupPageSource]) {
      expect(pageSource).not.toContain("DashboardLayout");
      expect(pageSource).not.toContain("Payment");
      expect(pageSource).not.toContain("Book Appointment");
    }
    expect(portalPageSource).toContain("getPortal.useQuery");
    expect(portalPageSource).toContain("getMyPortal.useQuery");
    expect(portalLoginPageSource).toContain('navigate("/portal")');
    expect(portalSetupPageSource).toContain("completeSetup.useMutation");
  });
});
