import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isStaffOperationRoute, STAFF_OPERATION_ROUTES } from "@shared/staffRoutes";

/**
 * Which pages a restricted `staff` account may open.
 *
 * This replaces two source-text assertions in staffPortalAccess.test.ts
 * that pinned the route list as a literal string. DashboardLayout carried
 * the list twice — the redirect effect and the render guard — and only one
 * copy was pinned, so the two could drift apart unnoticed.
 */
describe("isStaffOperationRoute", () => {
  it("lets restricted staff work the floor", () => {
    expect(isStaffOperationRoute("/calendar")).toBe(true);
    expect(isStaffOperationRoute("/workflow")).toBe(true);
    expect(isStaffOperationRoute("/memberships")).toBe(true);
  });

  it("lets them reach the clients page", () => {
    // Added 13/10/2026 alongside opening clients.create, clients.list and
    // pets.create to operationalProcedure. Without the route the
    // permission change did nothing: staff were bounced to /calendar
    // before the page could load.
    expect(isStaffOperationRoute("/clients")).toBe(true);
  });

  it("keeps them out of the owner's pages", () => {
    for (const path of ["/analytics", "/reporting", "/settings", "/staff", "/pricing", "/campaigns", "/"]) {
      expect(isStaffOperationRoute(path), `${path} must stay closed to restricted staff`).toBe(false);
    }
  });

  it("ignores a query string or a trailing slash", () => {
    // Same page. Bouncing somebody off "/clients?page=2" would be a bug
    // nobody would think to look for.
    expect(isStaffOperationRoute("/clients?page=2")).toBe(true);
    expect(isStaffOperationRoute("/clients/")).toBe(true);
    expect(isStaffOperationRoute("/calendar#today")).toBe(true);
  });

  it("refuses an empty or missing path rather than throwing", () => {
    expect(isStaffOperationRoute(null)).toBe(false);
    expect(isStaffOperationRoute(undefined)).toBe(false);
    expect(isStaffOperationRoute("")).toBe(false);
  });

  it("is the only copy of the list, and both guards use it", () => {
    // The drift this prevents: the list used to appear twice in
    // DashboardLayout and the old test pinned one of them.
    const layout = readFileSync(
      new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
    // Three guards: the redirect effect, the render guard, and the
    // sidebar filter. The sidebar one was a copy nobody had pinned — a
    // link to a page you get bounced off is worse than no link.
    expect(layout.split("isStaffOperationRoute(").length - 1).toBe(3);
    expect(layout).not.toContain('["/calendar", "/workflow", "/memberships"]');
    expect(STAFF_OPERATION_ROUTES).toHaveLength(4);
  });
});
