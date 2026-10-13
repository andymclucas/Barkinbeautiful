import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  platformAccess,
  isApprovedStaffProfile,
  canCreateFamilyLinks,
  ownsTenantRow,
} from "@shared/staffAccessRules";

describe("platformAccess", () => {
  it("lets an admin straight through without a salon lookup", () => {
    // Six of the eight real users are admin, so this is the common path.
    expect(platformAccess("admin")).toEqual({ kind: "unrestricted" });
  });

  it("sends a restricted staff account to its salon profile", () => {
    expect(platformAccess("staff")).toEqual({ kind: "check_profile" });
  });

  it("refuses anyone who is not salon staff", () => {
    // `user` is the platform default and covers a client portal account.
    for (const role of ["user", "", "client", "owner"]) {
      expect(platformAccess(role).kind, `${role} must not reach salon operations`).toBe("denied");
    }
    expect(platformAccess(null).kind).toBe("denied");
    expect(platformAccess(undefined).kind).toBe("denied");
  });
});

describe("isApprovedStaffProfile", () => {
  it("accepts only an approved profile", () => {
    expect(isApprovedStaffProfile("approved")).toBe(true);
  });

  it("refuses everybody not yet let in, or let out again", () => {
    // "invited" and "awaiting_approval" exist but were never admitted;
    // "revoked" was admitted and then removed. Treating any as approved
    // hands the salon floor to somebody nobody let in.
    for (const status of ["invited", "awaiting_approval", "revoked", "", null, undefined]) {
      expect(isApprovedStaffProfile(status as string), `${status} must not pass`).toBe(false);
    }
  });
});

describe("canCreateFamilyLinks", () => {
  it("allows the people standing over the dogs", () => {
    expect(canCreateFamilyLinks("groomer")).toBe(true);
    expect(canCreateFamilyLinks("bather")).toBe(true);
  });

  it("refuses the salon roles that are not on the floor", () => {
    // A family link changes how a booking is grouped and billed, and a
    // receptionist is not the one working out that these two came in
    // together.
    for (const role of ["receptionist", "manager", "owner", "", null, undefined]) {
      expect(canCreateFamilyLinks(role as string), `${role} must not link families`).toBe(false);
    }
  });
});

describe("ownsTenantRow", () => {
  it("matches a row from the staff member's own salon", () => {
    expect(ownsTenantRow(1, 1)).toBe(true);
  });

  it("refuses another salon's row", () => {
    // The single comparison keeping one salon's staff out of another's
    // appointments. It used to be covered only by finding the text
    // "requireApprovedStaffTenant" somewhere in a file, where it appears
    // 24 times.
    expect(ownsTenantRow(1, 2)).toBe(false);
  });

  it("refuses rather than assuming when either side is missing", () => {
    expect(ownsTenantRow(null, 1)).toBe(false);
    expect(ownsTenantRow(1, null)).toBe(false);
    expect(ownsTenantRow(undefined, undefined)).toBe(false);
  });
});

describe("the guards delegate rather than keeping their own copy", () => {
  it("staffAccess.ts holds no inline role or status literals", () => {
    // What this replaces: assertions that grepped routers.ts AND
    // staffAccess.ts concatenated together for
    // `portalStaff.role !== "groomer" && portalStaff.role !== "bather"` —
    // so the test could not even say which file it had found it in.
    const source = readFileSync(new URL("./staffAccess.ts", import.meta.url), "utf8");
    expect(source).toContain("platformAccess(user.role)");
    expect(source).toContain("isApprovedStaffProfile(portalStaff.portalStatus)");
    expect(source).toContain("canCreateFamilyLinks(portalStaff.role)");
    expect(source).not.toContain('role !== "groomer"');
    expect(source).not.toContain('portalStatus !== "approved"');
  });
});
