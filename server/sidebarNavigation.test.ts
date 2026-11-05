import { describe, expect, it } from "vitest";
import { SIDEBAR_LAYOUT, sidebarEntriesFor, groupContaining } from "@shared/sidebarNavigation";
import { STAFF_OPERATION_ROUTES } from "@shared/staffRoutes";

const all = new Set([
  "/calendar", "/workflow", "/clients", "/memberships", "/pricing",
  "/messages", "/portal-messages", "/email-campaigns",
  "/analytics", "/reporting", "/staff", "/christmas",
]);

describe("sidebarEntriesFor", () => {
  it("lays the sidebar out in the order Andy gave", () => {
    const entries = sidebarEntriesFor(all);
    expect(entries.map((e) => (e.kind === "item" ? e.path : e.key))).toEqual([
      "/calendar", "/workflow", "/clients",
      "financials", "communication", "insights",
      "/staff", "/christmas",
    ]);
  });

  it("keeps each group's rows in the order they were given", () => {
    const entries = sidebarEntriesFor(all);
    const groups = Object.fromEntries(
      entries.filter((e) => e.kind === "group").map((e: any) => [e.key, e.paths]),
    );
    expect(groups.financials).toEqual(["/memberships", "/pricing"]);
    expect(groups.communication).toEqual(["/messages", "/portal-messages", "/email-campaigns"]);
    expect(groups.insights).toEqual(["/analytics", "/reporting"]);
  });

  /**
   * The case this function exists for. A restricted groomer sees four
   * operational screens; Financials then holds exactly one row and the
   * other two groups hold none, so they must not be drawn at all. A
   * group that opens onto nothing is worse than no group.
   */
  it("drops a group whose rows this person cannot see", () => {
    const entries = sidebarEntriesFor(new Set(STAFF_OPERATION_ROUTES));
    const keys = entries.map((e) => (e.kind === "item" ? e.path : e.key));
    expect(keys).not.toContain("communication");
    expect(keys).not.toContain("insights");
    const financials = entries.find((e) => e.kind === "group") as any;
    expect(financials.key).toBe("financials");
    expect(financials.paths).toEqual(["/memberships"]);
  });

  it("never invents a row the person was not given", () => {
    const entries = sidebarEntriesFor(new Set(["/calendar"]));
    expect(entries).toEqual([{ kind: "item", path: "/calendar" }]);
  });

  it("draws nothing at all for nobody", () => {
    expect(sidebarEntriesFor(new Set())).toEqual([]);
  });

  /**
   * A page added to the nav and forgotten here should still appear.
   * Vanishing silently is how a feature ships and nobody can reach it.
   */
  it("appends a permitted path the layout does not mention", () => {
    const entries = sidebarEntriesFor(new Set(["/calendar", "/brand-new"]));
    expect(entries).toContainEqual({ kind: "item", path: "/brand-new" });
  });

  it("puts the Christmas row last, and only when it is permitted", () => {
    const withIt = sidebarEntriesFor(all);
    expect(withIt[withIt.length - 1]).toEqual({ kind: "item", path: "/christmas" });
    const without = sidebarEntriesFor(new Set([...all].filter((p) => p !== "/christmas")));
    expect(without.map((e) => (e.kind === "item" ? e.path : e.key))).not.toContain("/christmas");
  });

  /** Every grouped path must be a real destination, not a typo. */
  it("groups only paths that the layout also treats as pages", () => {
    const grouped = SIDEBAR_LAYOUT.flatMap((e) => (e.kind === "group" ? e.paths : []));
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const path of grouped) expect(path.startsWith("/")).toBe(true);
  });
});

describe("groupContaining", () => {
  it("finds the group a page sits in, so the sidebar can open it", () => {
    expect(groupContaining("/reporting")).toBe("insights");
    expect(groupContaining("/pricing")).toBe("financials");
    expect(groupContaining("/portal-messages")).toBe("communication");
  });

  it("returns null for a row that is not in a group", () => {
    expect(groupContaining("/calendar")).toBeNull();
    expect(groupContaining("/nowhere")).toBeNull();
  });
});
