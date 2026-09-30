import { describe, it, expect } from "vitest";
import { canAdministerStaff, STAFF_ADMINISTRATOR_USER_IDS } from "../shared/staffAdministrators";

/**
 * Who may edit someone else's staff record.
 *
 * Worth real tests rather than a source grep: four of the salon's groomers
 * hold `users.role = "admin"` because that was how they were given access to
 * the floor, and until now that also let them edit anyone's personnel
 * details. Getting this wrong in either direction is bad - too tight and the
 * owner cannot manage her own team, too loose and it never changed anything.
 */
describe("canAdministerStaff", () => {
  it("allows the owner and Andy by user id", () => {
    expect(canAdministerStaff({ id: 1, email: "anything@example.com" })).toBe(true);
    expect(canAdministerStaff({ id: 30001, email: null })).toBe(true);
  });

  it("allows them by email too, so a recreated account still works", () => {
    expect(canAdministerStaff({ id: 999999, email: "barkinbeautiful@hotmail.com.au" })).toBe(true);
    expect(canAdministerStaff({ id: 999999, email: "MCLUCAS.ANDY@GMAIL.COM" })).toBe(true);
    expect(canAdministerStaff({ id: 999999, email: "  mclucas.andy@gmail.com  " })).toBe(true);
  });

  it("refuses the groomers who happen to hold the admin role", () => {
    // These four are real: Megs, Charlotte, Zakaria and Brooklyn are all
    // users.role = "admin" and could edit anyone before this existed.
    for (const u of [
      { id: 105570008, email: "mmfox88@hotmail.com" },
      { id: 105840001, email: "charlottepurcell18@gmail.com" },
      { id: 106020001, email: "zakariaromari@live.com" },
      { id: 131700001, email: "cosseybrooklyn20@gmail.com" },
    ]) {
      expect(canAdministerStaff(u)).toBe(false);
    }
  });

  it("refuses an absent or empty user rather than defaulting open", () => {
    expect(canAdministerStaff(null)).toBe(false);
    expect(canAdministerStaff(undefined)).toBe(false);
    expect(canAdministerStaff({})).toBe(false);
    expect(canAdministerStaff({ id: null, email: "" })).toBe(false);
    expect(canAdministerStaff({ id: undefined, email: "   " })).toBe(false);
  });

  it("does not match a lookalike address", () => {
    expect(canAdministerStaff({ email: "mclucas.andy@gmail.com.attacker.test" })).toBe(false);
    expect(canAdministerStaff({ email: "not-barkinbeautiful@hotmail.com.au" })).toBe(false);
  });

  it("keeps the allowlist to exactly two people", () => {
    expect(STAFF_ADMINISTRATOR_USER_IDS).toHaveLength(2);
  });
});
