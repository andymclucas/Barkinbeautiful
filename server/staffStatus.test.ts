import { describe, expect, it } from "vitest";
import { isActiveStaffValue } from "../client/src/lib/staffStatus";

describe("isActiveStaffValue", () => {
  it("keeps active and legacy unset staff visible", () => {
    expect(isActiveStaffValue(true)).toBe(true);
    expect(isActiveStaffValue(1)).toBe(true);
    expect(isActiveStaffValue(undefined)).toBe(true);
    expect(isActiveStaffValue(null)).toBe(true);
  });

  it("only hides staff explicitly flagged inactive", () => {
    expect(isActiveStaffValue(false)).toBe(false);
    expect(isActiveStaffValue(0)).toBe(false);
    expect(isActiveStaffValue("0")).toBe(false);
  });
});
