import { describe, it, expect } from "vitest";
import {
  STAFF_ROLES, ROLE_DEFAULTS, isStaffRole, defaultEditSections, defaultViewSections,
  roleCanEdit, roleCanView, matchesRoleDefaults,
} from "@shared/staffRoleDefaults";
import { STAFF_SECTION_KEYS, isStaffSection } from "@shared/staffPermissions";

describe("the roles themselves", () => {
  it("matches the titles the schema allows", () => {
    // drizzle/schema.ts: staff.role is this exact enum. A title here that
    // the column rejects would fail only on save.
    expect([...STAFF_ROLES].sort()).toEqual(
      ["bather", "groomer", "manager", "owner", "receptionist"]);
    expect(isStaffRole("owner")).toBe(true);
    expect(isStaffRole("Owner")).toBe(false);
    expect(isStaffRole("boss")).toBe(false);
  });

  it("gives every role a default, so no title silently grants nothing", () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_DEFAULTS[role]).toBeDefined();
      expect(defaultViewSections(role).length).toBeGreaterThan(0);
    }
  });

  it("only names real sections", () => {
    for (const role of STAFF_ROLES) {
      for (const s of [...ROLE_DEFAULTS[role].edit, ...ROLE_DEFAULTS[role].viewOnly]) {
        expect(isStaffSection(s)).toBe(true);
      }
    }
  });

  it("never lists a section as both editable and read-only", () => {
    for (const role of STAFF_ROLES) {
      const { edit, viewOnly } = ROLE_DEFAULTS[role];
      for (const s of viewOnly) expect(edit).not.toContain(s);
    }
  });
});

describe("what Lauren asked for", () => {
  it("Owner gets everything", () => {
    expect(defaultEditSections("owner")).toEqual([...STAFF_SECTION_KEYS]);
  });

  it("Manager is an Owner minus staff revenue targets", () => {
    // "all the same permissions as an owner, but cannot see staff revenue
    // targets (unless Lauren chooses to give this permission)".
    expect(roleCanEdit("manager", "revenue_targets")).toBe(false);
    expect(roleCanView("manager", "revenue_targets")).toBe(false);
    const missing = defaultEditSections("owner")
      .filter((s) => !defaultEditSections("manager").includes(s));
    expect(missing).toEqual(["revenue_targets"]);
  });

  it("Groomer runs the salon but not its people", () => {
    for (const s of ["appointments", "pricing", "clients", "mass_text", "analytics",
      "workflow", "memberships", "messages", "email_campaigns"] as const) {
      expect(roleCanEdit("groomer", s)).toBe(true);
    }
    // "no ability to change any staff details except for their own" —
    // their own goes through staff.updateMyProfile, which nothing gates.
    expect(roleCanEdit("groomer", "staff")).toBe(false);
    expect(roleCanEdit("groomer", "revenue_targets")).toBe(false);
  });

  it("Bather works the floor and reads the records", () => {
    // "must be able to move the workflow board around and change any
    // client appointments"
    expect(roleCanEdit("bather", "workflow")).toBe(true);
    expect(roleCanEdit("bather", "appointments")).toBe(true);
    // "view access only to anything in the clients, memberships tabs"
    expect(roleCanView("bather", "clients")).toBe(true);
    expect(roleCanEdit("bather", "clients")).toBe(false);
    expect(roleCanView("bather", "memberships")).toBe(true);
    expect(roleCanEdit("bather", "memberships")).toBe(false);
    // Nowhere near pricing or people.
    expect(roleCanView("bather", "pricing")).toBe(false);
    expect(roleCanView("bather", "staff")).toBe(false);
  });

  it("no role below Owner can see revenue targets by default", () => {
    for (const role of STAFF_ROLES) {
      if (role === "owner") continue;
      expect(roleCanView(role, "revenue_targets")).toBe(false);
    }
  });

  it("no role below Manager can change staff records", () => {
    for (const role of ["groomer", "bather", "receptionist"] as const) {
      expect(roleCanEdit(role, "staff")).toBe(false);
    }
  });
});

describe("view and edit", () => {
  it("counts an editable section as viewable too", () => {
    expect(roleCanView("bather", "appointments")).toBe(true);
    expect(defaultViewSections("bather")).toEqual(
      ["appointments", "workflow", "memberships", "clients"]
        .sort((a, b) => STAFF_SECTION_KEYS.indexOf(a as never) - STAFF_SECTION_KEYS.indexOf(b as never)) as never);
  });

  it("returns viewable sections in canonical order", () => {
    const out = defaultViewSections("groomer");
    const order = out.map((s) => STAFF_SECTION_KEYS.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("matchesRoleDefaults", () => {
  it("recognises an untouched grant", () => {
    expect(matchesRoleDefaults("bather", defaultEditSections("bather"))).toBe(true);
    expect(matchesRoleDefaults("owner", defaultEditSections("owner"))).toBe(true);
  });

  it("spots an override in either direction", () => {
    expect(matchesRoleDefaults("bather", ["appointments"])).toBe(false);
    expect(matchesRoleDefaults("bather", ["appointments", "workflow", "pricing"])).toBe(false);
  });

  it("does not care what order they are stored in", () => {
    expect(matchesRoleDefaults("bather", ["workflow", "appointments"])).toBe(true);
  });
});
