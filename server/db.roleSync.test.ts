import { describe, expect, it } from "vitest";
import { resolveAutomaticOwnerRole } from "./db";

describe("resolveAutomaticOwnerRole", () => {
  it("assigns administrator only when the owner identity is first created", () => {
    expect(resolveAutomaticOwnerRole({ isOwner: true })).toBe("admin");
    expect(resolveAutomaticOwnerRole({ isOwner: false })).toBeUndefined();
  });

  it("preserves a manually assigned existing staff role during owner sign-in synchronization", () => {
    expect(resolveAutomaticOwnerRole({ isOwner: true, existingRole: "staff" })).toBeUndefined();
  });

  it("honours an explicit role supplied by a trusted caller", () => {
    expect(resolveAutomaticOwnerRole({ isOwner: true, existingRole: "staff", requestedRole: "staff" })).toBe("staff");
    expect(resolveAutomaticOwnerRole({ isOwner: false, requestedRole: "admin" })).toBe("admin");
  });
});
