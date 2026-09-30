import { describe, it, expect } from "vitest";
import {
  requireApprovedStaffTenant,
  requireApprovedFamilyLinkStaff,
  requireApprovedStaffAppointmentAccess,
  requireApprovedStaffPetAccess,
} from "./staffAccess";

/**
 * Real behaviour tests for the appointment access guards.
 *
 * These used to be asserted by grepping routers.ts for the error strings,
 * which passes whether or not the guard is wired to anything. Now that the
 * guards are their own module taking `db` as a parameter, a fake db exercises
 * the decisions directly - and a restricted staff account reaching another
 * salon's dog is the kind of bug that must fail a test, not a text search.
 */

/** Minimal stand-in for the drizzle query builder these guards use. */
function fakeDb(rows: Record<string, any[]>) {
  let table = "";
  const builder: any = {
    select: () => builder,
    from: (t: any) => {
      // The drizzle table object carries its SQL name on a symbol; the plain
      // string fallback keeps this readable when that internal changes.
      const name = Object.getOwnPropertySymbols(t)
        .map((sym) => (t as any)[sym])
        .find((value) => typeof value === "string" && value in rows);
      table = name ?? "";
      return builder;
    },
    where: () => builder,
    limit: () => Promise.resolve(rows[table] ?? []),
  };
  return builder;
}

const approvedGroomer = { id: 5, tenantId: 1, role: "groomer", portalStatus: "approved" };
const staffUser = { id: 50, role: "staff" };
const adminUser = { id: 1, role: "admin" };

describe("requireApprovedStaffTenant", () => {
  it("lets an administrator straight through with no staff profile", async () => {
    // Admins are not scoped to a salon, so there is nothing to return.
    await expect(requireApprovedStaffTenant(fakeDb({}), adminUser)).resolves.toBeNull();
  });

  it("rejects an ordinary signed-in user who is not staff", async () => {
    await expect(requireApprovedStaffTenant(fakeDb({}), { id: 9, role: "user" }))
      .rejects.toThrow(/Only approved staff/);
  });

  it("rejects a staff account that has not been approved yet", async () => {
    const db = fakeDb({ staff: [{ ...approvedGroomer, portalStatus: "pending" }] });
    await expect(requireApprovedStaffTenant(db, staffUser)).rejects.toThrow(/awaiting administrator approval/);
  });

  it("rejects a staff user with no staff profile at all", async () => {
    await expect(requireApprovedStaffTenant(fakeDb({ staff: [] }), staffUser))
      .rejects.toThrow(/awaiting administrator approval/);
  });

  it("returns the salon profile for approved staff", async () => {
    const db = fakeDb({ staff: [approvedGroomer] });
    await expect(requireApprovedStaffTenant(db, staffUser)).resolves.toMatchObject({ tenantId: 1, role: "groomer" });
  });
});

describe("requireApprovedStaffAppointmentAccess", () => {
  it("refuses an appointment belonging to another salon", async () => {
    // The tenant check is the multi-tenant boundary: without it an approved
    // groomer at one salon could open any appointment by guessing an id.
    const db = fakeDb({
      staff: [approvedGroomer],
      appointments: [{ id: 77, tenantId: 2, petId: 3 }],
    });
    await expect(requireApprovedStaffAppointmentAccess(db, staffUser, 77))
      .rejects.toThrow(/not available to your salon staff profile/);
  });

  it("refuses an appointment that does not exist", async () => {
    const db = fakeDb({ staff: [approvedGroomer], appointments: [] });
    await expect(requireApprovedStaffAppointmentAccess(db, staffUser, 77))
      .rejects.toThrow(/not available to your salon staff profile/);
  });

  it("refuses when the appointment is for a different pet than claimed", async () => {
    const db = fakeDb({
      staff: [approvedGroomer],
      appointments: [{ id: 77, tenantId: 1, petId: 3 }],
    });
    await expect(requireApprovedStaffAppointmentAccess(db, staffUser, 77, 4))
      .rejects.toThrow(/not available to your salon staff profile/);
  });

  it("allows an appointment in the staff member's own salon", async () => {
    const db = fakeDb({
      staff: [approvedGroomer],
      appointments: [{ id: 77, tenantId: 1, petId: 3 }],
    });
    await expect(requireApprovedStaffAppointmentAccess(db, staffUser, 77, 3))
      .resolves.toMatchObject({ tenantId: 1 });
  });

  it("does not query the appointment at all for an administrator", async () => {
    // Admin short-circuits before the appointment lookup; an empty table here
    // proves the guard is not silently depending on it.
    await expect(requireApprovedStaffAppointmentAccess(fakeDb({}), adminUser, 77)).resolves.toBeNull();
  });
});

describe("requireApprovedFamilyLinkStaff", () => {
  it("allows groomers and bathers", async () => {
    for (const role of ["groomer", "bather"]) {
      const db = fakeDb({ staff: [{ ...approvedGroomer, role }] });
      await expect(requireApprovedFamilyLinkStaff(db, staffUser)).resolves.toMatchObject({ role });
    }
  });

  it("refuses a receptionist", async () => {
    const db = fakeDb({ staff: [{ ...approvedGroomer, role: "receptionist" }] });
    await expect(requireApprovedFamilyLinkStaff(db, staffUser))
      .rejects.toThrow(/Only approved Groomers and Bathers/);
  });
});

describe("requireApprovedStaffPetAccess", () => {
  it("refuses a dog belonging to another salon", async () => {
    const db = fakeDb({ staff: [approvedGroomer], pets: [{ id: 3, tenantId: 2 }] });
    await expect(requireApprovedStaffPetAccess(db, staffUser, 3))
      .rejects.toThrow(/not available to your salon staff profile/);
  });

  it("allows a dog in the staff member's own salon", async () => {
    const db = fakeDb({ staff: [approvedGroomer], pets: [{ id: 3, tenantId: 1 }] });
    await expect(requireApprovedStaffPetAccess(db, staffUser, 3)).resolves.toMatchObject({ tenantId: 1 });
  });
});
